#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadKnownFinding, validateFinding } = require('./finding-loader');
const { buildRouteGraph } = require('./route-graph');
const { generateRelatedVariants, selectPublicControl } = require('./variant-generator');
const { executeTwoActorPlan } = require('./two-actor-executor');
const { evaluatePlan } = require('./boundary-oracle');
const { buildContract, writeContract } = require('./exporters/contract');
const { writeStandaloneTest } = require('./exporters/playwright-test');
const { buildEvidence, writeEvidence } = require('./exporters/evidence');

function parseArgs(argv) {
  const args = { baseUrl: null, outDir: process.cwd(), labMode: 'unknown' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base-url') args.baseUrl = argv[++i];
    else if (arg === '--out-dir') args.outDir = argv[++i];
    else if (arg === '--lab-mode') args.labMode = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.baseUrl) throw new Error('--base-url is required');
  if (!['vulnerable', 'fixed', 'unknown'].includes(args.labMode)) {
    throw new Error('--lab-mode must be vulnerable, fixed, or unknown');
  }
  const parsed = new URL(args.baseUrl);
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error('BOQA-005 compiler is restricted to loopback controlled labs');
  }
  return args;
}

function seedCandidate(finding, originalRouteId) {
  return {
    id: `seed-${originalRouteId}`,
    source: 'known_finding',
    source_finding_id: finding.id,
    route_id: originalRouteId,
    method: finding.method,
    route_template: finding.route_template,
    concrete_path: finding.concrete_path,
    authority_boundary: finding.authority_boundary,
    resource_type: finding.resource_type,
    operation: 'read',
  };
}

function calculateMetrics({ mode, plan, oracleResults }) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (let i = 0; i < plan.length; i += 1) {
    const candidate = plan[i];
    const detected = oracleResults[i].contradiction;
    const planted = mode === 'vulnerable' && candidate.authority_boundary !== 'public';
    if (detected && planted) tp += 1;
    else if (detected && !planted) fp += 1;
    else if (!detected && planted) fn += 1;
    else tn += 1;
  }
  return {
    true_positives: tp,
    false_positives: fp,
    false_negatives: fn,
    true_negatives: tn,
    contradictions: oracleResults.filter((item) => item.contradiction).length,
    protected_cases: plan.filter((item) => item.authority_boundary !== 'public').length,
    public_controls: plan.filter((item) => item.authority_boundary === 'public').length,
  };
}

async function compileBoundary({ baseUrl, outDir, labMode, ownerToken, outsiderToken, fetchImpl = fetch }) {
  if (!ownerToken || !outsiderToken) throw new Error('Owner and outsider credentials are required');
  if (ownerToken === outsiderToken) throw new Error('Owner and outsider credentials must differ');
  fs.mkdirSync(outDir, { recursive: true });

  const finding = validateFinding(loadKnownFinding());
  const graph = await buildRouteGraph(baseUrl, fetchImpl);
  const generated = generateRelatedVariants(finding, graph);
  if (generated.variants.length < 1) throw new Error('No related authorization variants were inferred');
  const publicControl = selectPublicControl(finding, graph);
  const protectedCases = [
    seedCandidate(finding, generated.original_route_id),
    ...generated.variants.map((variant) => ({ ...variant, source: 'inferred_related_variant' })),
  ];
  const plan = [...protectedCases, publicControl];
  const receipts = await executeTwoActorPlan({
    baseUrl,
    plan,
    ownerToken,
    outsiderToken,
    fetchImpl,
  });
  const oracleResults = evaluatePlan(receipts, finding);
  const metrics = calculateMetrics({ mode: labMode, plan, oracleResults });

  const contract = buildContract({
    finding,
    graph,
    variants: generated.variants,
    protectedCases,
    publicControl,
  });
  const contractFile = writeContract(outDir, contract);
  const testFile = writeStandaloneTest(outDir, { finding, protectedCases, publicControl });
  const evidence = buildEvidence({
    mode: labMode,
    finding,
    graph,
    variants: generated.variants,
    receipts,
    oracleResults,
    metrics,
    contractFile,
    testFile,
  });
  const evidenceFile = writeEvidence(outDir, evidence);

  return {
    finding,
    graph,
    variants: generated.variants,
    protectedCases,
    publicControl,
    receipts,
    oracleResults,
    metrics,
    files: { contractFile, testFile, evidenceFile },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const result = await compileBoundary({
    ...args,
    ownerToken: process.env.BOUNDARY_OWNER_TOKEN,
    outsiderToken: process.env.BOUNDARY_OUTSIDER_TOKEN,
  });
  process.stdout.write(`${JSON.stringify({
    event: 'BOUNDARY_COMPILE_COMPLETE',
    variants: result.variants.length,
    metrics: result.metrics,
    outputs: Object.values(result.files).map((file) => path.basename(file)).sort(),
  })}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = { compileBoundary, parseArgs, seedCandidate, calculateMetrics };
