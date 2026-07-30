'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { computeEvidenceSha256, finalizeRoundEvidence } = require('../../lib/soak-qualification-helpers');

const DEFAULTS = Object.freeze({
  head: 'a'.repeat(40),
  merge: 'b'.repeat(40),
  tree: 'c'.repeat(40),
  runId: '123456789',
  runAttempt: '1',
  workflowName: 'BOQA Real Docker Qualification Gate V1',
  workflowJob: 'qualification',
  repository: 'simonkey888/boqa',
  nowMs: Date.parse('2026-07-23T03:01:00.000Z'),
});
const IMAGE_DIGEST = `sha256:${'d'.repeat(64)}`;
const IMAGE = `bkimminich/juice-shop@${IMAGE_DIGEST}`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function compose() {
  const service = (image, user) => ({
    image,
    user,
    read_only: true,
    cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'],
    networks: { boqa_lab_internal: null },
    volumes: [],
  });
  return {
    name: 'boqa-lab',
    networks: { boqa_lab_internal: { internal: true } },
    services: {
      candidate: service(IMAGE, '65532:65532'),
      control: service(`node:20-slim@sha256:${'e'.repeat(64)}`, '1000:1000'),
      driver: service(`node:20-slim@sha256:${'e'.repeat(64)}`, '1000:1000'),
    },
    volumes: {},
  };
}

function baseDriver() {
  const value = {
    lab_id: 'juice-shop-v1',
    run_id: 'r01-test1234',
    manifest_digest: '1'.repeat(64),
    image_digest: IMAGE_DIGEST,
    control_digest: '2'.repeat(64),
    source_digest: '3'.repeat(64),
    scenario_family: 'INERT_DIFFERENTIAL_SEARCH_VALIDATION',
    request_count: 4,
    result: { vulnerable: 'LAB_FINDING_CONFIRMED', control: 'LAB_CONTROL_CLEAN' },
    request_budget_verified: true,
    policy_status: 'AUTHORIZED',
    environment: 'controlled_lab',
    reportability: 'not_reportable',
    external_target: false,
    started_at: '2026-07-23T03:00:10.000Z',
    completed_at: '2026-07-23T03:00:11.000Z',
    duration_ms: 1000,
    runtime_identity: { uid: 1000, gid: 1000, hostname: 'synthetic-container', node: 'v20.0.0' },
    runtime_evidence_sha256: '4'.repeat(64),
    egress: {
      dns: { classification: 'BLOCKED_DNS' },
      metadata: { classification: 'BLOCKED_CONNECT' },
      documentation_ip: { classification: 'BLOCKED_TIMEOUT' },
    },
  };
  value.evidence_sha256 = computeEvidenceSha256(value);
  return value;
}

function rewriteChecksums(dir) {
  const names = [];
  (function walk(current, prefix = '') {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (relative === 'SHA256SUMS') continue;
      if (entry.isDirectory()) walk(path.join(current, entry.name), relative);
      else names.push(relative);
    }
  }(dir));
  const lines = names.sort().map((name) => `${sha256(fs.readFileSync(path.join(dir, name)))}  ${name}`).join('\n');
  fs.writeFileSync(path.join(dir, 'SHA256SUMS'), `${lines}\n`);
}

