'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { startBoundaryLab } = require('../lab/server');
const { compileBoundary } = require('../compile-boundary');
const { evaluateBoundary } = require('../boundary-oracle');
const { loadKnownFinding } = require('../finding-loader');

const OWNER_TOKEN = 'synthetic-owner-token-for-boqa-005';
const OUTSIDER_TOKEN = 'synthetic-outsider-token-for-boqa-005';

function runGeneratedTest(file, baseUrl) {
  return new Promise((resolve) => {
    const childEnv = {
      ...process.env,
      BOUNDARY_BASE_URL: baseUrl,
      BOUNDARY_OWNER_TOKEN: OWNER_TOKEN,
      BOUNDARY_OUTSIDER_TOKEN: OUTSIDER_TOKEN,
    };
    delete childEnv.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ['--test', file], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

async function withLab(mode, callback) {
  const running = await startBoundaryLab({
    mode,
    host: '127.0.0.1',
    port: 0,
    env: {
      BOUNDARY_OWNER_TOKEN: OWNER_TOKEN,
      BOUNDARY_OUTSIDER_TOKEN: OUTSIDER_TOKEN,
    },
  });
  try {
    return await callback(running);
  } finally {
    await new Promise((resolve) => running.server.close(resolve));
  }
}

test('compiler infers related variants and records TP=3 FP=0 FN=0', async () => {
  await withLab('vulnerable', async ({ baseUrl }) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-vulnerable-'));
    const result = await compileBoundary({
      baseUrl,
      outDir,
      labMode: 'vulnerable',
      ownerToken: OWNER_TOKEN,
      outsiderToken: OUTSIDER_TOKEN,
    });
    assert.deepEqual(result.variants.map((item) => item.route_id), ['project-audit', 'project-export']);
    assert.deepEqual(result.metrics, {
      true_positives: 3,
      false_positives: 0,
      false_negatives: 0,
      true_negatives: 1,
      contradictions: 3,
      protected_cases: 3,
      public_controls: 1,
    });
    assert.equal(result.receipts.length, 4);
    assert.ok(result.receipts.every((item) => item.owner.actor === 'owner_control'));
    assert.ok(result.receipts.every((item) => item.outsider.actor === 'outsider_control'));
    assert.deepEqual(fs.readdirSync(outDir).sort(), [
      'boundary-contract.yaml',
      'boundary-regression.spec.ts',
      'evidence.json',
    ]);
    const generated = await runGeneratedTest(result.files.testFile, baseUrl);
    assert.notEqual(generated.status, 0, 'same permanent test must fail against vulnerable lab');
  });
});

test('same generated standalone test passes against fixed lab', async () => {
  let generatedFile;
  await withLab('vulnerable', async ({ baseUrl }) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-contract-'));
    const result = await compileBoundary({
      baseUrl,
      outDir,
      labMode: 'vulnerable',
      ownerToken: OWNER_TOKEN,
      outsiderToken: OUTSIDER_TOKEN,
    });
    generatedFile = result.files.testFile;
  });
  await withLab('fixed', async ({ baseUrl }) => {
    const generated = await runGeneratedTest(generatedFile, baseUrl);
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-fixed-'));
    const result = await compileBoundary({
      baseUrl,
      outDir,
      labMode: 'fixed',
      ownerToken: OWNER_TOKEN,
      outsiderToken: OUTSIDER_TOKEN,
    });
    assert.equal(result.metrics.contradictions, 0);
    assert.equal(result.metrics.false_positives, 0);
  });
});

test('compiler outputs are deterministic under fixed semantic inputs', async () => {
  await withLab('vulnerable', async ({ baseUrl }) => {
    const left = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-left-'));
    const right = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-right-'));
    await compileBoundary({ baseUrl, outDir: left, labMode: 'vulnerable', ownerToken: OWNER_TOKEN, outsiderToken: OUTSIDER_TOKEN });
    await compileBoundary({ baseUrl, outDir: right, labMode: 'vulnerable', ownerToken: OWNER_TOKEN, outsiderToken: OUTSIDER_TOKEN });
    for (const file of ['boundary-contract.yaml', 'boundary-regression.spec.ts', 'evidence.json']) {
      assert.equal(fs.readFileSync(path.join(left, file), 'utf8'), fs.readFileSync(path.join(right, file), 'utf8'));
    }
  });
});

test('HTTP 200 without semantic private evidence is not a contradiction', () => {
  const finding = loadKnownFinding();
  const result = evaluateBoundary({
    candidate: { id: 'public-control', route_id: 'project-summary', concrete_path: '/api/projects/project-alpha/summary' },
    owner: { status: 200, semantic: { kind: 'public_project_summary', marker: 'project-public:project-alpha' } },
    outsider: { status: 200, semantic: { kind: 'public_project_summary', marker: 'project-public:project-alpha' } },
  }, finding);
  assert.equal(result.contradiction, false);
  assert.match(result.basis, /status_is_not_treated_as_authority/);
});
