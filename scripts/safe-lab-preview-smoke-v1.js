#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { canonicalJson, expectedContractStatusAt, validateClosedContract } = require('../lib/safe-lab-hunter-contract-v1');
const { sha256 } = require('../lib/safe-lab-contract-common-v1');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.resolve(process.env.BOQA_OUTPUT_DIR || path.join(ROOT, 'output', 'safe-lab-hunter-preview-v1'));
const PREVIEW_URL = String(process.env.BOQA_PREVIEW_URL || '').replace(/\/$/, '');
const EXPECTED_SHA = String(process.env.BOQA_HEAD_SHA || '').trim();

if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev$/i.test(PREVIEW_URL)) throw new Error('INVALID_PREVIEW_URL');
if (!/^[a-f0-9]{40}$/.test(EXPECTED_SHA)) throw new Error('INVALID_EXPECTED_HEAD');
fs.mkdirSync(path.join(OUTPUT, 'browser'), { recursive: true });

async function fetchJson(pathname, options = {}) {
  const response = await fetch(`${PREVIEW_URL}${pathname}`, { redirect: 'manual', cache: 'no-store', ...options });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch (_) {}
  return { response, text, payload };
}

function exactKeys(value, keys, context) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${context}:NOT_OBJECT`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${context}:FIELDS`);
}

