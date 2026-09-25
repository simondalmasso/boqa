'use strict';

const VERDICTS = Object.freeze({
  CONTRADICTED: 'CONTRADICTED',
  NOT_CONTRADICTED: 'NOT_CONTRADICTED_IN_TESTED_SCOPE',
  UNPROVEN: 'UNPROVEN',
  INVALID: 'INVALID_EXPERIMENT',
});

function exactPrivateInvoice(receipt, expected) {
  const semantic = receipt?.semantic;
  return Boolean(
    receipt?.status === 200
    && semantic
    && semantic.kind === 'private_invoice'
    && semantic.tenant_id === expected.tenant_id
    && semantic.user_id === expected.user_id
    && semantic.account_id === expected.account_id
    && (semantic.invoice_id === expected.invoice_id || semantic.resource_id === expected.invoice_id)
    && semantic.marker === expected.marker
  );
}

function hasValue(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function prohibitedSignals(receipt, expected) {
  const semantic = receipt?.semantic;
  if (!semantic || typeof semantic !== 'object') return [];
  const signals = [];
  if (semantic.marker === expected.marker) signals.push('owner_marker');
  if (semantic.invoice_id === expected.invoice_id || semantic.resource_id === expected.invoice_id) {
    signals.push('invoice_or_resource_id');
  }
  if (semantic.tenant_id === expected.tenant_id) signals.push('tenant_id');
  if (hasValue(semantic.sensitive_field) || hasValue(semantic.sensitive_fields)) signals.push('sensitive_field');
  if (hasValue(semantic.operational_capability) || hasValue(semantic.capabilities)) {
    signals.push('operational_capability');
  }
  if (hasValue(semantic.prohibited_metadata)) signals.push('prohibited_metadata');
  return signals;
}

function definitiveDenial(receipt) {
  return Boolean(receipt && [401, 403, 404].includes(receipt.status));
}

function evaluateBoundary(receiptSet) {
  const required = ['actor_a_own', 'actor_b_own', 'actor_a_cross', 'actor_b_cross', 'expected_actor_a', 'expected_actor_b'];
  if (!receiptSet || required.some((key) => !receiptSet[key])) {
    return { verdict: VERDICTS.INVALID, contradiction: false, basis: ['invalid_fixture_missing_required_receipt'] };
  }

  const ownerAValid = exactPrivateInvoice(receiptSet.actor_a_own, receiptSet.expected_actor_a);
  const ownerBValid = exactPrivateInvoice(receiptSet.actor_b_own, receiptSet.expected_actor_b);
  if (!ownerAValid || !ownerBValid) {
    return {
      verdict: VERDICTS.INVALID,
      contradiction: false,
      basis: ['invalid_fixture_owner_controls_failed'],
      owner_controls: { actor_a: ownerAValid, actor_b: ownerBValid },
    };
  }

  const actorAReceived = prohibitedSignals(receiptSet.actor_a_cross, receiptSet.expected_actor_b);
  const actorBReceived = prohibitedSignals(receiptSet.actor_b_cross, receiptSet.expected_actor_a);
  if (actorAReceived.length > 0 || actorBReceived.length > 0) {
    return {
      verdict: VERDICTS.CONTRADICTED,
      contradiction: true,
      basis: ['cross_tenant_prohibited_signal_disclosed'],
      disclosures: {
        actor_a_received_actor_b_signals: actorAReceived,
        actor_b_received_actor_a_signals: actorBReceived,
      },
    };
  }

  if (definitiveDenial(receiptSet.actor_a_cross) && definitiveDenial(receiptSet.actor_b_cross)) {
    return {
      verdict: VERDICTS.NOT_CONTRADICTED,
      contradiction: false,
      basis: ['both_cross_tenant_probes_definitively_denied'],
    };
  }

  return {
    verdict: VERDICTS.UNPROVEN,
    contradiction: false,
    basis: ['ambiguous_response_does_not_prove_boundary'],
    http_200_alone_is_not_contradiction: true,
  };
}

function calculateMetrics(oracleResults, groundTruth) {
  const metrics = {
    true_positives: 0,
    false_positives: 0,
    false_negatives: 0,
    true_negatives: 0,
    unproven: 0,
    invalid_experiments: 0,
  };
  for (const result of oracleResults) {
    const expected = groundTruth[result.route_id];
    if (!['VULNERABLE', 'PROTECTED'].includes(expected)) throw new Error(`Missing independent ground truth: ${result.route_id}`);
    const positive = result.verdict === VERDICTS.CONTRADICTED;
    if (result.verdict === VERDICTS.UNPROVEN) metrics.unproven += 1;
    if (result.verdict === VERDICTS.INVALID) metrics.invalid_experiments += 1;
    if (expected === 'VULNERABLE' && positive) metrics.true_positives += 1;
    if (expected === 'VULNERABLE' && !positive) metrics.false_negatives += 1;
    if (expected === 'PROTECTED' && positive) metrics.false_positives += 1;
    if (expected === 'PROTECTED' && !positive) metrics.true_negatives += 1;
  }
  return metrics;
}

module.exports = {
  VERDICTS,
  exactPrivateInvoice,
  prohibitedSignals,
  definitiveDenial,
  evaluateBoundary,
  calculateMetrics,
};
