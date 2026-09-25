'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_INPUT_PATH, loadClosedBoundaryInput } = require('./finding-loader');
const { validateLoopbackBaseUrl } = require('./destination-boundary');
const { buildRouteGraph } = require('./route-graph');
const { generateRelatedVariants } = require('./variant-generator');
const { executeTwoActorMatrix } = require('./two-actor-executor');
const { evaluateBoundary, calculateMetrics } = require('./boundary-oracle');
const { ACTORS, materializePath, groundTruthFor } = require('./lab/fixtures');
const { writeClosedContractCopy } = require('./exporters/contract');
const { writeStandaloneTest } = require('./exporters/playwright-test');
const { buildEvidence, writeEvidence } = require('./exporters/evidence');

function resolveInputBoundary(input, actors) {
  const expectedOwner = actors[input.expected_owner];
  const prohibitedActor = actors[input.prohibited_actor];
  if (!expectedOwner || !prohibitedActor || expectedOwner.id === prohibitedActor.id) {
    throw new Error('Input actor boundary is invalid');
  }
  if (expectedOwner.invoice_id !== input.resource.id) throw new Error('Input resource does not belong to expected_owner fixture');
  if (expectedOwner.marker !== input.private_marker) throw new Error('Input private marker does not match expected_owner fixture');
  if (materializePath('/api/invoices/:id', expectedOwner) !== input.finding.path) {
    throw new Error('Input finding path does not identify the expected_owner resource');
  }
  return Object.freeze({ expected_owner: expectedOwner, prohibited_actor: prohibitedActor });
}

async function compileBoundary({
  baseUrl,
  outDir,
  labMode,
  contractPath = DEFAULT_INPUT_PATH,
  actorAToken = process.env.BOQA_ACTOR_A_TOKEN,
  actorBToken = process.env.BOQA_ACTOR_B_TOKEN,
  fetchImpl = fetch,
}) {
  if (!baseUrl || !outDir) throw new Error('baseUrl and outDir are required');
  const safeBaseUrl = validateLoopbackBaseUrl(baseUrl);
  if (!['vulnerable', 'fixed'].includes(labMode)) throw new Error('labMode must be vulnerable or fixed');
  if (!actorAToken || !actorBToken) throw new Error('BOQA_ACTOR_A_TOKEN and BOQA_ACTOR_B_TOKEN are required');
  fs.mkdirSync(outDir, { recursive: true });

  const { input, raw } = loadClosedBoundaryInput(contractPath);
  const inputBoundary = resolveInputBoundary(input, ACTORS);
  const graph = await buildRouteGraph(safeBaseUrl, fetchImpl);
  const discovery = generateRelatedVariants(input, graph, ACTORS);
  const receipts = await executeTwoActorMatrix({
    baseUrl: safeBaseUrl,
    candidates: discovery.candidates,
    actors: ACTORS,
    actorAToken,
    actorBToken,
    fetchImpl,
  });
  const oracleResults = receipts.map((receiptSet) => ({
    route_id: receiptSet.candidate.route_id,
    source: receiptSet.candidate.source,
    ...evaluateBoundary(receiptSet),
  }));
  const groundTruth = groundTruthFor(labMode);
  const metrics = calculateMetrics(oracleResults, groundTruth);

  const contractOutput = writeClosedContractCopy(outDir, raw);
  const testFile = writeStandaloneTest(outDir, { actors: ACTORS, candidates: discovery.candidates });
  const evidence = buildEvidence({
    mode: labMode,
    input,
    actors: ACTORS,
    inputBoundary,
    groundTruth,
    graph,
    discovery,
    receipts,
    oracleResults,
    metrics,
    contractFile: contractOutput.file,
    testFile,
  });
  const evidenceFile = writeEvidence(outDir, evidence);

  return {
    input,
    actors: ACTORS,
    inputBoundary,
    groundTruth,
    graph,
    discovery,
    receipts,
    oracleResults,
    metrics,
    evidence,
    files: { contractFile: contractOutput.file, testFile, evidenceFile },
  };
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function cli() {
  const result = await compileBoundary({
    baseUrl: readArg('--base-url'),
    outDir: path.resolve(readArg('--out-dir', path.join(__dirname, 'output'))),
    labMode: readArg('--lab-mode', 'vulnerable'),
    contractPath: path.resolve(readArg('--contract', DEFAULT_INPUT_PATH)),
  });
  process.stdout.write(`${JSON.stringify({
    source_route_id: result.discovery.source_route_id,
    input_variant_count: result.discovery.input_variant_count,
    derived_variants: result.discovery.variants.map((candidate) => candidate.route_id),
    metrics: result.metrics,
    verdicts: result.oracleResults.map(({ route_id, verdict }) => ({ route_id, verdict })),
  })}\n`);
}

if (require.main === module) cli().catch((error) => { console.error(error.stack || error); process.exit(1); });
module.exports = { resolveInputBoundary, compileBoundary };
