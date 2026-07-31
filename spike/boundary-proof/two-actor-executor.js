'use strict';

const crypto = require('node:crypto');

function bodySha256(rawBody) {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}

function semanticProjection(body) {
  if (!body || typeof body !== 'object') return null;
  return {
    kind: typeof body.kind === 'string' ? body.kind : null,
    marker: typeof body.marker === 'string' ? body.marker : null,
    owner_id: typeof body.owner_id === 'string' ? body.owner_id : null,
    project_id: typeof body.project_id === 'string' ? body.project_id : null,
    operation: typeof body.operation === 'string' ? body.operation : null,
    reason: typeof body.reason === 'string' ? body.reason : null,
  };
}

async function executeActorRequest({ baseUrl, candidate, actor, token, fetchImpl = fetch }) {
  const response = await fetchImpl(`${baseUrl}${candidate.concrete_path}`, {
    method: candidate.method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  const rawBody = await response.text();
  let body = null;
  try { body = JSON.parse(rawBody); } catch { body = null; }
  return {
    actor,
    route_id: candidate.route_id,
    method: candidate.method,
    path: candidate.concrete_path,
    status: response.status,
    content_type: response.headers.get('content-type'),
    response_body_sha256: bodySha256(rawBody),
    semantic: semanticProjection(body),
  };
}

async function executeTwoActorPlan({ baseUrl, plan, ownerToken, outsiderToken, fetchImpl = fetch }) {
  const receipts = [];
  for (const candidate of plan) {
    const owner = await executeActorRequest({
      baseUrl, candidate, actor: 'owner_control', token: ownerToken, fetchImpl,
    });
    const outsider = await executeActorRequest({
      baseUrl, candidate, actor: 'outsider_control', token: outsiderToken, fetchImpl,
    });
    receipts.push({ candidate, owner, outsider });
  }
  return receipts;
}

module.exports = { executeActorRequest, executeTwoActorPlan, semanticProjection, bodySha256 };
