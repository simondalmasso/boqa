'use strict';

const fs = require('fs');
const path = require('path');
const {
  assertExactKeys,
  assertNonEmpty,
  assertRunAttempt,
  assertRunId,
  assertSha,
  canonicalJson,
  fail,
  listFiles,
  parseChecksums,
  parseIso,
  readJson,
  sha256,
} = require('./safe-lab-contract-common-v1');
const { assertComposePolicy, computeEvidenceSha256 } = require('./soak-qualification-helpers');

const ALLOWED_EGRESS_RESULTS = new Set(['BLOCKED_DNS', 'BLOCKED_CONNECT', 'BLOCKED_TIMEOUT']);
const REQUIRED_GATES = ['pre_run_clean', 'oci_identity', 'compose_policy', 'round_assertions', 'evidence_pairs', 'cleanup', 'egress', 'final'];
const EXPECTED_STATIC_FILES = new Set([
  'compose-normalized.json',
  'evidence-files.json',
  'gate-status.json',
  'materialized-image.json',
  'qualification-manifest.json',
  'round-results.json',
  'soak-summary.json',
]);
const QUALIFICATION_KEYS = new Set([
  'schema_version', 'candidate_head_sha', 'candidate_merge_sha', 'source_tree_sha', 'workflow_run_id',
  'image_digest_match', 'config_digest_match', 'configured_runtime_user', 'driver_runtime_user',
  'internal_network', 'host_ports', 'docker_socket', 'privileged', 'capabilities', 'read_only_runtime',
  'runtime_egress', 'unauthorized_connections', 'rounds_requested', 'rounds_completed',
  'vulnerable_confirmed', 'controls_clean', 'false_positives', 'false_negatives', 'cleanup_failures',
  'evidence_pairs_verified', 'evidence_integrity', 'production_accessed', 'deploy_performed', 'completed_at',
]);
const SUMMARY_KEYS = new Set([
  'rounds_requested', 'rounds_completed', 'vulnerable_confirmed', 'controls_clean',
  'false_positives', 'false_negatives', 'cleanup_failures',
]);
const GATE_STATUS_KEYS = new Set([
  'schema_version', 'qualification_green', 'mode', 'head_sha', 'merge_sha', 'tree_sha',
  'workflow_run_id', 'project', 'run_dir', 'started_at', 'gates', 'completed_at',
]);
const EVIDENCE_FILES_KEYS = new Set(['driver_files', 'final_files']);
const MATERIALIZED_IMAGE_KEYS = new Set([
  'repo_digests', 'image_id', 'architecture', 'os', 'configured_user', 'manifest_match', 'config_match',
]);

function normalizeExpected(options, evidenceDir) {
  const expected = {
    evidenceDir,
    sourceSha: String(options.expectedSourceSha || '').trim(),
    mergeSha: String(options.expectedMergeSha || '').trim(),
    treeSha: String(options.expectedTreeSha || '').trim(),
    workflowRunId: String(options.expectedWorkflowRunId || '').trim(),
    workflowRunAttempt: String(options.expectedWorkflowRunAttempt || '').trim(),
    workflowName: String(options.expectedWorkflowName || '').trim(),
    workflowJob: String(options.expectedWorkflowJob || '').trim(),
    repository: String(options.expectedRepository || '').trim(),
  };
  assertSha(expected.sourceSha, 'SOURCE_SHA_INVALID');
  assertSha(expected.mergeSha, 'MERGE_SHA_INVALID');
  assertSha(expected.treeSha, 'TREE_SHA_INVALID');
  assertRunId(expected.workflowRunId);
  assertRunAttempt(expected.workflowRunAttempt);
  assertNonEmpty(expected.workflowName, 'WORKFLOW_NAME_INVALID');
  assertNonEmpty(expected.workflowJob, 'WORKFLOW_JOB_INVALID');
  assertNonEmpty(expected.repository, 'REPOSITORY_INVALID');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(expected.repository)) fail('REPOSITORY_INVALID');
  return expected;
}

