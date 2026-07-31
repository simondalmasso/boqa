'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { canonicalJson } = require('../route-graph');

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function normalizeReceipt(receiptPair) {
  return {
    candidate: {
      id: receiptPair.candidate.id,
      route_id: receiptPair.candidate.route_id,
      method: receiptPair.candidate.method,
      path: receiptPair.candidate.concrete_path,
      source: receiptPair.candidate.source || receiptPair.candidate.control,
    },
    owner: receiptPair.owner,
    outsider: receiptPair.outsider,
  };
}

function buildEvidence({ mode, finding, graph, variants, receipts, oracleResults, metrics, contractFile, testFile }) {
  const evidence = {
    schema: 'boqa.boundary.evidence.v1',
    mission_id: 'BOQA-005',
    lab_mode: mode,
    source_finding_id: finding.id,
    deterministic_identity: {
      route_graph_sha256: graph.graph_sha256,
      contract_sha256: sha256File(contractFile),
      generated_test_sha256: sha256File(testFile),
    },
    variant_discovery: {
      generated_count: variants.length,
      generated_route_ids: variants.map((item) => item.route_id),
      manual_variant_configuration: false,
    },
    execution: {
      actor_model: ['owner_control', 'outsider_control'],
      external_targets: 0,
      receipts: receipts.map(normalizeReceipt),
    },
    oracle: {
      status_only_means_vulnerability: false,
      results: oracleResults,
    },
    metrics,
    exact_outputs: [
      'boundary-contract.yaml',
      'boundary-regression.spec.ts',
      'evidence.json',
    ],
  };
  return { ...evidence, evidence_payload_sha256: crypto.createHash('sha256').update(canonicalJson(evidence)).digest('hex') };
}

function writeEvidence(outDir, evidence) {
  const file = path.join(outDir, 'evidence.json');
  fs.writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return file;
}

module.exports = { buildEvidence, writeEvidence, sha256File };
