#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { sha256 } = require('../lib/safe-lab-contract-common-v1');

const output = path.resolve(process.env.BOQA_OUTPUT_DIR || path.join(__dirname, '..', 'output', 'safe-lab-hunter-preview-v1'));
function readJson(name) { return JSON.parse(fs.readFileSync(path.join(output, name), 'utf8')); }
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function listFiles(root) {
  const files = [];
  (function walk(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(`ARTIFACT_SYMLINK_FORBIDDEN:${relative}`);
      if (entry.isDirectory()) walk(absolute, relative);
      else if (entry.isFile()) files.push(relative);
    }
  }(root));
  return files.sort();
}

try {
  const worker = readJson('worker-version.json');
  const browser = readJson('browser-smoke-evidence.json');
  const embedded = readJson('embedded-contract-verification.json');
  const evidence = readJson('evidence-validation-report.json');
  const temporal = readJson('temporal-state-report.json');
  const policy = readJson('promotion-policy.json');
  if (worker.candidate_traffic_percentage !== 0 || worker.stable_traffic_percentage !== 100) fail('TRAFFIC_INVARIANT_FAILED');
  if (worker.production_changed !== false || worker.deploy_performed !== false) fail('PRODUCTION_MUTATION_DETECTED');
  if (worker.promotion_ready !== false || worker.promotion_blocker !== 'CONTROLLED_LAB_PREVIEW') fail('PROMOTION_POLICY_INVALID');
  if (browser.validation !== 'PASS' || browser.pageerror_count !== 0 || browser.console_critical_count !== 0 || browser.overflow_count !== 0 || browser.unauthorized_egress_count !== 0) fail('BROWSER_GATE_FAILED');
  if (embedded.validation !== 'PASS' || evidence.validation !== 'PASS' || temporal.validation !== 'PASS') fail('EVIDENCE_GATE_FAILED');
  if (policy.promotion_ready !== false || policy.production_changed !== false) fail('POLICY_GATE_FAILED');
  if (fs.readFileSync(path.join(output, 'deployment-before.json')).compare(fs.readFileSync(path.join(output, 'deployment-after.json'))) !== 0) fail('ACTIVE_DEPLOYMENT_CHANGED');

  const summary = {
    schema_version: 1,
    validation: 'PASS',
    source_sha: worker.source_sha,
    version_id: worker.version_id,
    preview_url: worker.preview_url,
    candidate_traffic_percentage: 0,
    stable_traffic_percentage: 100,
    bindings: worker.bindings,
    files_verified: embedded.files_verified,
    false_positives: evidence.false_positives,
    false_negatives: evidence.false_negatives,
    unauthorized_connections: evidence.unauthorized_connections,
    cleanup_failures: evidence.cleanup_failures,
    pageerror_count: 0,
    console_critical_count: 0,
    overflow_count: 0,
    unauthorized_egress_count: 0,
    production_changed: false,
    deploy_performed: false,
    promotion_ready: false,
    promotion_blocker: 'CONTROLLED_LAB_PREVIEW',
  };
  fs.writeFileSync(path.join(output, 'final-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
  const files = listFiles(output).filter((file) => file !== 'SHA256SUMS');
  const lines = files.map((file) => `${sha256(fs.readFileSync(path.join(output, file)))}  ${file}`).join('\n');
  fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${lines}\n`, { flag: 'wx' });
  process.stdout.write('PASS\n');
} catch (error) {
  console.error(error.code || error.message);
  process.exit(1);
}
