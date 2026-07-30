'use strict';

const assert = require('assert');
const {
  expectedContractStatusAt,
  generateSafeLabHunterContract,
  validateClosedContract,
  validateContractTemporalState,
} = require('../lib/safe-lab-hunter-contract-v1');
const { createFixture, expectedOptions } = require('./support/safe-lab-contract-fixture-v1');

let count = 0;
function test(name, fn) { fn(); count += 1; console.log(`ok ${count} - ${name}`); }
function rejects(name, fn, code) { test(name, () => assert.throws(fn, (error) => error.code === code)); }

const fixture = createFixture();
const generated = generateSafeLabHunterContract(expectedOptions(fixture));
test('fresh status matches immutable window at generation', () => {
  assert.equal(generated.contract.status, 'FRESH');
  assert.equal(expectedContractStatusAt(generated.contract, fixture.identity.nowMs), 'FRESH');
});
rejects('validation after fresh_until rejects stale FRESH claim', () => {
  validateContractTemporalState(generated.contract, Date.parse(generated.contract.fresh_until) + 1);
}, 'CONTRACT_STATUS_TIME_MISMATCH');
test('expected status becomes stale without mutating the contract', () => {
  const original = JSON.stringify(generated.contract);
  assert.equal(expectedContractStatusAt(generated.contract, Date.parse(generated.contract.fresh_until) + 1), 'STALE');
  assert.equal(JSON.stringify(generated.contract), original);
});
test('expected status becomes unavailable after immutable deadline', () => {
  assert.equal(expectedContractStatusAt(generated.contract, Date.parse(generated.contract.unavailable_after) + 1), 'UNAVAILABLE');
});
rejects('future observation rejected', () => {
  expectedContractStatusAt(generated.contract, Date.parse(generated.contract.observed_at) - 1);
}, 'CONTRACT_TIMESTAMP_FUTURE');
rejects('unknown public field rejected', () => {
  validateClosedContract({ ...generated.contract, extra: true });
}, 'CONTRACT_FIELDS_INVALID');
rejects('timestamp ordering is closed', () => {
  validateClosedContract({ ...generated.contract, fresh_until: generated.contract.observed_at });
}, 'CONTRACT_TIMESTAMPS_INCONSISTENT');
rejects('workflow metadata is required by generator', () => {
  generateSafeLabHunterContract(expectedOptions(fixture, { expectedRepository: '' }));
}, 'REPOSITORY_INVALID');
console.log(`1..${count}`);
