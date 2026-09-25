'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { startBoundaryLab } = require('../lab/server');
const { compileBoundary } = require('../compile-boundary');
const { validateLoopbackBaseUrl } = require('../destination-boundary');
const { buildRouteGraph } = require('../route-graph');
const { requestActor } = require('../two-actor-executor');
const { generateStandaloneTest } = require('../exporters/playwright-test');
const {
  loadClosedBoundaryInput,
  EXPECTED_TOP_LEVEL_KEYS,
  FORBIDDEN_INPUT_KEYS,
} = require('../finding-loader');
const { ACTORS, VULNERABLE_GROUND_TRUTH, FIXED_GROUND_TRUTH } = require('../lab/fixtures');
const { evaluateBoundary, calculateMetrics, VERDICTS } = require('../boundary-oracle');

const ACTOR_A_TOKEN = 'synthetic-actor-a-token-boqa-005';
const ACTOR_B_TOKEN = 'synthetic-actor-b-token-boqa-005';



const VALID_LOOPBACK_URLS = Object.freeze([
  'http://127.0.0.1:43117',
  'http://localhost:43117',
  'http://[::1]:43117',
]);

const REJECTED_BASE_URLS = Object.freeze([
  'https://127.0.0.1:43117',
  'http://192.168.1.20:43117',
  'http://10.0.0.8:43117',
  'http://169.254.169.254:80',
  'http://user@localhost:43117',
  'http://user:pass@127.0.0.1:43117',
  'http://localhost:43117/#fragment',
  'http://localhost:43117?mode=vulnerable',
  'http://localhost:43117/api',
  'ftp://localhost:43117',
  'http://127.0.0.1.evil:43117',
  'http://localhost.evil:43117',
  'http://[::2]:43117',
  'http://[fe80::1]:43117',
  'http://127.1:43117',
  'http://2130706433:43117',
  'http://localhost',
  'http://127.0.0.1:0',
  'http://127.0.0.1:65536',
  ' http://127.0.0.1:43117',
]);

