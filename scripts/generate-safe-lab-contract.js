#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { canonicalJson, generateSafeLabHunterContract } = require('../lib/safe-lab-hunter-contract-v1');

function usage() {
  console.error('Usage: node scripts/generate-safe-lab-contract.js <evidence-dir> <head-sha> <merge-sha> <tree-sha> <run-id> <run-attempt> <workflow-name> <workflow-job> <repository> <output-json> [now-iso]');
  process.exit(2);
}

const [evidenceDir, sourceSha, mergeSha, treeSha, runId, runAttempt, workflowName, workflowJob, repository, outputJson, nowIso] = process.argv.slice(2);
if (!evidenceDir || !sourceSha || !mergeSha || !treeSha || !runId || !runAttempt || !workflowName || !workflowJob || !repository || !outputJson) usage();
const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
if (!Number.isFinite(nowMs)) usage();

try {
  const generated = generateSafeLabHunterContract({
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
  const outputPath = path.resolve(outputJson);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, generated.json, { flag: 'wx' });
  fs.writeFileSync(`${outputPath}.sha256`, generated.checksumLine(path.basename(outputPath)), { flag: 'wx' });
  fs.writeFileSync(`${outputPath}.evidence.json`, `${canonicalJson(generated.evidenceReport)}\n`, { flag: 'wx' });
  process.stdout.write(`${generated.checksum}\n`);
} catch (error) {
  console.error(error.code || error.message);
  process.exit(1);
}
