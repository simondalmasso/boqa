'use strict';

function isProvenPrivateOwnerControl(receipt, finding) {
  const semantic = receipt?.semantic;
  return Boolean(
    receipt?.status === 200
    && semantic
    && semantic.kind === finding.expected_private_kind
    && semantic.marker === finding.expected_private_marker
    && semantic.owner_id === finding.expected_owner_id
    && semantic.project_id === finding.resource_id
  );
}

function outsiderHasSamePrivateAuthority(receipt, ownerReceipt, finding) {
  const semantic = receipt?.semantic;
  const ownerSemantic = ownerReceipt?.semantic;
  return Boolean(
    semantic
    && ownerSemantic
    && semantic.kind === finding.expected_private_kind
    && semantic.marker === ownerSemantic.marker
    && semantic.marker === finding.expected_private_marker
    && semantic.owner_id === ownerSemantic.owner_id
    && semantic.owner_id === finding.expected_owner_id
    && semantic.project_id === finding.resource_id
  );
}

function evaluateBoundary(receiptPair, finding) {
  const ownerProvesPrivate = isProvenPrivateOwnerControl(receiptPair.owner, finding);
  const outsiderProvesSameAuthority = ownerProvesPrivate
    && outsiderHasSamePrivateAuthority(receiptPair.outsider, receiptPair.owner, finding);

  return {
    candidate_id: receiptPair.candidate.id,
    route_id: receiptPair.candidate.route_id,
    path: receiptPair.candidate.concrete_path,
    owner_private_control_proven: ownerProvesPrivate,
    outsider_same_private_authority_proven: outsiderProvesSameAuthority,
    contradiction: outsiderProvesSameAuthority,
    verdict: outsiderProvesSameAuthority ? 'boundary_contradicted' : 'boundary_held',
    basis: outsiderProvesSameAuthority
      ? 'outsider_received_the_same_semantic_private_resource_as_the_owner_control'
      : ownerProvesPrivate
        ? 'owner_private_control_proven_and_outsider_did_not_receive_the_same_private_resource'
        : 'semantic_private_owner_control_not_proven_so_http_status_is_not_treated_as_authority',
  };
}

function evaluatePlan(receipts, finding) {
  return receipts.map((pair) => evaluateBoundary(pair, finding));
}

module.exports = {
  isProvenPrivateOwnerControl,
  outsiderHasSamePrivateAuthority,
  evaluateBoundary,
  evaluatePlan,
};
