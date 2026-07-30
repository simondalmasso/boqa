#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { canonicalJson, validateClosedContract } = require('../lib/safe-lab-hunter-contract-v1');

const START = '// BOQA_SAFE_LAB_PREVIEW_BUILD_START';
const END = '// BOQA_SAFE_LAB_PREVIEW_BUILD_END';
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const CHECKSUM_PATTERN = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/;
const PUBLIC_DASHBOARD_FILES = ['index.html', 'app.js', 'dashboard-state.js', 'style.css', 'mobile.css'];
const SAFE_LAB_WRANGLER = [
  'name = "boqa"',
  'main = "worker.js"',
  'compatibility_date = "2024-12-01"',
  'preview_urls = true',
  '',
  '[assets]',
  'directory = "./dashboard"',
  'binding = "ASSETS"',
  'run_worker_first = true',
  '',
].join('\n');

function fail(code, detail) { const error = new Error(detail ? `${code}:${detail}` : code); error.code = code; throw error; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function readContract(contractPath, checksumPath, expectedSourceSha) {
  if (!SHA_PATTERN.test(expectedSourceSha || '')) fail('SOURCE_SHA_INVALID');
  const raw = fs.readFileSync(contractPath, 'utf8');
  if (!raw.endsWith('\n')) fail('CONTRACT_NOT_CANONICAL');
  let contract;
  try { contract = JSON.parse(raw); } catch (_) { fail('CONTRACT_JSON_INVALID'); }
  validateClosedContract(contract);
  if (`${canonicalJson(contract)}\n` !== raw) fail('CONTRACT_NOT_CANONICAL');
  if (contract.source_sha !== expectedSourceSha) fail('SOURCE_SHA_MISMATCH');
  const checksumLine = fs.readFileSync(checksumPath, 'utf8').trim();
  const match = CHECKSUM_PATTERN.exec(checksumLine);
  if (!match || match[2] !== path.basename(contractPath)) fail('CONTRACT_CHECKSUM_FORMAT_INVALID');
  const actual = sha256(raw);
  if (match[1] !== actual) fail('CONTRACT_CHECKSUM_MISMATCH');
  return { contract, raw, checksum: `sha256:${actual}` };
}

function verifyBuildObject(build) {
  if (!build || build.enabled !== true) fail('SAFE_LAB_BUILD_DISABLED');
  if (!SHA_PATTERN.test(String(build.source_sha || ''))) fail('SOURCE_SHA_INVALID');
  if (build.promotion_ready !== false || build.promotion_blocker !== 'CONTROLLED_LAB_PREVIEW') fail('PROMOTION_POLICY_INVALID');
  validateClosedContract(build.contract);
  if (build.contract.source_sha !== build.source_sha) fail('SOURCE_SHA_MISMATCH');
  const expected = `sha256:${sha256(`${canonicalJson(build.contract)}\n`)}`;
  if (build.contract_checksum !== expected) fail('EMBEDDED_CONTRACT_CHECKSUM_MISMATCH');
  return true;
}

function replaceBuildBlock(workerSource, build) {
  verifyBuildObject(build);
  const startIndex = workerSource.indexOf(START);
  const endIndex = workerSource.indexOf(END);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) fail('WORKER_BUILD_MARKER_MISSING');
  if (workerSource.indexOf(START, startIndex + START.length) >= 0 || workerSource.indexOf(END, endIndex + END.length) >= 0) fail('WORKER_BUILD_MARKER_DUPLICATE');
  const replacement = `${START}\nconst SAFE_LAB_PREVIEW_BUILD = Object.freeze(${JSON.stringify(build, null, 2)});\n${END}`;
  return workerSource.slice(0, startIndex) + replacement + workerSource.slice(endIndex + END.length);
}

function copyPublicDashboard(source, destination) {
  fs.mkdirSync(destination, { recursive: false });
  for (const file of PUBLIC_DASHBOARD_FILES) {
    const sourcePath = path.join(source, file);
    if (!fs.existsSync(sourcePath)) fail('PUBLIC_DASHBOARD_FILE_MISSING', file);
    fs.copyFileSync(sourcePath, path.join(destination, file), fs.constants.COPYFILE_EXCL);
  }
}

