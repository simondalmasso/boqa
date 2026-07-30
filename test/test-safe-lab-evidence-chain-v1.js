'use strict';

const assert = require('assert');
const { verifySafeLabEvidenceChain } = require('../lib/safe-lab-evidence-chain-v1');
const { createFixture, expectedOptions, mutateJson } = require('./support/safe-lab-contract-fixture-v1');

let count = 0;
function test(name, fn) { fn(); count += 1; console.log(`ok ${count} - ${name}`); }
function rejects(name, options, code) {
  test(name, () => assert.throws(() => verifySafeLabEvidenceChain(options), (error) => error.code === code));
}

const fixture = createFixture();
test('strict evidence chain returns authenticated workflow report', () => {
  const result = verifySafeLabEvidenceChain(expectedOptions(fixture));
  assert.equal(result.report.validation, 'PASS');
  assert.equal(result.report.files_verified, 9);
  assert.equal(result.report.workflow.run_attempt, '1');
  assert.equal(result.report.workflow.name, 'BOQA Real Docker Qualification Gate V1');
  assert.equal(result.report.workflow.job, 'qualification');
  assert.equal(result.report.workflow.repository, 'simonkey888/boqa');
});
rejects('workflow attempt mismatch', expectedOptions(fixture, { expectedWorkflowRunAttempt: '2' }), 'WORKFLOW_ATTEMPT_MISMATCH');
rejects('workflow name mismatch', expectedOptions(fixture, { expectedWorkflowName: 'Other Workflow' }), 'WORKFLOW_NAME_MISMATCH');
rejects('workflow job mismatch', expectedOptions(fixture, { expectedWorkflowJob: 'other-job' }), 'WORKFLOW_JOB_MISMATCH');
rejects('repository mismatch', expectedOptions(fixture, { expectedRepository: 'simonkey888/other' }), 'REPOSITORY_MISMATCH');
rejects('external expected head mismatch', expectedOptions(fixture, { expectedSourceSha: '9'.repeat(40) }), 'SOURCE_SHA_MISMATCH');
rejects('workflow attempt is mandatory', expectedOptions(fixture, { expectedWorkflowRunAttempt: '' }), 'WORKFLOW_RUN_ATTEMPT_INVALID');
rejects('workflow name is mandatory', expectedOptions(fixture, { expectedWorkflowName: '' }), 'WORKFLOW_NAME_INVALID');
rejects('workflow job is mandatory', expectedOptions(fixture, { expectedWorkflowJob: '' }), 'WORKFLOW_JOB_INVALID');
rejects('repository is mandatory', expectedOptions(fixture, { expectedRepository: '' }), 'REPOSITORY_INVALID');
const sourceMutation = createFixture();
mutateJson(sourceMutation, sourceMutation.finalName, (value) => { value.source.workflow_run_attempt = '2'; });
rejects('mutated final workflow metadata fails closed', expectedOptions(sourceMutation), 'WORKFLOW_ATTEMPT_MISMATCH');
console.log(`1..${count}`);