function verifyEvidenceFiles(evidenceDir) {
  const entries = parseChecksums(evidenceDir);
  const actual = listFiles(evidenceDir).filter((file) => file !== 'SHA256SUMS');
  const expected = [...entries.keys()].sort();
  const missing = expected.filter((file) => !actual.includes(file));
  const extra = actual.filter((file) => !entries.has(file));
  if (missing.length) fail('EVIDENCE_FILE_MISSING', missing[0]);
  if (extra.length) fail('EVIDENCE_FILE_EXTRA', extra[0]);
  if (actual.length !== 9) fail('EVIDENCE_FILE_COUNT_INVALID', String(actual.length));
  const finals = actual.filter((file) => /^final-round-[a-z0-9-]+\.json$/.test(file));
  const drivers = actual.filter((file) => /^driver\/driver-round-[a-z0-9-]+\.json$/.test(file));
  if (finals.length !== 1 || drivers.length !== 1) fail('EVIDENCE_PAIR_COUNT_INVALID');
  for (const file of EXPECTED_STATIC_FILES) {
    if (!entries.has(file)) fail('EVIDENCE_FILE_MISSING', file);
  }
  for (const [relative, digest] of entries) {
    const actualDigest = sha256(fs.readFileSync(path.join(evidenceDir, relative)));
    if (actualDigest !== digest) fail('CHECKSUM_MISMATCH', relative);
  }
  const normalized = [...entries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relative, digest]) => `${digest}  ${relative}`)
    .join('\n') + '\n';
  return {
    files: actual,
    finalFile: finals[0],
    driverFile: drivers[0],
    entries,
    evidenceChecksum: `sha256:${sha256(normalized)}`,
  };
}

function assertExactIdentity(actual, expected, code) {
  if (String(actual) !== String(expected)) fail(code);
}

function assertWorkflowIdentity(source, expected) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) fail('ROUND_SOURCE_MISSING');
  assertExactIdentity(source.head_sha, expected.sourceSha, 'SOURCE_SHA_MISMATCH');
  assertExactIdentity(source.merge_sha, expected.mergeSha, 'MERGE_SHA_MISMATCH');
  assertExactIdentity(source.tree_sha, expected.treeSha, 'TREE_SHA_MISMATCH');
  assertExactIdentity(source.workflow_run_id, expected.workflowRunId, 'WORKFLOW_RUN_MISMATCH');
  assertExactIdentity(source.workflow_run_attempt, expected.workflowRunAttempt, 'WORKFLOW_ATTEMPT_MISMATCH');
  assertExactIdentity(source.workflow_name, expected.workflowName, 'WORKFLOW_NAME_MISMATCH');
  assertExactIdentity(source.workflow_job, expected.workflowJob, 'WORKFLOW_JOB_MISMATCH');
  assertExactIdentity(source.repository, expected.repository, 'REPOSITORY_MISMATCH');
}

