#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { canonicalJson } = require('../lib/safe-lab-contract-common-v1');
const { verifySafeLabEvidenceChain } = require('../lib/safe-lab-evidence-chain-v1');

function usage() {
  console.error('Usage: node scripts/verify-safe-lab-evidence-chain-v1.js <evidence-dir> <head-sha> <merge-sha> <tree-sha> <run-id> <run-attempt> <workflow-name> <workflow-job> <repository> <report-json> [now-iso]');
  process.exit(2);
}

const [evidenceDir, sourceSha, mergeSha, treeSha, runId, runAttempt, workflowName, workflowJob, repository, reportJson, nowIso] = process.argv.slice(2);
if (!evidenceDir || !sourceSha || !mergeSha || !treeSha || !runId || !runAttempt || !workflowName || !workflowJob || !repository || !reportJson) usage();
const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
if (!Number.isFinite(nowMs)) usage();

try {
  const result = verifySafeLabEvidenceChain({
    evidenceDir,
    expectedSourceSha: sourceSha,
    expectedMergeSha: mergeSha,
    expectedTreeSha: treeSha,
    expectedWorkflowRunId: runId,
    expectedWorkflowRunAttempt: runAttempt,
    expectedWorkflowName: workflowName,
    expectedWorkflowJob: workflowJob,
    expectedRepository: repository,
    nowMs,
  });
  const output = path.resolve(reportJson);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${canonicalJson(result.report)}\n`, { flag: 'wx' });
  process.stdout.write('PASS\n');
} catch (error) {
  console.error(error.code || error.message);
  process.exit(1);
}
