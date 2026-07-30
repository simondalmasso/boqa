#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { canonicalJson, expectedContractStatusAt, validateClosedContract } = require('../lib/safe-lab-hunter-contract-v1');

const [contractPath, reportPath] = process.argv.slice(2);
if (!contractPath || !reportPath) {
  console.error('Usage: node scripts/verify-safe-lab-temporal-states.js <contract-json> <report-json>');
  process.exit(2);
}
try {
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  validateClosedContract(contract);
  const cases = [
    ['observed', Date.parse(contract.observed_at), 'FRESH'],
    ['fresh_boundary', Date.parse(contract.fresh_until), 'FRESH'],
    ['after_fresh', Date.parse(contract.fresh_until) + 1, 'STALE'],
    ['unavailable_boundary', Date.parse(contract.unavailable_after), 'STALE'],
    ['after_unavailable', Date.parse(contract.unavailable_after) + 1, 'UNAVAILABLE'],
  ].map(([name, nowMs, expected]) => {
    const actual = expectedContractStatusAt(contract, nowMs);
    if (actual !== expected) throw new Error(`TEMPORAL_STATE_MISMATCH:${name}:${actual}:${expected}`);
    return { name, now: new Date(nowMs).toISOString(), expected, actual };
  });
  const output = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${canonicalJson({ validation: 'PASS', source_sha: contract.source_sha, cases })}\n`, { flag: 'wx' });
  process.stdout.write('PASS\n');
} catch (error) {
  console.error(error.code || error.message);
  process.exit(1);
}