async function verifyContracts(evidence) {
  const hunterResult = await fetchJson('/api/hunter/status');
  assert.equal(hunterResult.response.status, 200, 'HUNTER_HTTP');
  assert.match(hunterResult.response.headers.get('content-type') || '', /^application\/json/i, 'HUNTER_CONTENT_TYPE');
  assert.equal(hunterResult.response.headers.get('cache-control'), 'no-store, max-age=0', 'HUNTER_CACHE');
  validateClosedContract(hunterResult.payload);
  assert.equal(hunterResult.payload.source_sha, EXPECTED_SHA, 'HUNTER_SOURCE_SHA');
  assert.equal(hunterResult.payload.reportable, false, 'HUNTER_REPORTABLE');
  assert.equal(expectedContractStatusAt(hunterResult.payload, Date.now()), 'FRESH', 'HUNTER_NOT_FRESH_AT_SMOKE');
  const canonical = `${canonicalJson(hunterResult.payload)}\n`;
  const contractChecksum = `sha256:${sha256(canonical)}`;

  const firstHealth = await fetchJson('/api/health');
  const secondHealth = await fetchJson('/health');
  assert.equal(firstHealth.response.status, 200, 'API_HEALTH_HTTP');
  assert.equal(secondHealth.response.status, 200, 'ROOT_HEALTH_HTTP');
  assert.deepEqual(secondHealth.payload, firstHealth.payload, 'HEALTH_ENDPOINT_DRIFT');
  exactKeys(firstHealth.payload, [
    'schema_version', 'environment', 'status', 'mode', 'reportable', 'source_sha', 'contract_checksum',
    'observed_at', 'fresh_until', 'unavailable_after', 'promotion_ready', 'promotion_blocker',
  ], 'HEALTH');
  assert.equal(firstHealth.payload.source_sha, EXPECTED_SHA, 'HEALTH_SOURCE_SHA');
  assert.equal(firstHealth.payload.contract_checksum, contractChecksum, 'HEALTH_CONTRACT_CHECKSUM');
  assert.equal(firstHealth.payload.observed_at, hunterResult.payload.observed_at, 'HEALTH_TIMESTAMP_NOT_IMMUTABLE');
  assert.equal(firstHealth.payload.promotion_ready, false, 'HEALTH_PROMOTION_READY');
  assert.equal(firstHealth.payload.promotion_blocker, 'CONTROLLED_LAB_PREVIEW', 'HEALTH_PROMOTION_BLOCKER');

  const methodReject = await fetchJson('/api/hunter/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(methodReject.response.status, 404, 'NON_GET_NOT_HIDDEN');
  assert.deepEqual(methodReject.payload, { error: 'not_found' }, 'NON_GET_BODY');
  for (const pathname of ['/api/private/billing', '/api/private/billing/data', '/ws', '/api/metrics']) {
    const hidden = await fetchJson(pathname);
    assert.equal(hidden.response.status, 404, `PRIVATE_NOT_HIDDEN:${pathname}`);
    assert.deepEqual(hidden.payload, { error: 'not_found' }, `PRIVATE_BODY:${pathname}`);
  }

  evidence.contract = {
    source_sha: EXPECTED_SHA,
    contract_checksum: contractChecksum,
    observed_at: hunterResult.payload.observed_at,
    fresh_until: hunterResult.payload.fresh_until,
    unavailable_after: hunterResult.payload.unavailable_after,
    status: 'FRESH',
    health_identical: true,
    private_routes_hidden: true,
  };
  return { hunter: hunterResult.payload, health: firstHealth.payload };
}

function wireDiagnostics(page, result) {
  page.on('pageerror', (error) => result.page_errors.push(error.message || String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') result.console_errors.push(message.text());
  });
  page.on('requestfailed', (request) => result.failed_requests.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
  page.on('request', (request) => {
    const target = new URL(request.url());
    const preview = new URL(PREVIEW_URL);
    if (target.origin !== preview.origin) result.unauthorized_requests.push(request.url());
  });
}

async function smokeViewport(browser, viewport, label) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const result = {
    label,
    viewport,
    page_errors: [],
    console_errors: [],
    failed_requests: [],
    unauthorized_requests: [],
  };
  wireDiagnostics(page, result);
  const response = await page.goto(PREVIEW_URL, { waitUntil: 'networkidle', timeout: 60_000 });
  assert(response && response.ok(), `${label}:NAVIGATION_FAILED`);
  await page.waitForFunction(() => document.getElementById('overall-state')?.textContent === 'FRESH', null, { timeout: 30_000 });
  assert.equal((await page.locator('#lab-banner').isVisible()), true, `${label}:LAB_BANNER_HIDDEN`);
  assert.match(await page.locator('#lab-banner').textContent(), /LAB CONTROLADO/, `${label}:LAB_LABEL_MISSING`);
  assert.equal(await page.locator('#hunter-view-state').textContent(), 'FRESH', `${label}:HUNTER_NOT_FRESH`);
  assert.equal(await page.locator('#health-view-state').textContent(), 'FRESH', `${label}:HEALTH_NOT_FRESH`);
  assert.equal(await page.locator('#lab-reportable').textContent(), 'NO', `${label}:REPORTABLE_LABEL`);
  assert.equal(await page.locator('#hunt-live').getAttribute('data-mode'), 'lab-complete', `${label}:HUNTER_ANIMATION_STATE`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, `${label}:HORIZONTAL_OVERFLOW`);
  await page.waitForTimeout(250);
  assert.equal(result.page_errors.length, 0, `${label}:PAGE_ERRORS:${result.page_errors.join('|')}`);
  assert.equal(result.console_errors.length, 0, `${label}:CONSOLE_ERRORS:${result.console_errors.join('|')}`);
  assert.equal(result.failed_requests.length, 0, `${label}:FAILED_REQUESTS:${JSON.stringify(result.failed_requests)}`);
  assert.equal(result.unauthorized_requests.length, 0, `${label}:UNAUTHORIZED_REQUESTS:${JSON.stringify(result.unauthorized_requests)}`);
  await page.screenshot({ path: path.join(OUTPUT, 'browser', `${label}.png`), fullPage: true });
  result.horizontal_overflow = false;
  result.overall_state = 'FRESH';
  await context.close();
  return result;
}

async function main() {
  const evidence = {
    schema_version: 1,
    preview_url: PREVIEW_URL,
    source_sha: EXPECTED_SHA,
    version_id: process.env.BOQA_VERSION_ID || null,
    production_changed: false,
    deploy_performed: false,
    started_at: new Date().toISOString(),
  };
  let browser;
  try {
    await verifyContracts(evidence);
    browser = await chromium.launch({ headless: true });
    evidence.viewports = [];
    evidence.viewports.push(await smokeViewport(browser, { width: 1440, height: 900 }, 'desktop-1440'));
    evidence.viewports.push(await smokeViewport(browser, { width: 390, height: 844 }, 'mobile-390'));
    evidence.viewports.push(await smokeViewport(browser, { width: 360, height: 800 }, 'mobile-360'));
    evidence.pageerror_count = 0;
    evidence.console_critical_count = 0;
    evidence.overflow_count = 0;
    evidence.unauthorized_egress_count = 0;
    evidence.validation = 'PASS';
  } catch (error) {
    evidence.validation = 'FAIL';
    evidence.error = error.message || String(error);
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    evidence.completed_at = new Date().toISOString();
    fs.writeFileSync(path.join(OUTPUT, 'browser-smoke-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
