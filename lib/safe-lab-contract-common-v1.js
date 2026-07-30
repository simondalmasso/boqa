'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CHECKSUM_PATTERN = /^([a-f0-9]{64})  ([A-Za-z0-9._/-]+)$/;

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    fail('INVALID_JSON', path.basename(filePath));
  }
}

function assertExactKeys(value, allowed, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SCHEMA', context);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail('UNKNOWN_CRITICAL_FIELD', `${context}.${key}`);
  }
}

function assertSha(value, code) {
  if (!SHA_PATTERN.test(String(value || ''))) fail(code);
}

function assertSha256(value, code) {
  if (!SHA256_PATTERN.test(String(value || ''))) fail(code);
}

function assertRunId(value) {
  if (!/^[0-9]+$/.test(String(value || ''))) fail('WORKFLOW_RUN_ID_INVALID');
}

function assertRunAttempt(value) {
  if (!/^[1-9][0-9]*$/.test(String(value || ''))) fail('WORKFLOW_RUN_ATTEMPT_INVALID');
}

function assertNonEmpty(value, code) {
  if (typeof value !== 'string' || !value.trim()) fail(code);
  return value.trim();
}

function parseIso(value, context) {
  if (typeof value !== 'string') fail('TIMESTAMP_INVALID', context);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) fail('TIMESTAMP_INVALID', context);
  return ms;
}

function listFiles(root) {
  const files = [];
  (function walk(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail('EVIDENCE_SYMLINK_FORBIDDEN', relative);
      if (entry.isDirectory()) walk(absolute, relative);
      else if (entry.isFile()) files.push(relative);
      else fail('EVIDENCE_FILE_TYPE_FORBIDDEN', relative);
    }
  }(root));
  return files.sort();
}

function parseChecksums(evidenceDir) {
  const checksumPath = path.join(evidenceDir, 'SHA256SUMS');
  if (!fs.existsSync(checksumPath)) fail('CHECKSUM_FILE_MISSING');
  const entries = new Map();
  for (const line of fs.readFileSync(checksumPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const match = CHECKSUM_PATTERN.exec(line);
    if (!match) fail('CHECKSUM_FORMAT_INVALID');
    const [, digest, relative] = match;
    if (relative.includes('..') || path.isAbsolute(relative)) fail('CHECKSUM_PATH_INVALID', relative);
    if (entries.has(relative)) fail('CHECKSUM_DUPLICATE_PATH', relative);
    entries.set(relative, digest);
  }
  return entries;
}

module.exports = {
  CHECKSUM_PATTERN,
  SHA_PATTERN,
  SHA256_PATTERN,
  assertExactKeys,
  assertNonEmpty,
  assertRunAttempt,
  assertRunId,
  assertSha,
  assertSha256,
  canonicalJson,
  canonicalize,
  fail,
  listFiles,
  parseChecksums,
  parseIso,
  readJson,
  sha256,
};