function compileDashboardIndex(index, build) {
  const marker = 'data-environment="unknown"';
  if ((index.match(/data-environment="unknown"/g) || []).length !== 1) fail('DASHBOARD_BUILD_MARKER_INVALID');
  return index.replace(marker, `data-environment="controlled_lab" data-source-sha="${build.source_sha}" data-contract-checksum="${build.contract_checksum}"`);
}

function listBundleFiles(root) {
  const files = [];
  (function walk(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail('BUNDLE_SYMLINK_FORBIDDEN', relative);
      if (entry.isDirectory()) walk(absolute, relative);
      else if (entry.isFile()) files.push(relative);
      else fail('BUNDLE_FILE_TYPE_FORBIDDEN', relative);
    }
  }(root));
  return files.sort();
}

function writeBundleChecksums(outputDir) {
  const files = listBundleFiles(outputDir).filter((file) => file !== 'SHA256SUMS');
  const lines = files.map((file) => `${sha256(fs.readFileSync(path.join(outputDir, file)))}  ${file}`).join('\n');
  fs.writeFileSync(path.join(outputDir, 'SHA256SUMS'), `${lines}\n`, { flag: 'wx' });
  return files;
}

function buildSafeLabPreviewBundle(options) {
  if (options.mode !== 'true') fail('SAFE_LAB_PREVIEW_BUILD_NOT_EXPLICIT');
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const outputDir = path.resolve(options.outputDir);
  if (fs.existsSync(outputDir)) fail('OUTPUT_ALREADY_EXISTS');
  const sourceSha = String(options.expectedSourceSha || '').trim();
  const verified = readContract(path.resolve(options.contractPath), path.resolve(options.checksumPath), sourceSha);
  const build = {
    enabled: true,
    source_sha: sourceSha,
    contract_checksum: verified.checksum,
    promotion_ready: false,
    promotion_blocker: 'CONTROLLED_LAB_PREVIEW',
    contract: verified.contract,
  };
  verifyBuildObject(build);
  fs.mkdirSync(outputDir, { recursive: false });
  const workerSource = fs.readFileSync(path.join(root, 'worker.js'), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'worker.js'), replaceBuildBlock(workerSource, build), { flag: 'wx' });
  fs.writeFileSync(path.join(outputDir, 'wrangler.toml'), SAFE_LAB_WRANGLER, { flag: 'wx' });
  copyPublicDashboard(path.join(root, 'dashboard'), path.join(outputDir, 'dashboard'));
  const indexPath = path.join(outputDir, 'dashboard', 'index.html');
  fs.writeFileSync(indexPath, compileDashboardIndex(fs.readFileSync(indexPath, 'utf8'), build));
  const policy = {
    schema_version: 1,
    environment: 'controlled_lab',
    source_sha: sourceSha,
    contract_checksum: verified.checksum,
    promotion_ready: false,
    promotion_blocker: 'CONTROLLED_LAB_PREVIEW',
    production_changed: false,
    deploy_performed: false,
  };
  fs.writeFileSync(path.join(outputDir, 'promotion-policy.json'), `${canonicalJson(policy)}\n`, { flag: 'wx' });
  const files = writeBundleChecksums(outputDir);
  verifyBuildObject(JSON.parse(JSON.stringify(build)));
  return { outputDir, policy, build, files };
}

function main() {
  const [contractPath, checksumPath, expectedSourceSha, outputDir] = process.argv.slice(2);
  if (!contractPath || !checksumPath || !expectedSourceSha || !outputDir) {
    console.error('Usage: BOQA_SAFE_LAB_PREVIEW=true node scripts/build-safe-lab-preview-bundle.js <contract-json> <contract-sha256> <source-sha> <output-dir>');
    process.exit(2);
  }
  try {
    const result = buildSafeLabPreviewBundle({ root: path.join(__dirname, '..'), contractPath, checksumPath, expectedSourceSha, outputDir, mode: process.env.BOQA_SAFE_LAB_PREVIEW });
    process.stdout.write(`${canonicalJson(result.policy)}\n`);
  } catch (error) { console.error(error.code || error.message); process.exit(1); }
}

if (require.main === module) main();
module.exports = {
  PUBLIC_DASHBOARD_FILES,
  SAFE_LAB_WRANGLER,
  buildSafeLabPreviewBundle,
  compileDashboardIndex,
  listBundleFiles,
  readContract,
  replaceBuildBlock,
  verifyBuildObject,
  writeBundleChecksums,
};