function runCompilerCli(baseUrl) {
  return new Promise((resolve) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-cli-guard-'));
    const child = spawn(process.execPath, [
      path.join(__dirname, '..', 'compile-boundary.js'),
      '--base-url', baseUrl,
      '--out-dir', outDir,
      '--lab-mode', 'vulnerable',
    ], {
      env: {
        ...process.env,
        BOQA_ACTOR_A_TOKEN: ACTOR_A_TOKEN,
        BOQA_ACTOR_B_TOKEN: ACTOR_B_TOKEN,
      },
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

function childEnv(baseUrl) {
  const env = {
    ...process.env,
    BOUNDARY_BASE_URL: baseUrl,
    BOQA_ACTOR_A_TOKEN: ACTOR_A_TOKEN,
    BOQA_ACTOR_B_TOKEN: ACTOR_B_TOKEN,
  };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function runGeneratedTest(file, baseUrl) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', file], {
      env: childEnv(baseUrl),
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


function runGeneratedWithFetchAudit(file, baseUrl, { includeTokens = true } = {}) {
  return new Promise((resolve) => {
    const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-standalone-audit-'));
    const auditFile = path.join(auditDir, 'fetch-audit.json');
    const wrapperFile = path.join(auditDir, 'run-generated.js');
    fs.writeFileSync(wrapperFile, `'use strict';
const fs = require('node:fs');
const state = { fetch_calls: 0, authorization_headers: [], requested_urls: [] };
global.fetch = async (url, options = {}) => {
  state.fetch_calls += 1;
  state.requested_urls.push(String(url));
  const headers = options && options.headers;
  const authorization = headers && typeof headers.get === 'function'
    ? headers.get('authorization')
    : headers && (headers.authorization || headers.Authorization);
  if (authorization) state.authorization_headers.push(String(authorization));
  return { status: 500, text: async () => '' };
};
process.on('exit', () => {
  fs.writeFileSync(process.env.BOQA_FETCH_AUDIT_PATH, JSON.stringify(state));
});
require(process.env.BOQA_GENERATED_TEST_FILE);
`, 'utf8');
    const env = {
      ...process.env,
      BOUNDARY_BASE_URL: baseUrl,
      BOQA_GENERATED_TEST_FILE: file,
      BOQA_FETCH_AUDIT_PATH: auditFile,
    };
    if (includeTokens) {
      env.BOQA_ACTOR_A_TOKEN = ACTOR_A_TOKEN;
      env.BOQA_ACTOR_B_TOKEN = ACTOR_B_TOKEN;
    } else {
      delete env.BOQA_ACTOR_A_TOKEN;
      delete env.BOQA_ACTOR_B_TOKEN;
    }
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, [wrapperFile], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status, signal) => {
      const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
      resolve({ status, signal, stdout, stderr, audit });
    });
  });
}

async function withLab(mode, callback) {
  const running = await startBoundaryLab({
    mode,
    host: '127.0.0.1',
    port: 0,
    env: {
      BOQA_ACTOR_A_TOKEN: ACTOR_A_TOKEN,
      BOQA_ACTOR_B_TOKEN: ACTOR_B_TOKEN,
    },
  });
  try {
    return await callback(running);
  } finally {
    await new Promise((resolve) => running.server.close(resolve));
  }
}

function compileAt(baseUrl, mode, outDir) {
  return compileBoundary({
    baseUrl,
    outDir,
    labMode: mode,
    actorAToken: ACTOR_A_TOKEN,
    actorBToken: ACTOR_B_TOKEN,
  });
}

function ownerReceipt(expected) {
  return {
    status: 200,
    semantic: {
      kind: 'private_invoice',
      tenant_id: expected.tenant_id,
      user_id: expected.user_id,
      account_id: expected.account_id,
      invoice_id: expected.invoice_id,
      resource_id: expected.invoice_id,
      marker: expected.marker,
    },
  };
}

function denialReceipt() {
  return { status: 403, semantic: { error: 'forbidden' } };
}

function validReceiptSet() {
  return {
    actor_a_own: ownerReceipt(ACTORS.actor_a),
    actor_b_own: ownerReceipt(ACTORS.actor_b),
    actor_a_cross: denialReceipt(),
    actor_b_cross: denialReceipt(),
    expected_actor_a: ACTORS.actor_a,
    expected_actor_b: ACTORS.actor_b,
  };
}



test('shared destination boundary accepts only the three exact loopback URL forms', () => {
  for (const baseUrl of VALID_LOOPBACK_URLS) {
    assert.equal(validateLoopbackBaseUrl(baseUrl), baseUrl);
    assert.equal(validateLoopbackBaseUrl(`${baseUrl}/`), baseUrl);
  }
});

test('library compiler rejects every prohibited destination before fetch', async () => {
  for (const baseUrl of REJECTED_BASE_URLS) {
    let fetchCalls = 0;
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-rejected-'));
    await assert.rejects(
      compileBoundary({
        baseUrl,
        outDir,
        labMode: 'vulnerable',
        actorAToken: ACTOR_A_TOKEN,
        actorBToken: ACTOR_B_TOKEN,
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error('fetch must not execute');
        },
      }),
      /BOQA-005/,
    );
    assert.equal(fetchCalls, 0, `fetch executed for rejected baseUrl: ${baseUrl}`);
  }
});

test('direct catalog and actor request APIs reject before fetch through the shared guard', async () => {
  for (const invoke of [
    (fetchImpl) => buildRouteGraph('http://169.254.169.254:80', fetchImpl),
    (fetchImpl) => requestActor({
      baseUrl: 'http://127.0.0.1.evil:43117',
      method: 'GET',
      path: '/api/invoices/481',
      actor: 'actor_b',
      token: ACTOR_B_TOKEN,
      role: 'cross_tenant_probe',
      targetActor: 'actor_a',
      fetchImpl,
    }),
  ]) {
    let fetchCalls = 0;
    await assert.rejects(
      invoke(async () => {
        fetchCalls += 1;
        throw new Error('fetch must not execute');
      }),
      /BOQA-005/,
    );
    assert.equal(fetchCalls, 0);
  }
});

test('CLI rejects a prohibited destination before any request can execute', async () => {
  const result = await runCompilerCli('https://sitio-externo.example:443');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BOQA-005 compiler is restricted/);
  assert.equal(result.stdout, '');
});

test('generated standalone accepts each exact loopback URL form without BOQA runtime imports', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-standalone-valid-'));
  const generatedFile = path.join(outDir, 'boundary-regression.spec.ts');
  fs.writeFileSync(generatedFile, generateStandaloneTest({ actors: ACTORS, candidates: [] }), 'utf8');
  for (const baseUrl of VALID_LOOPBACK_URLS) {
    const result = await runGeneratedWithFetchAudit(generatedFile, baseUrl);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(result.audit, { fetch_calls: 0, authorization_headers: [], requested_urls: [] });
  }
});

