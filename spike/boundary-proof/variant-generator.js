'use strict';

function materialize(template, finding) {
  return template.replace(`:${finding.resource_parameter}`, encodeURIComponent(finding.resource_id));
}

function relatedReasons(graph, originalId, candidateId) {
  const edge = graph.edges.find((item) => (
    (item.from === originalId && item.to === candidateId)
    || (item.from === candidateId && item.to === originalId)
  ));
  return edge ? edge.reasons : [];
}

function generateRelatedVariants(finding, graph) {
  const original = graph.nodes.find((node) => (
    node.method === finding.method && node.template === finding.route_template
  ));
  if (!original) throw new Error('Known finding route is absent from route graph');

  const variants = graph.nodes
    .filter((node) => node.id !== original.id)
    .filter((node) => node.method === finding.method)
    .filter((node) => node.authority_boundary === finding.authority_boundary)
    .filter((node) => node.resource_type === finding.resource_type)
    .filter((node) => node.resource_parameter === finding.resource_parameter)
    .map((node) => ({
      id: `variant-${node.id}`,
      source_finding_id: finding.id,
      route_id: node.id,
      method: node.method,
      route_template: node.template,
      concrete_path: materialize(node.template, finding),
      authority_boundary: node.authority_boundary,
      resource_type: node.resource_type,
      operation: node.operation,
      relation_reasons: relatedReasons(graph, original.id, node.id),
    }))
    .filter((variant) => variant.relation_reasons.includes('shared_authority_boundary'))
    .sort((a, b) => a.route_id.localeCompare(b.route_id));

  return {
    original_route_id: original.id,
    variants,
  };
}

function selectPublicControl(finding, graph) {
  const node = graph.nodes
    .filter((item) => item.method === finding.method)
    .filter((item) => item.resource_type === finding.resource_type)
    .filter((item) => item.visibility === 'public')
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!node) throw new Error('Public negative control route is absent from route graph');
  return {
    id: `control-${node.id}`,
    route_id: node.id,
    method: node.method,
    route_template: node.template,
    concrete_path: materialize(node.template, finding),
    authority_boundary: node.authority_boundary,
    resource_type: node.resource_type,
    operation: node.operation,
    control: 'public_non_private_resource',
  };
}

module.exports = { generateRelatedVariants, selectPublicControl, materialize };
