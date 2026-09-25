'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { canonicalJson } = require('../route-graph');

const ORACLE_VOCABULARY = Object.freeze([
  'CONTRADICTED',
  'NOT_CONTRADICTED_IN_TESTED_SCOPE',
  'UNPROVEN',
  'INVALID_EXPERIMENT',
]);

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function sanitizeReceipt(receipt) {
  return {
    actor: receipt.actor,
    role: receipt.role,
    target_actor: receipt.target_actor,
    method: receipt.method,
    path: receipt.path,
    status: receipt.status,
    content_type: receipt.content_type,
    body_sha256: receipt.body_sha256,
    semantic: receipt.semantic,
  };
}

function buildEvidence({
  mode,
  input,
  actors,
  inputBoundary,
  groundTruth,
  graph,
  discovery,
  receipts,
  oracleResults,
  metrics,
  contractFile,
  testFile,
}) {
  const newConfirmed = oracleResults
    .filter((result) => result.source === 'derived_related_variant')
    .filter((result) => result.verdict === 'CONTRADICTED')
    .map((result) => result.route_id);
  const evidence = {
    schema: 'boqa.boundary.evidence.v3',
    mission_id: 'BOQA-005',
    lab_mode: mode,
    input: {
      load_closed_yaml_input: true,
      input_sha256: sha256File(contractFile),
      finding: input.finding,
      resource: input.resource,
      expected_owner: input.expected_owner,
      prohibited_actor: input.prohibited_actor,
      private_marker: input.private_marker,
      variant_count: 0,
      route_catalog_embedded: false,
      ground_truth_embedded: false,
      token_env_names: [actors.actor_a.token_env, actors.actor_b.token_env],
      binding: {
        expected_owner_id: inputBoundary.expected_owner.id,
        expected_owner_resource_id: inputBoundary.expected_owner.invoice_id,
        prohibited_actor_id: inputBoundary.prohibited_actor.id,
      },
    },
    fixtures: {
      actor_a: { ...actors.actor_a },
      actor_b: { ...actors.actor_b },
    },
    route_graph_sha256: graph.graph_sha256,
    variant_discovery: {
      source_route_id: discovery.source_route_id,
      source_method: discovery.source_method,
      source_template: discovery.source_template,
      normalization: discovery.normalization,
      input_variant_count: discovery.input_variant_count,
      closed_transformations: discovery.transformations,
      derived_count: discovery.variants.length,
      derived_route_ids: discovery.variants.map((candidate) => candidate.route_id),
      newly_confirmed_count: newConfirmed.length,
      newly_confirmed_route_ids: newConfirmed,
      manual_variant_configuration: false,
    },
    independent_ground_truth: {
      source: 'controlled_lab_only',
      matrix_embedded: false,
      route_count: Object.keys(groundTruth).length,
      matrix_sha256: crypto.createHash('sha256').update(canonicalJson(groundTruth)).digest('hex'),
    },
    oracle: {
      vocabulary: ORACLE_VOCABULARY,
      prohibited_signal_classes: [
        'owner_marker',
        'invoice_or_resource_id',
        'tenant_id',
        'sensitive_field',
        'operational_capability',
        'prohibited_metadata',
      ],
      any_single_prohibited_signal_is_contradiction: true,
      ambiguous_response: 'UNPROVEN',
      invalid_owner_control: 'INVALID_EXPERIMENT',
      http_200_alone_is_not_contradiction: true,
      results: oracleResults,
    },
    execution: {
      actors: ['actor_a', 'actor_b'],
      real_credentials: 0,
      external_targets: 0,
      receipts: receipts.map((set) => ({
        route_id: set.candidate.route_id,
        actor_a_own: sanitizeReceipt(set.actor_a_own),
        actor_b_own: sanitizeReceipt(set.actor_b_own),
        actor_a_cross: sanitizeReceipt(set.actor_a_cross),
        actor_b_cross: sanitizeReceipt(set.actor_b_cross),
      })),
    },
    metrics,
    exact_outputs: ['boundary-contract.yaml', 'boundary-regression.spec.ts', 'evidence.json'],
    generated_test_sha256: sha256File(testFile),
  };
  return {
    ...evidence,
    evidence_payload_sha256: crypto.createHash('sha256').update(canonicalJson(evidence)).digest('hex'),
  };
}

function writeEvidence(outDir, evidence) {
  const file = path.join(outDir, 'evidence.json');
  fs.writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return file;
}

module.exports = { ORACLE_VOCABULARY, sha256File, buildEvidence, writeEvidence };