test('generated standalone rejects destinations before fetch and never transmits tokens', async () => {
  let generatedFile;
  await withLab('fixed', async ({ baseUrl }) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-standalone-rejected-'));
    const result = await compileAt(baseUrl, 'fixed', outDir);
    generatedFile = result.files.testFile;
  });

  let totalFetchCalls = 0;
  const transmittedAuthorizationHeaders = [];
  for (const baseUrl of REJECTED_BASE_URLS) {
    const result = await runGeneratedWithFetchAudit(generatedFile, baseUrl);
    assert.notEqual(result.status, 0, `generated test unexpectedly accepted: ${baseUrl}`);
    assert.match(result.stderr, /BOQA-005 generated standalone/);
    assert.equal(result.audit.fetch_calls, 0, `generated test fetched rejected URL: ${baseUrl}`);
    assert.deepEqual(result.audit.authorization_headers, []);
    assert.deepEqual(result.audit.requested_urls, []);
    totalFetchCalls += result.audit.fetch_calls;
    transmittedAuthorizationHeaders.push(...result.audit.authorization_headers);
  }

  const validationBeforeTokens = await runGeneratedWithFetchAudit(
    generatedFile,
    'https://sitio-externo.example:443',
    { includeTokens: false },
  );
  assert.notEqual(validationBeforeTokens.status, 0);
  assert.match(validationBeforeTokens.stderr, /BOQA-005 generated standalone test is restricted/);
  assert.doesNotMatch(validationBeforeTokens.stderr, /BOQA_ACTOR_[AB]_TOKEN is required/);
  assert.equal(validationBeforeTokens.audit.fetch_calls, 0);
  assert.equal(totalFetchCalls, 0);
  assert.deepEqual(transmittedAuthorizationHeaders, []);
});

test('loads exactly the ordered minimal finding input with zero variants', () => {
  const { input, raw } = loadClosedBoundaryInput();
  assert.deepEqual(Object.keys(input), EXPECTED_TOP_LEVEL_KEYS);
  assert.deepEqual(input, {
    finding: { path: '/api/invoices/481' },
    resource: { id: '481' },
    expected_owner: 'actor_a',
    prohibited_actor: 'actor_b',
    private_marker: 'BOQA_TENANT_A_7F39',
  });
  for (const forbidden of FORBIDDEN_INPUT_KEYS) assert.equal(raw.includes(`${forbidden}:`), false);
  assert.equal(raw.includes('/api/v2/invoices/:id'), false);
  assert.equal(raw.includes('/api/invoices/:id/export'), false);
  assert.equal(raw.includes('VULNERABLE'), false);
  assert.equal(raw.includes('PROTECTED'), false);
});

test('normalizes the single finding to original and derives four related catalog variants', async () => {
  await withLab('vulnerable', async ({ baseUrl }) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-discovery-'));
    const result = await compileAt(baseUrl, 'vulnerable', outDir);
    assert.equal(result.discovery.source_route_id, 'original');
    assert.equal(result.discovery.source_template, '/api/invoices/:id');
    assert.equal(result.discovery.normalization, 'concrete_resource_id_to_path_parameter');
    assert.equal(result.discovery.input_variant_count, 0);
    assert.deepEqual(result.discovery.variants.map((candidate) => candidate.route_id), ['v2', 'export', 'nested', 'query']);
    assert.deepEqual(result.discovery.variants.map((candidate) => candidate.transformation), [
      'version_prefix_v2',
      'export_suffix',
      'account_scope_nesting',
      'path_parameter_to_query_parameter',
    ]);
  });
});

test('vulnerable lab proves exact independent matrix with TP=3 FP=0 FN=0', async () => {
  await withLab('vulnerable', async ({ baseUrl }) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-vulnerable-'));
    const result = await compileAt(baseUrl, 'vulnerable', outDir);
    assert.deepEqual(result.groundTruth, VULNERABLE_GROUND_TRUTH);
    assert.deepEqual(result.oracleResults.map(({ route_id, verdict }) => [route_id, verdict]), [
      ['original', VERDICTS.NOT_CONTRADICTED],
      ['v2', VERDICTS.CONTRADICTED],
      ['export', VERDICTS.CONTRADICTED],
      ['nested', VERDICTS.CONTRADICTED],
      ['query', VERDICTS.NOT_CONTRADICTED],
    ]);
    assert.deepEqual(result.metrics, {
      true_positives: 3,
      false_positives: 0,
      false_negatives: 0,
      true_negatives: 2,
      unproven: 0,
      invalid_experiments: 0,
    });
    assert.deepEqual(result.evidence.variant_discovery.newly_confirmed_route_ids, ['v2', 'export', 'nested']);
    assert.ok(result.evidence.variant_discovery.derived_count >= 1);
    assert.equal(result.evidence.input.variant_count, 0);
    assert.deepEqual(result.evidence.input.binding, {
      expected_owner_id: 'actor_a',
      expected_owner_resource_id: '481',
      prohibited_actor_id: 'actor_b',
    });
    assert.equal(result.evidence.independent_ground_truth.matrix_embedded, false);
    assert.equal(Object.hasOwn(result.evidence.independent_ground_truth, 'matrix'), false);
    assert.equal(result.evidence.variant_discovery.source_route_id, 'original');
    assert.deepEqual(fs.readdirSync(outDir).sort(), [
      'boundary-contract.yaml',
      'boundary-regression.spec.ts',
      'evidence.json',
    ]);
  });
});

