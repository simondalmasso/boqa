'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function writeClosedContractCopy(outDir, rawContract) {
  const file = path.join(outDir, 'boundary-contract.yaml');
  fs.writeFileSync(file, rawContract, 'utf8');
  return { file, sha256: sha256Buffer(Buffer.from(rawContract, 'utf8')) };
}

module.exports = { writeClosedContractCopy, sha256Buffer };
