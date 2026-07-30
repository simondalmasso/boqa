'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { canonicalJson, validateClosedContract } = require('../lib/safe-lab-hunter-contract-v1');
const { buildSafeLabPreviewBundle, writeBundleChecksums } = require('../scripts/build-safe-lab-preview-bundle');
const { verifySafeLabPreviewBundle, verifyWrangler } = require('../scripts/verify-safe-lab-preview-bundle');

const ROOT = path.join(__dirname, '..');
const SHA = 'a'.repeat(40);
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
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

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-bundle-verifier-'));
  const contractPath = path.join(root, 'hunter-status-public.json');
  const raw = `${canonicalJson(contract())}\n`;
  fs.writeFileSync(contractPath, raw);
  fs.writeFileSync(`${contractPath}.sha256`, `${digest(raw)}  ${path.basename(contractPath)}\n`);
  const bundle = path.join(root, 'bundle');
  buildSafeLabPreviewBundle({ root: ROOT, contractPath, checksumPath: `${contractPath}.sha256`, expectedSourceSha: SHA, outputDir: bundle, mode: 'true' });
  return { root, bundle };
}

function test(name, fn) { fn(); count += 1; console.log(`ok ${count} - ${name}`); }
function rejects(name, fn, code) { test(name, () => assert.throws(fn, (error) => error.code === code)); }

const valid = fixture();
test('bundle passes independent verification with external expected head', () => {
  const report = verifySafeLabPreviewBundle(valid.bundle, SHA);
  assert.equal(report.validation, 'PASS');
  assert.equal(report.source_sha, SHA);
  assert.equal(report.promotion_ready, false);
});
rejects('external expected head mismatch', () => verifySafeLabPreviewBundle(valid.bundle, '9'.repeat(40)), 'EXTERNAL_EXPECTED_HEAD_MISMATCH');
const mutated = fixture();
fs.appendFileSync(path.join(mutated.bundle, 'worker.js'), '\n// mutation\n');
rejects('old checksum after contract or worker mutation', () => verifySafeLabPreviewBundle(mutated.bundle, SHA), 'BUNDLE_CHECKSUM_MISMATCH');
rejects('keep-vars is forbidden', () => verifyWrangler('name="boqa"\n--keep-vars\nbinding="ASSETS"\npreview_urls=true\n'), 'KEEP_VARS_PRESENT');
rejects('productive account binding is forbidden', () => verifyWrangler('account_id="x"\nbinding="ASSETS"\npreview_urls=true\n'), 'PRODUCTIVE_ACCOUNT_BINDING_PRESENT');
rejects('productive backend var is forbidden', () => verifyWrangler('[vars]\nBOQA_BACKEND_URL="https://private"\nbinding="ASSETS"\npreview_urls=true\n'), 'PRODUCTIVE_BACKEND_VAR_PRESENT');
rejects('unknown binding is forbidden', () => verifyWrangler('binding="ASSETS"\nbinding="KV"\npreview_urls=true\n'), 'PRODUCTIVE_OR_UNKNOWN_BINDING_PRESENT');
const identity = fixture();
const indexPath = path.join(identity.bundle, 'dashboard', 'index.html');
fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8').replace(`data-source-sha="${SHA}"`, `data-source-sha="${'9'.repeat(40)}"`));
fs.unlinkSync(path.join(identity.bundle, 'SHA256SUMS'));
writeBundleChecksums(identity.bundle);
rejects('dashboard identity cannot drift from external head', () => verifySafeLabPreviewBundle(identity.bundle, SHA), 'DASHBOARD_BUILD_IDENTITY_MISMATCH');
console.log(`1..${count}`);
