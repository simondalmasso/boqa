'use strict';

const assert = require('assert');
const cryptoModule = require('crypto');
const fs = require('fs');
const path = require('path');
const { canonicalJson, validateClosedContract } = require('../lib/safe-lab-hunter-contract-v1');
const { replaceBuildBlock } = require('../scripts/build-safe-lab-preview-bundle');
if (!globalThis.crypto) globalThis.crypto = cryptoModule.webcrypto;

const ROOT = path.join(__dirname, '..');
const SHA = 'a'.repeat(40);
const digest = (value) => cryptoModule.createHash('sha256').update(value).digest('hex');
let count = 0;

function contract() {
  const value = {
    schema_version: 1, environment: 'controlled_lab', status: 'FRESH', hunter_state: 'LAB_COMPLETE', reportable: false,
    authorized_scope: 'synthetic_fixture', target_kind: 'owasp_juice_shop_pinned', policy_id: 'safe-lab-readonly-v1',
    source_sha: SHA, run_id: 'sha256:0123456789abcdef', cycle_started_at: '2026-07-23T03:00:00.000Z',
    cycle_finished_at: '2026-07-23T03:00:01.000Z', observed_at: '2026-07-23T03:00:02.000Z',
    fresh_until: '2026-07-23T03:01:32.000Z', unavailable_after: '2026-07-24T03:00:02.000Z',
    finding_count: 1, control_finding_count: 0, false_positive_count: 0, false_negative_count: 0,
    unauthorized_connection_count: 0, cleanup_verified: true, egress_blocked: true, request_budget_verified: true,
    evidence_checksum: `sha256:${'b'.repeat(64)}`, message: 'Validación completada en laboratorio controlado',
  };
  validateClosedContract(value);
  return value;
}

function build(value) {
  return {
    enabled: true,
    source_sha: value.source_sha,
    contract_checksum: `sha256:${digest(`${canonicalJson(value)}\n`)}`,
    promotion_ready: false,
    promotion_blocker: 'CONTROLLED_LAB_PREVIEW',
    contract: value,
  };
}

async function importWorker() {
  const source = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
  const compiled = replaceBuildBlock(source, build(contract()));
  return (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}#${cryptoModule.randomUUID()}`)).default;
}

async function test(name, fn) { await fn(); count += 1; console.log(`ok ${count} - ${name}`); }

async function main() {
  const worker = await importWorker();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('BACKEND_FETCH_FORBIDDEN_IN_LAB'); };
  try {
    await test('lab hunter and both health paths never fetch backend', async () => {
      for (const pathname of ['/api/hunter/status', '/api/health', '/health']) {
        const response = await worker.fetch(new Request(`https://preview.invalid${pathname}`), {
          BOQA_BACKEND_URL: 'https://backend.invalid', BOQA_API_KEY: 'key', BOQA_HMAC_SECRET: 'secret',
        });
        assert.equal(response.status, 200);
      }
      assert.equal(fetchCalls, 0);
    });
    await test('health timestamp is immutable on second request', async () => {
      const first = await (await worker.fetch(new Request('https://preview.invalid/health'), {})).json();
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await (await worker.fetch(new Request('https://preview.invalid/health'), {})).json();
      assert.deepEqual(second, first);
      assert.equal(first.observed_at, contract().observed_at);
    });
    await test('lab api health and root health are identical closed contracts', async () => {
      const api = await (await worker.fetch(new Request('https://preview.invalid/api/health'), {})).json();
      const root = await (await worker.fetch(new Request('https://preview.invalid/health'), {})).json();
      assert.deepEqual(api, root);
      assert.deepEqual(Object.keys(api).sort(), [
        'contract_checksum', 'environment', 'fresh_until', 'mode', 'observed_at', 'promotion_blocker',
        'promotion_ready', 'reportable', 'schema_version', 'source_sha', 'status', 'unavailable_after',
      ]);
    });
    await test('lab hides websocket and unknown api generically', async () => {
      for (const pathname of ['/ws', '/api/metrics', '/api/private/billing']) {
        const response = await worker.fetch(new Request(`https://preview.invalid${pathname}`), {});
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { error: 'not_found' });
      }
      assert.equal(fetchCalls, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(`1..${count}`);
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
