'use strict';

const SCHEMA = require('../schemas/safe-lab-hunter-contract-v1.schema.json');
const {
  canonicalJson,
  fail,
  parseIso,
  sha256,
} = require('./safe-lab-contract-common-v1');
const {
  verifyEvidenceFiles,
  verifySafeLabEvidenceChain,
} = require('./safe-lab-evidence-chain-v1');

const CONTRACT_SCHEMA_VERSION = 1;
const POLICY_ID = 'safe-lab-readonly-v1';
const EXISTING_DASHBOARD_FRESH_MS = 90_000;
const DEFAULT_UNAVAILABLE_MS = 24 * 60 * 60 * 1000;
const PROHIBITED_PUBLIC_KEY_PATTERN = /(hostname|container|ocid|ip_address|private_path|secret|cookie|authorization|payload|user_data|storage)/i;

function freshnessDurations(options = {}) {
  const freshMs = Number.isFinite(options.freshMs) ? options.freshMs : EXISTING_DASHBOARD_FRESH_MS;
  const unavailableMs = Number.isFinite(options.unavailableMs) ? options.unavailableMs : DEFAULT_UNAVAILABLE_MS;
  if (!Number.isInteger(freshMs) || freshMs <= 0) fail('FRESHNESS_WINDOW_INVALID');
  if (!Number.isInteger(unavailableMs) || unavailableMs <= freshMs) fail('UNAVAILABLE_WINDOW_INVALID');
  return { freshMs, unavailableMs };
}

function classifyFreshness(completedMs, nowMs, options = {}) {
  if (!Number.isFinite(completedMs) || !Number.isFinite(nowMs)) fail('CLOCK_INVALID');
  const { freshMs, unavailableMs } = freshnessDurations(options);
  if (completedMs > nowMs) fail('EVIDENCE_FROM_FUTURE');
  const ageMs = nowMs - completedMs;
  if (ageMs <= freshMs) return 'FRESH';
  if (ageMs <= unavailableMs) return 'STALE';
  return 'UNAVAILABLE';
}

function assertSchemaRule(key, value, rule) {
  if (Object.prototype.hasOwnProperty.call(rule, 'const') && value !== rule.const) fail('CONTRACT_FIELD_INVALID', key);
  if (rule.enum && !rule.enum.includes(value)) fail('CONTRACT_FIELD_INVALID', key);
  if (rule.type === 'string' && typeof value !== 'string') fail('CONTRACT_FIELD_INVALID', key);
  if (rule.type === 'integer' && !Number.isInteger(value)) fail('CONTRACT_FIELD_INVALID', key);
  if (rule.type === 'boolean' && typeof value !== 'boolean') fail('CONTRACT_FIELD_INVALID', key);
  if (rule.pattern && !new RegExp(rule.pattern).test(String(value))) fail('CONTRACT_FIELD_INVALID', key);
  if (rule.format === 'date-time') parseIso(value, `contract.${key}`);
}

function validateClosedContract(contract) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) fail('CONTRACT_NOT_OBJECT');
  const actualKeys = Object.keys(contract).sort();
  const expectedKeys = Object.keys(SCHEMA.properties).sort();
  if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) fail('CONTRACT_FIELDS_INVALID');
  for (const key of SCHEMA.required) {
    if (!Object.prototype.hasOwnProperty.call(contract, key)) fail('CONTRACT_FIELD_MISSING', key);
  }
  for (const [key, rule] of Object.entries(SCHEMA.properties)) assertSchemaRule(key, contract[key], rule);
  for (const key of actualKeys) {
    if (PROHIBITED_PUBLIC_KEY_PATTERN.test(key)) fail('PRIVATE_FIELD_FORBIDDEN', key);
  }
  if (/\bACTIVE\b/.test(canonicalJson(contract))) fail('ACTIVE_FORBIDDEN_FOR_ONE_SHOT');

  const startedMs = parseIso(contract.cycle_started_at, 'contract.cycle_started_at');
  const finishedMs = parseIso(contract.cycle_finished_at, 'contract.cycle_finished_at');
  const observedMs = parseIso(contract.observed_at, 'contract.observed_at');
  const freshUntilMs = parseIso(contract.fresh_until, 'contract.fresh_until');
  const unavailableAfterMs = parseIso(contract.unavailable_after, 'contract.unavailable_after');
  if (!(startedMs <= finishedMs && finishedMs <= observedMs && observedMs < freshUntilMs && freshUntilMs < unavailableAfterMs)) {
    fail('CONTRACT_TIMESTAMPS_INCONSISTENT');
  }
  return true;
}

