#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { canonicalJson, generateSafeLabHunterContract } = require('../lib/safe-lab-hunter-contract-v1');

function usage() {
  console.error('Usage: node scripts/generate-safe-lab-contract.js <evidence-dir> <head-sha> <merge-sha> <tree-sha> <workflow-run-id> <output-json> [now-iso]');
  console.error('Required env: BOQA_EXPECTED_WORKFLOW_RUN_ATTEMPT, BOQA_EXPECTED_WORKFLOW_NAME, BOQA_EXPECTED_WORKFLOW_JOB, BOQA_EXPECTED_REPOSITORY');
  process.exit(2);
}

const [evidenceDir, sourceSha, mergeSha, treeSha, workflowRunId, outputJson, nowIso] = process.argv.slice(2);
if (!evidenceDir || !sourceSha || !mergeSha || !treeSha || !workflowRunId || !outputJson) usage();
const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
if (!Number.isFinite(nowMs)) usage();

const metadata = {
  expectedWorkflowRunAttempt: process.env.BOQA_EXPECTED_WORKFLOW_RUN_ATTEMPT,
  expectedWorkflowName: process.env.BOQA_EXPECTED_WORKFLOW_NAME,
  expectedWorkflowJob: process.env.BOQA_EXPECTED_WORKFLOW_JOB,
  expectedRepository: process.env.BOQA_EXPECTED_REPOSITORY,
};
if (Object.values(metadata).some((value) => !value)) usage();

try {
  const generated = generateSafeLabHunterContract({
    evidenceDir,
    expectedSourceSha: sourceSha,
    expectedMergeSha: mergeSha,
    expectedTreeSha: treeSha,
    expectedWorkflowRunId: workflowRunId,
    ...metadata,
    nowMs,
  });
  const outputPath = path.resolve(outputJson);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, generated.json, { flag: 'wx' });
  fs.writeFileSync(`${outputPath}.sha256`, generated.checksumLine(path.basename(outputPath)), { flag: 'wx' });
  const reportPath = process.env.BOQA_EVIDENCE_REPORT_PATH
    ? path.resolve(process.env.BOQA_EVIDENCE_REPORT_PATH)
    : `${outputPath}.validation.json`;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${canonicalJson(generated.evidenceReport)}\n`, { flag: 'wx' });
  process.stdout.write(`${generated.checksum}\n`);
} catch (error) {
  console.error(error.code || error.message);
  process.exit(1);
}
