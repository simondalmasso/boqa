#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  PUBLIC_DASHBOARD_FILES,
  listBundleFiles,
  verifyBuildObject,
} = require('./build-safe-lab-preview-bundle');
const { canonicalJson } = require('../lib/safe-lab-hunter-contract-v1');
const { sha256 } = require('../lib/safe-lab-contract-common-v1');

const START = '// BOQA_SAFE_LAB_PREVIEW_BUILD_START';
const END = '// BOQA_SAFE_LAB_PREVIEW_BUILD_END';
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const CHECKSUM_PATTERN = /^([a-f0-9]{64})  ([A-Za-z0-9._/-]+)$/;

function fail(code, detail) { const error = new Error(detail ? `${code}:${detail}` : code); error.code = code; throw error; }

function parseEmbeddedBuild(workerSource) {
  const start = workerSource.indexOf(START);
  const end = workerSource.indexOf(END);
  if (start < 0 || end <= start) fail('WORKER_BUILD_MARKER_MISSING');
  const block = workerSource.slice(start + START.length, end);
  const match = /const SAFE_LAB_PREVIEW_BUILD = Object\.freeze\(([\s\S]+)\);\s*$/.exec(block.trim());
  if (!match) fail('EMBEDDED_BUILD_INVALID');
  let build;
  try { build = JSON.parse(match[1]); } catch (_) { fail('EMBEDDED_BUILD_INVALID_JSON'); }
  verifyBuildObject(build);
  return build;
}

function verifyChecksums(root) {
  const checksumPath = path.join(root, 'SHA256SUMS');
  if (!fs.existsSync(checksumPath)) fail('BUNDLE_CHECKSUM_FILE_MISSING');
  const entries = new Map();
  for (const line of fs.readFileSync(checksumPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const match = CHECKSUM_PATTERN.exec(line);
    if (!match) fail('BUNDLE_CHECKSUM_FORMAT_INVALID');
    if (entries.has(match[2])) fail('BUNDLE_CHECKSUM_DUPLICATE', match[2]);
    entries.set(match[2], match[1]);
  }
  const actual = listBundleFiles(root).filter((file) => file !== 'SHA256SUMS');
  if (actual.length !== entries.size) fail('BUNDLE_FILE_SET_MISMATCH');
  for (const relative of actual) {
    if (!entries.has(relative)) fail('BUNDLE_UNCHECKSUMMED_FILE', relative);
    if (sha256(fs.readFileSync(path.join(root, relative))) !== entries.get(relative)) fail('BUNDLE_CHECKSUM_MISMATCH', relative);
  }
  return actual;
}

function verifyWrangler(raw) {
  if (/--keep-vars\b/.test(raw)) fail('KEEP_VARS_PRESENT');
  if (/^\s*account_id\s*=/m.test(raw)) fail('PRODUCTIVE_ACCOUNT_BINDING_PRESENT');
  if (/^\s*\[vars\]\s*$/m.test(raw) || /BOQA_BACKEND_URL|BOQA_API_KEY|BOQA_HMAC_SECRET/.test(raw)) fail('PRODUCTIVE_BACKEND_VAR_PRESENT');
  const bindings = [...raw.matchAll(/^\s*binding\s*=\s*"([^"]+)"/gm)].map((match) => match[1]);
  if (bindings.length !== 1 || bindings[0] !== 'ASSETS') fail('PRODUCTIVE_OR_UNKNOWN_BINDING_PRESENT');
  if (!/^\s*preview_urls\s*=\s*true\s*$/m.test(raw)) fail('PREVIEW_URLS_NOT_ENABLED');
}

function verifySafeLabPreviewBundle(bundleDir, expectedSourceSha) {
  if (!SHA_PATTERN.test(String(expectedSourceSha || ''))) fail('EXTERNAL_EXPECTED_HEAD_INVALID');
  const root = path.resolve(bundleDir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail('BUNDLE_DIR_INVALID');
  const files = verifyChecksums(root);
  const expectedFiles = [
    'SHA256SUMS', 'promotion-policy.json', 'worker.js', 'wrangler.toml',
    ...PUBLIC_DASHBOARD_FILES.map((file) => `dashboard/${file}`),
  ].sort();
  if (canonicalJson(listBundleFiles(root)) !== canonicalJson(expectedFiles)) fail('BUNDLE_FILE_SET_MISMATCH');
  const build = parseEmbeddedBuild(fs.readFileSync(path.join(root, 'worker.js'), 'utf8'));
  if (build.source_sha !== expectedSourceSha) fail('EXTERNAL_EXPECTED_HEAD_MISMATCH');
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'promotion-policy.json'), 'utf8'));
  if (policy.source_sha !== expectedSourceSha || policy.contract_checksum !== build.contract_checksum) fail('PROMOTION_POLICY_IDENTITY_MISMATCH');
  if (policy.promotion_ready !== false || policy.promotion_blocker !== 'CONTROLLED_LAB_PREVIEW' || policy.production_changed !== false || policy.deploy_performed !== false) fail('PROMOTION_POLICY_INVALID');
  verifyWrangler(fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8'));
  const index = fs.readFileSync(path.join(root, 'dashboard', 'index.html'), 'utf8');
  if (!index.includes(`data-environment="controlled_lab"`) || !index.includes(`data-source-sha="${expectedSourceSha}"`) || !index.includes(`data-contract-checksum="${build.contract_checksum}"`)) fail('DASHBOARD_BUILD_IDENTITY_MISMATCH');
  return { validation: 'PASS', source_sha: expectedSourceSha, contract_checksum: build.contract_checksum, files_verified: files.length, promotion_ready: false, production_changed: false };
}

function main() {
  const [bundleDir, expectedSourceSha, reportPath] = process.argv.slice(2);
  if (!bundleDir || !expectedSourceSha || !reportPath) {
    console.error('Usage: node scripts/verify-safe-lab-preview-bundle.js <bundle-dir> <external-expected-head-sha> <report-json>');
    process.exit(2);
  }
  try {
    const report = verifySafeLabPreviewBundle(bundleDir, expectedSourceSha);
    const output = path.resolve(reportPath);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${canonicalJson(report)}\n`, { flag: 'wx' });
    process.stdout.write('PASS\n');
  } catch (error) { console.error(error.code || error.message); process.exit(1); }
}

if (require.main === module) main();
module.exports = { parseEmbeddedBuild, verifyChecksums, verifySafeLabPreviewBundle, verifyWrangler };
