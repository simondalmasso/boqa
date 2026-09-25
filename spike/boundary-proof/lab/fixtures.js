'use strict';

const ACTOR_A = Object.freeze({
  id: 'actor_a', tenant_label: 'Tenant A', user_label: 'Usuario A', tenant_id: 'tenant-a', user_id: 'user-a',
  account_id: '7', invoice_id: '481', marker: 'BOQA_TENANT_A_7F39', token_env: 'BOQA_ACTOR_A_TOKEN',
});
const ACTOR_B = Object.freeze({
  id: 'actor_b', tenant_label: 'Tenant B', user_label: 'Usuario B', tenant_id: 'tenant-b', user_id: 'user-b',
  account_id: '9', invoice_id: '902', marker: 'BOQA_TENANT_B_3C21', token_env: 'BOQA_ACTOR_B_TOKEN',
});
const ACTORS = Object.freeze({ actor_a: ACTOR_A, actor_b: ACTOR_B });

const ROUTES = Object.freeze([
  Object.freeze({ id: 'original', method: 'GET', template: '/api/invoices/:id', operation: 'invoice_read' }),
  Object.freeze({ id: 'v2', method: 'GET', template: '/api/v2/invoices/:id', operation: 'invoice_read_v2' }),
  Object.freeze({ id: 'export', method: 'GET', template: '/api/invoices/:id/export', operation: 'invoice_export' }),
  Object.freeze({ id: 'nested', method: 'GET', template: '/api/accounts/:accountId/invoices/:id', operation: 'account_invoice_read' }),
  Object.freeze({ id: 'query', method: 'GET', template: '/api/invoices?id=:id', operation: 'invoice_query_read' }),
]);

const VULNERABLE_GROUND_TRUTH = Object.freeze({
  original: 'PROTECTED',
  v2: 'VULNERABLE',
  export: 'VULNERABLE',
  nested: 'VULNERABLE',
  query: 'PROTECTED',
});
const FIXED_GROUND_TRUTH = Object.freeze({
  original: 'PROTECTED',
  v2: 'PROTECTED',
  export: 'PROTECTED',
  nested: 'PROTECTED',
  query: 'PROTECTED',
});
const LAB_GROUND_TRUTH = Object.freeze({
  vulnerable: VULNERABLE_GROUND_TRUTH,
  fixed: FIXED_GROUND_TRUTH,
});

function invoiceFor(actor) {
  return Object.freeze({
    kind: 'private_invoice',
    tenant_id: actor.tenant_id,
    user_id: actor.user_id,
    account_id: actor.account_id,
    invoice_id: actor.invoice_id,
    resource_id: actor.invoice_id,
    marker: actor.marker,
    sensitive_field: `payment-reference-${actor.invoice_id}`,
    operational_capability: 'invoice_export',
    prohibited_metadata: Object.freeze({ ledger_partition: `tenant-ledger-${actor.account_id}` }),
  });
}

const INVOICES = Object.freeze({
  [ACTOR_A.invoice_id]: invoiceFor(ACTOR_A),
  [ACTOR_B.invoice_id]: invoiceFor(ACTOR_B),
});

function materializePath(template, target) {
  return template
    .replaceAll(':accountId', encodeURIComponent(target.account_id))
    .replaceAll(':id', encodeURIComponent(target.invoice_id));
}

function actorByToken(token, env) {
  if (token && token === env.BOQA_ACTOR_A_TOKEN) return ACTOR_A;
  if (token && token === env.BOQA_ACTOR_B_TOKEN) return ACTOR_B;
  return null;
}

function groundTruthFor(mode) {
  const matrix = LAB_GROUND_TRUTH[mode];
  if (!matrix) throw new Error(`Unknown lab ground-truth mode: ${mode}`);
  return matrix;
}

module.exports = {
  ACTOR_A,
  ACTOR_B,
  ACTORS,
  ROUTES,
  INVOICES,
  VULNERABLE_GROUND_TRUTH,
  FIXED_GROUND_TRUTH,
  LAB_GROUND_TRUTH,
  materializePath,
  actorByToken,
  groundTruthFor,
};