test('same standalone test fails vulnerable and passes fixed', async () => {
  let generatedFile;
  await withLab('vulnerable', async ({ baseUrl }) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-generated-'));
    const result = await compileAt(baseUrl, 'vulnerable', outDir);
    generatedFile = result.files.testFile;
    const vulnerable = await runGeneratedTest(generatedFile, baseUrl);
    assert.notEqual(vulnerable.status, 0, 'same test must fail against vulnerable matrix');
  });
  await withLab('fixed', async ({ baseUrl }) => {
    const fixed = await runGeneratedTest(generatedFile, baseUrl);
    assert.equal(fixed.status, 0, fixed.stderr || fixed.stdout);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-fixed-'));
    const result = await compileAt(baseUrl, 'fixed', outDir);
    assert.deepEqual(result.groundTruth, FIXED_GROUND_TRUTH);
    assert.ok(result.oracleResults.every((item) => item.verdict === VERDICTS.NOT_CONTRADICTED));
    assert.deepEqual(result.metrics, {
      true_positives: 0,
      false_positives: 0,
      false_negatives: 0,
      true_negatives: 5,
      unproven: 0,
      invalid_experiments: 0,
    });
  });
});

test('ambiguous response is UNPROVEN and HTTP 200 alone is not contradiction', () => {
  const receiptSet = validReceiptSet();
  receiptSet.actor_a_cross = { status: 200, semantic: { ok: true } };
  const result = evaluateBoundary(receiptSet);
  assert.equal(result.verdict, VERDICTS.UNPROVEN);
  assert.equal(result.contradiction, false);
  assert.equal(result.http_200_alone_is_not_contradiction, true);
});

test('invalid owner control is INVALID_EXPERIMENT', () => {
  const receiptSet = validReceiptSet();
  receiptSet.actor_a_own = { status: 200, semantic: { kind: 'private_invoice' } };
  const result = evaluateBoundary(receiptSet);
  assert.equal(result.verdict, VERDICTS.INVALID);
  assert.equal(result.contradiction, false);
});

const singleSignalCases = [
  ['marker_only', { marker: ACTORS.actor_a.marker }, 'owner_marker'],
  ['tenant_id_only', { tenant_id: ACTORS.actor_a.tenant_id }, 'tenant_id'],
  ['invoice_id_only', { invoice_id: ACTORS.actor_a.invoice_id }, 'invoice_or_resource_id'],
  ['sensitive_field_only', { sensitive_field: 'payment-reference-481' }, 'sensitive_field'],
  ['operational_capability_only', { operational_capability: 'invoice_export' }, 'operational_capability'],
  ['prohibited_metadata_only', { prohibited_metadata: { ledger_partition: 'tenant-ledger-7' } }, 'prohibited_metadata'],
];

for (const [name, semantic, expectedSignal] of singleSignalCases) {
  test(`oracle contradicts independent prohibited signal: ${name}`, () => {
    const receiptSet = validReceiptSet();
    receiptSet.actor_b_cross = { status: 200, semantic };
    const result = evaluateBoundary(receiptSet);
    assert.equal(result.verdict, VERDICTS.CONTRADICTED);
    assert.equal(result.contradiction, true);
    assert.deepEqual(result.disclosures.actor_a_received_actor_b_signals, []);
    assert.deepEqual(result.disclosures.actor_b_received_actor_a_signals, [expectedSignal]);
  });
}

test('metrics consume the lab ground truth independently from route policy metadata', () => {
  const results = [
    { route_id: 'original', verdict: VERDICTS.CONTRADICTED },
    { route_id: 'v2', verdict: VERDICTS.NOT_CONTRADICTED },
    { route_id: 'export', verdict: VERDICTS.CONTRADICTED },
    { route_id: 'nested', verdict: VERDICTS.CONTRADICTED },
    { route_id: 'query', verdict: VERDICTS.NOT_CONTRADICTED },
  ];
  const metrics = calculateMetrics(results, VULNERABLE_GROUND_TRUTH);
  assert.equal(metrics.false_positives, 1);
  assert.equal(metrics.false_negatives, 1);
  assert.equal(metrics.true_positives, 2);
  assert.equal(metrics.true_negatives, 1);
});

test('compiler outputs are deterministic for fixed semantic input', async () => {
  await withLab('vulnerable', async ({ baseUrl }) => {
    const left = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-left-'));
    const right = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-005-right-'));
    await compileAt(baseUrl, 'vulnerable', left);
    await compileAt(baseUrl, 'vulnerable', right);
    for (const file of ['boundary-contract.yaml', 'boundary-regression.spec.ts', 'evidence.json']) {
      assert.equal(fs.readFileSync(path.join(left, file), 'utf8'), fs.readFileSync(path.join(right, file), 'utf8'));
    }
  });
});