function createFixture(identity = {}) {
  const id = { ...DEFAULTS, ...identity };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boqa-contract-fixture-'));
  const driver = baseDriver();
  const driverName = `driver-round-${driver.run_id}.json`;
  const driverPath = path.join(dir, 'driver', driverName);
  writeJson(driverPath, driver);
  const driverFileSha = sha256(fs.readFileSync(driverPath));
  const source = {
    head_sha: id.head,
    merge_sha: id.merge,
    tree_sha: id.tree,
    workflow_run_id: id.runId,
    workflow_run_attempt: id.runAttempt,
    workflow_name: id.workflowName,
    workflow_job: id.workflowJob,
    repository: id.repository,
  };
  const final = finalizeRoundEvidence(driver, {
    driverFile: driverName,
    driverFileSha256: driverFileSha,
    preState: { containers: [], networks: [], volumes: [] },
    cleanupState: { containers: [], networks: [], volumes: [] },
    cleanupVerified: true,
    containerIdentities: { candidate: { synthetic: true }, control: { synthetic: true }, driver: { synthetic: true } },
    source,
    timing: { started_at: '2026-07-23T03:00:00.000Z', completed_at: '2026-07-23T03:00:12.000Z', duration_ms: 12000 },
  });
  const finalName = `final-round-${driver.run_id}.json`;
  const qualification = {
    schema_version: 1,
    candidate_head_sha: id.head,
    candidate_merge_sha: id.merge,
    source_tree_sha: id.tree,
    workflow_run_id: id.runId,
    image_digest_match: true,
    config_digest_match: true,
    configured_runtime_user: '65532',
    driver_runtime_user: '1000:1000',
    internal_network: true,
    host_ports: 0,
    docker_socket: 0,
    privileged: false,
    capabilities: 'dropped',
    read_only_runtime: true,
    runtime_egress: 'blocked',
    unauthorized_connections: 0,
    rounds_requested: 1,
    rounds_completed: 1,
    vulnerable_confirmed: 1,
    controls_clean: 1,
    false_positives: 0,
    false_negatives: 0,
    cleanup_failures: 0,
    evidence_pairs_verified: true,
    evidence_integrity: 'valid',
    production_accessed: false,
    deploy_performed: false,
    completed_at: '2026-07-23T03:00:13.000Z',
  };
  const gate = {
    schema_version: 1,
    qualification_green: true,
    mode: 'short',
    head_sha: id.head,
    merge_sha: id.merge,
    tree_sha: id.tree,
    workflow_run_id: id.runId,
    project: 'boqa-lab',
    run_dir: 'output/soak/synthetic',
    started_at: '2026-07-23T03:00:00.000Z',
    gates: {
      pre_run_clean: 'PASS', oci_identity: 'PASS', compose_policy: 'PASS', round_assertions: 'PASS',
      evidence_pairs: 'PASS', cleanup: 'PASS', egress: 'PASS', final: 'PASS',
    },
    completed_at: '2026-07-23T03:00:14.000Z',
  };
  const files = {
    'compose-normalized.json': compose(),
    'evidence-files.json': { driver_files: [driverName], final_files: [finalName] },
    'gate-status.json': gate,
    'materialized-image.json': {
      repo_digests: [IMAGE], image_id: `sha256:${'f'.repeat(64)}`, architecture: 'amd64', os: 'linux',
      configured_user: '65532', manifest_match: true, config_match: true,
    },
    'qualification-manifest.json': qualification,
    'round-results.json': [final],
    'soak-summary.json': {
      rounds_requested: 1, rounds_completed: 1, vulnerable_confirmed: 1, controls_clean: 1,
      false_positives: 0, false_negatives: 0, cleanup_failures: 0,
    },
    [finalName]: final,
  };
  for (const [name, value] of Object.entries(files)) writeJson(path.join(dir, name), value);
  rewriteChecksums(dir);
  return { dir, driverName, finalName, identity: id };
}

function readJson(dir, relative) {
  return JSON.parse(fs.readFileSync(path.join(dir, relative), 'utf8'));
}

function mutateJson(fixture, relative, mutator) {
  const value = readJson(fixture.dir, relative);
  mutator(value);
  writeJson(path.join(fixture.dir, relative), value);
  rewriteChecksums(fixture.dir);
}

function expectedOptions(fixture, overrides = {}) {
  const id = fixture.identity;
  return {
    evidenceDir: fixture.dir,
    expectedSourceSha: id.head,
    expectedMergeSha: id.merge,
    expectedTreeSha: id.tree,
    expectedWorkflowRunId: id.runId,
    expectedWorkflowRunAttempt: id.runAttempt,
    expectedWorkflowName: id.workflowName,
    expectedWorkflowJob: id.workflowJob,
    expectedRepository: id.repository,
    nowMs: id.nowMs,
    ...overrides,
  };
}

module.exports = {
  DEFAULTS,
  createFixture,
  expectedOptions,
  mutateJson,
  readJson,
  rewriteChecksums,
  sha256,
  writeJson,
};