function assertQualification(models, verified, expected, nowMs) {
  const { qualification, summary, gate, compose, image, evidenceFiles, rounds, final, driver } = models;
  assertExactKeys(qualification, QUALIFICATION_KEYS, 'qualification_manifest');
  assertExactKeys(summary, SUMMARY_KEYS, 'soak_summary');
  assertExactKeys(gate, GATE_STATUS_KEYS, 'gate_status');
  assertExactKeys(evidenceFiles, EVIDENCE_FILES_KEYS, 'evidence_files');
  assertExactKeys(image, MATERIALIZED_IMAGE_KEYS, 'materialized_image');

  if (qualification.schema_version !== 1 || gate.schema_version !== 1) fail('QUALIFICATION_SCHEMA_INVALID');
  for (const [actual, wanted, code] of [
    [qualification.candidate_head_sha, expected.sourceSha, 'SOURCE_SHA_MISMATCH'],
    [gate.head_sha, expected.sourceSha, 'SOURCE_SHA_MISMATCH'],
    [qualification.candidate_merge_sha, expected.mergeSha, 'MERGE_SHA_MISMATCH'],
    [gate.merge_sha, expected.mergeSha, 'MERGE_SHA_MISMATCH'],
    [qualification.source_tree_sha, expected.treeSha, 'TREE_SHA_MISMATCH'],
    [gate.tree_sha, expected.treeSha, 'TREE_SHA_MISMATCH'],
    [qualification.workflow_run_id, expected.workflowRunId, 'WORKFLOW_RUN_MISMATCH'],
    [gate.workflow_run_id, expected.workflowRunId, 'WORKFLOW_RUN_MISMATCH'],
  ]) assertExactIdentity(actual, wanted, code);

  if (!Array.isArray(rounds) || rounds.length !== 1) fail('ROUND_COUNT_INVALID');
  const round = rounds[0];
  assertWorkflowIdentity(round.source, expected);
  assertWorkflowIdentity(final.source, expected);
  if (canonicalJson(round) !== canonicalJson(final)) fail('ROUND_EVIDENCE_MISMATCH');

  const expectedDriverBase = path.basename(verified.driverFile);
  const expectedFinalBase = path.basename(verified.finalFile);
  if (canonicalJson(evidenceFiles.driver_files) !== canonicalJson([expectedDriverBase]) ||
      canonicalJson(evidenceFiles.final_files) !== canonicalJson([expectedFinalBase])) {
    fail('EVIDENCE_FILES_INCONSISTENT');
  }
  const suffix = expectedDriverBase.slice('driver-round-'.length, -'.json'.length);
  if (expectedFinalBase !== `final-round-${suffix}.json` || driver.run_id !== suffix || final.run_id !== suffix) {
    fail('EVIDENCE_FILENAME_MISMATCH');
  }

  const driverFileSha = sha256(fs.readFileSync(path.join(expected.evidenceDir, verified.driverFile)));
  if (driverFileSha !== verified.entries.get(verified.driverFile)) fail('DRIVER_FILE_SHA_MISMATCH');
  if (computeEvidenceSha256(driver) !== driver.evidence_sha256) fail('DRIVER_PAYLOAD_SHA_MISMATCH');
  if (computeEvidenceSha256(final) !== final.evidence_sha256) fail('FINAL_PAYLOAD_SHA_MISMATCH');
  if (final.driver_evidence?.file !== expectedDriverBase ||
      final.driver_evidence?.file_sha256 !== driverFileSha ||
      final.driver_file_sha256 !== driverFileSha) fail('FINAL_DRIVER_FILE_REFERENCE_MISMATCH');
  if (final.driver_evidence?.payload_sha256 !== driver.evidence_sha256 ||
      final.driver_evidence_sha256 !== driver.evidence_sha256) fail('FINAL_DRIVER_PAYLOAD_REFERENCE_MISMATCH');

  try {
    assertComposePolicy(compose);
  } catch (error) {
    fail('COMPOSE_POLICY_INVALID', error.message);
  }
  const candidateImage = compose.services?.candidate?.image;
  if (!candidateImage || !candidateImage.endsWith(`@${final.image_digest}`)) fail('COMPOSE_MANIFEST_IMAGE_MISMATCH');
  if (qualification.image_digest_match !== true || image.manifest_match !== true ||
      !Array.isArray(image.repo_digests) || !image.repo_digests.includes(candidateImage)) fail('IMAGE_DIGEST_MISMATCH');
  if (qualification.config_digest_match !== true || image.config_match !== true ||
      String(image.configured_user) !== String(qualification.configured_runtime_user)) fail('CONFIG_DIGEST_MISMATCH');

  for (const [key, wanted, code] of [
    ['internal_network', true, 'NETWORK_NOT_INTERNAL'],
    ['host_ports', 0, 'HOST_PORT_PRESENT'],
    ['docker_socket', 0, 'DOCKER_SOCKET_PRESENT'],
    ['privileged', false, 'PRIVILEGED_FORBIDDEN'],
    ['capabilities', 'dropped', 'CAPABILITIES_NOT_DROPPED'],
    ['read_only_runtime', true, 'READ_ONLY_RUNTIME_REQUIRED'],
  ]) {
    if (qualification[key] !== wanted) fail(code);
  }

  const summaryFields = [
    'rounds_requested', 'rounds_completed', 'vulnerable_confirmed', 'controls_clean',
    'false_positives', 'false_negatives', 'cleanup_failures',
  ];
  for (const key of summaryFields) {
    if (qualification[key] !== summary[key]) fail('SUMMARY_MISMATCH', key);
  }
  if (qualification.rounds_requested !== 1 || qualification.rounds_completed !== 1) fail('ROUND_COUNT_INVALID');
  if (qualification.vulnerable_confirmed !== 1 || round.result?.vulnerable !== 'LAB_FINDING_CONFIRMED') fail('CANDIDATE_NOT_CONFIRMED');
  if (qualification.controls_clean !== 1 || round.result?.control !== 'LAB_CONTROL_CLEAN') fail('NEGATIVE_CONTROL_CONTAMINATED');
  if (qualification.false_positives !== 0) fail('FALSE_POSITIVES_NONZERO');
  if (qualification.false_negatives !== 0) fail('FALSE_NEGATIVES_NONZERO');
  if (qualification.unauthorized_connections !== 0) fail('UNAUTHORIZED_CONNECTIONS_NONZERO');
  if (qualification.cleanup_failures !== 0 || round.cleanup_verified !== true) fail('CLEANUP_NOT_VERIFIED');
  if (qualification.runtime_egress !== 'blocked' || !round.egress ||
      Object.values(round.egress).some((entry) => !ALLOWED_EGRESS_RESULTS.has(entry?.classification))) fail('EGRESS_NOT_BLOCKED');
  if (qualification.evidence_pairs_verified !== true || qualification.evidence_integrity !== 'valid') fail('EVIDENCE_INTEGRITY_INVALID');
  if (qualification.production_accessed !== false || qualification.deploy_performed !== false) fail('PRODUCTION_MUTATION_DETECTED');

  if (gate.qualification_green !== true) fail('QUALIFICATION_NOT_GREEN');
  if (!gate.gates || Object.keys(gate.gates).sort().join(',') !== [...REQUIRED_GATES].sort().join(',')) fail('GATE_SET_INVALID');
  for (const name of REQUIRED_GATES) {
    if (gate.gates[name] !== 'PASS') fail('GATE_NOT_PASS', name);
  }

  if (round.environment !== 'controlled_lab') fail('ENVIRONMENT_INVALID');
  if (round.reportability !== 'not_reportable' || round.external_target !== false) fail('REPORTABLE_EVIDENCE_FORBIDDEN');
  if (round.policy_status !== 'AUTHORIZED') fail('POLICY_NOT_AUTHORIZED');
  if (round.request_budget_verified !== true) fail('REQUEST_BUDGET_NOT_VERIFIED');
  if (round.final_classification !== 'LAB_ROUND_CONFIRMED') fail('ROUND_CLASSIFICATION_INVALID');

  const startedMs = parseIso(round.started_at, 'round.started_at');
  const finishedMs = parseIso(round.completed_at, 'round.completed_at');
  const qualificationDoneMs = parseIso(qualification.completed_at, 'qualification.completed_at');
  const gateStartedMs = parseIso(gate.started_at, 'gate.started_at');
  const gateCompletedMs = parseIso(gate.completed_at, 'gate.completed_at');
  if (!(gateStartedMs <= startedMs && startedMs <= finishedMs && finishedMs <= qualificationDoneMs && qualificationDoneMs <= gateCompletedMs)) {
    fail('TIMESTAMPS_INCONSISTENT');
  }
  if (gateCompletedMs > nowMs) fail('EVIDENCE_FROM_FUTURE');

  return { round, startedMs, finishedMs, gateCompletedMs };
}