function expectedContractStatusAt(contract, nowMs) {
  validateClosedContract(contract);
  if (!Number.isFinite(nowMs)) fail('CLOCK_INVALID');
  const observedMs = parseIso(contract.observed_at, 'contract.observed_at');
  const freshUntilMs = parseIso(contract.fresh_until, 'contract.fresh_until');
  const unavailableAfterMs = parseIso(contract.unavailable_after, 'contract.unavailable_after');
  if (nowMs < observedMs) fail('CONTRACT_TIMESTAMP_FUTURE');
  if (nowMs <= freshUntilMs) return 'FRESH';
  if (nowMs <= unavailableAfterMs) return 'STALE';
  return 'UNAVAILABLE';
}

function validateContractTemporalState(contract, nowMs) {
  const expected = expectedContractStatusAt(contract, nowMs);
  if (contract.status !== expected) fail('CONTRACT_STATUS_TIME_MISMATCH', `${contract.status}:${expected}`);
  return expected;
}

function generateSafeLabHunterContract(options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const freshness = freshnessDurations(options.freshness);
  const verified = verifySafeLabEvidenceChain({
    evidenceDir: options.evidenceDir,
    expectedSourceSha: options.expectedSourceSha,
    expectedMergeSha: options.expectedMergeSha,
    expectedTreeSha: options.expectedTreeSha,
    expectedWorkflowRunId: options.expectedWorkflowRunId,
    expectedWorkflowRunAttempt: options.expectedWorkflowRunAttempt,
    expectedWorkflowName: options.expectedWorkflowName,
    expectedWorkflowJob: options.expectedWorkflowJob,
    expectedRepository: options.expectedRepository,
    nowMs,
  });
  const { round, startedMs, finishedMs, gateCompletedMs, expected } = verified;
  const contract = {
    schema_version: CONTRACT_SCHEMA_VERSION,
    environment: 'controlled_lab',
    status: classifyFreshness(gateCompletedMs, nowMs, freshness),
    hunter_state: 'LAB_COMPLETE',
    reportable: false,
    authorized_scope: 'synthetic_fixture',
    target_kind: 'owasp_juice_shop_pinned',
    policy_id: POLICY_ID,
    source_sha: expected.sourceSha,
    run_id: `sha256:${sha256(String(round.run_id)).slice(0, 16)}`,
    cycle_started_at: new Date(startedMs).toISOString(),
    cycle_finished_at: new Date(finishedMs).toISOString(),
    observed_at: new Date(gateCompletedMs).toISOString(),
    fresh_until: new Date(gateCompletedMs + freshness.freshMs).toISOString(),
    unavailable_after: new Date(gateCompletedMs + freshness.unavailableMs).toISOString(),
    finding_count: 1,
    control_finding_count: 0,
    false_positive_count: 0,
    false_negative_count: 0,
    unauthorized_connection_count: 0,
    cleanup_verified: true,
    egress_blocked: true,
    request_budget_verified: true,
    evidence_checksum: verified.verified.evidenceChecksum,
    message: 'Validación completada en laboratorio controlado',
  };
  validateClosedContract(contract);
  validateContractTemporalState(contract, nowMs);
  const json = `${canonicalJson(contract)}\n`;
  const digest = sha256(json);
  return {
    contract,
    json,
    checksum: `sha256:${digest}`,
    checksumLine: (name = 'hunter-status-public.json') => `${digest}  ${name}\n`,
    evidenceReport: verified.report,
  };
}

module.exports = {
  CONTRACT_SCHEMA_VERSION,
  DEFAULT_UNAVAILABLE_MS,
  EXISTING_DASHBOARD_FRESH_MS,
  POLICY_ID,
  canonicalJson,
  classifyFreshness,
  expectedContractStatusAt,
  generateSafeLabHunterContract,
  validateClosedContract,
  validateContractTemporalState,
  verifyEvidenceFiles,
};
