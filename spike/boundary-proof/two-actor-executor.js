'use strict';

const crypto = require('node:crypto');
const { validateLoopbackBaseUrl } = require('./destination-boundary');

function bodySha256(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function scalarString(value) {
  return typeof value === 'string' ? value : null;
}

function semanticProjection(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return {
    kind: scalarString(body.kind),
    tenant_id: scalarString(body.tenant_id),
    user_id: scalarString(body.user_id),
    account_id: scalarString(body.account_id),
    invoice_id: scalarString(body.invoice_id),
    resource_id: scalarString(body.resource_id),
    marker: scalarString(body.marker),
    sensitive_field: body.sensitive_field ?? null,
    sensitive_fields: Array.isArray(body.sensitive_fields) ? body.sensitive_fields : null,
    operational_capability: body.operational_capability ?? null,
    capabilities: Array.isArray(body.capabilities) ? body.capabilities : null,
    prohibited_metadata: body.prohibited_metadata && typeof body.prohibited_metadata === 'object'
      ? body.prohibited_metadata
      : null,
    error: scalarString(body.error),
  };
}

async function requestActor({ baseUrl, method, path, actor, token, role, targetActor, fetchImpl = fetch }) {
  const safeBaseUrl = validateLoopbackBaseUrl(baseUrl);
  const response = await fetchImpl(`${safeBaseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  const raw = await response.text();
  let body = null;
  try { body = JSON.parse(raw); } catch { body = null; }
  return {
    actor,
    role,
    target_actor: targetActor,
    method,
    path,
    status: response.status,
    content_type: response.headers.get('content-type') || '',
    body_sha256: bodySha256(raw),
    semantic: semanticProjection(body),
  };
}

async function executeCandidate({ baseUrl, candidate, actors, actorAToken, actorBToken, fetchImpl = fetch }) {
  const common = { baseUrl, method: candidate.method, fetchImpl };
  const [actorAOwn, actorBOwn, actorACross, actorBCross] = await Promise.all([
    requestActor({ ...common, path: candidate.path_for_actor_a_resource, actor: 'actor_a', token: actorAToken, role: 'owner_control', targetActor: 'actor_a' }),
    requestActor({ ...common, path: candidate.path_for_actor_b_resource, actor: 'actor_b', token: actorBToken, role: 'owner_control', targetActor: 'actor_b' }),
    requestActor({ ...common, path: candidate.path_for_actor_b_resource, actor: 'actor_a', token: actorAToken, role: 'cross_tenant_probe', targetActor: 'actor_b' }),
    requestActor({ ...common, path: candidate.path_for_actor_a_resource, actor: 'actor_b', token: actorBToken, role: 'cross_tenant_probe', targetActor: 'actor_a' }),
  ]);
  return {
    candidate,
    actor_a_own: actorAOwn,
    actor_b_own: actorBOwn,
    actor_a_cross: actorACross,
    actor_b_cross: actorBCross,
    expected_actor_a: actors.actor_a,
    expected_actor_b: actors.actor_b,
  };
}

async function executeTwoActorMatrix({ baseUrl, candidates, actors, actorAToken, actorBToken, fetchImpl = fetch }) {
  const receipts = [];
  for (const candidate of candidates) {
    receipts.push(await executeCandidate({ baseUrl, candidate, actors, actorAToken, actorBToken, fetchImpl }));
  }
  return receipts;
}

module.exports = { semanticProjection, requestActor, executeCandidate, executeTwoActorMatrix };