function verifySafeLabEvidenceChain(options = {}) {
  const evidenceDir = path.resolve(options.evidenceDir || '');
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) fail('EVIDENCE_DIR_INVALID');
  const expected = normalizeExpected(options, evidenceDir);
  const verified = verifyEvidenceFiles(evidenceDir);
  const models = {
    compose: readJson(path.join(evidenceDir, 'compose-normalized.json')),
    evidenceFiles: readJson(path.join(evidenceDir, 'evidence-files.json')),
    gate: readJson(path.join(evidenceDir, 'gate-status.json')),
    image: readJson(path.join(evidenceDir, 'materialized-image.json')),
    qualification: readJson(path.join(evidenceDir, 'qualification-manifest.json')),
    rounds: readJson(path.join(evidenceDir, 'round-results.json')),
    summary: readJson(path.join(evidenceDir, 'soak-summary.json')),
    final: readJson(path.join(evidenceDir, verified.finalFile)),
    driver: readJson(path.join(evidenceDir, verified.driverFile)),
  };
  const asserted = assertQualification(models, verified, expected, nowMs);
  const report = {
    validation: 'PASS',
    source_sha: expected.sourceSha,
    merge_sha: expected.mergeSha,
    tree_sha: expected.treeSha,
    workflow: {
      run_id: expected.workflowRunId,
      run_attempt: expected.workflowRunAttempt,
      name: expected.workflowName,
      job: expected.workflowJob,
      repository: expected.repository,
    },
    files_verified: verified.files.length,
    evidence_checksum: verified.evidenceChecksum,
    rounds_requested: models.qualification.rounds_requested,
    rounds_completed: models.qualification.rounds_completed,
    vulnerable_confirmed: models.qualification.vulnerable_confirmed,
    controls_clean: models.qualification.controls_clean,
    false_positives: models.qualification.false_positives,
    false_negatives: models.qualification.false_negatives,
    unauthorized_connections: models.qualification.unauthorized_connections,
    cleanup_failures: models.qualification.cleanup_failures,
    internal_network: models.qualification.internal_network,
    host_ports: models.qualification.host_ports,
    docker_socket: models.qualification.docker_socket,
    privileged: models.qualification.privileged,
    capabilities: models.qualification.capabilities,
    read_only_runtime: models.qualification.read_only_runtime,
    runtime_egress: models.qualification.runtime_egress,
    production_accessed: models.qualification.production_accessed,
    deploy_performed: models.qualification.deploy_performed,
    completed_at: new Date(asserted.gateCompletedMs).toISOString(),
  };
  return { ...asserted, expected, verified, models, report };
}

module.exports = {
  ALLOWED_EGRESS_RESULTS,
  REQUIRED_GATES,
  assertWorkflowIdentity,
  verifyEvidenceFiles,
  verifySafeLabEvidenceChain,
};
