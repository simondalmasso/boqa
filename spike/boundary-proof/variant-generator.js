'use strict';

const { materializePath } = require('./lab/fixtures');
const { normalizeFindingPath } = require('./route-graph');

const CLOSED_TRANSFORMATIONS = Object.freeze([
  Object.freeze({ id: 'original', kind: 'identity', derive: (source) => source }),
  Object.freeze({ id: 'v2', kind: 'version_prefix_v2', derive: (source) => source.replace('/api/', '/api/v2/') }),
  Object.freeze({ id: 'export', kind: 'export_suffix', derive: (source) => `${source}/export` }),
  Object.freeze({
    id: 'nested',
    kind: 'account_scope_nesting',
    derive: (source) => source.replace('/api/invoices/:id', '/api/accounts/:accountId/invoices/:id'),
  }),
  Object.freeze({
    id: 'query',
    kind: 'path_parameter_to_query_parameter',
    derive: (source) => source.replace('/api/invoices/:id', '/api/invoices?id=:id'),
  }),
]);

function relationReasons(graph, sourceId, candidateId) {
  const edge = graph.edges.find((item) => (
    (item.from === sourceId && item.to === candidateId)
    || (item.from === candidateId && item.to === sourceId)
  ));
  return edge ? [...edge.reasons] : [];
}

function classifyClosedTransformation(sourceTemplate, candidateTemplate) {
  return CLOSED_TRANSFORMATIONS.find((transform) => transform.derive(sourceTemplate) === candidateTemplate) || null;
}

function candidateFromNode(node, actors, source, transform, graph) {
  return {
    id: transform.kind === 'identity' ? `source-${node.id}` : `variant-${node.id}`,
    route_id: node.id,
    source: transform.kind === 'identity' ? 'known_finding' : 'derived_related_variant',
    method: node.method,
    route_template: node.template,
    operation: node.operation,
    authority_boundary: node.authority_boundary,
    resource_type: node.resource_type,
    transformation: transform.kind,
    path_for_actor_a_resource: materializePath(node.template, actors.actor_a),
    path_for_actor_b_resource: materializePath(node.template, actors.actor_b),
    relation_reasons: transform.kind === 'identity'
      ? ['normalized_source_operation']
      : ['closed_transformation', ...relationReasons(graph, source.source_route_id, node.id)],
  };
}

function generateRelatedVariants(input, graph, actors) {
  const source = normalizeFindingPath(input, graph);
  if (source.source_route_id !== 'original' || source.source_template !== '/api/invoices/:id') {
    throw new Error('The only allowed normalized source operation is original=/api/invoices/:id');
  }
  const sourceNode = graph.nodes.find((node) => node.id === source.source_route_id);
  const compatible = graph.nodes.filter((node) => (
    node.method === sourceNode.method
    && node.authority_boundary === sourceNode.authority_boundary
    && node.resource_type === sourceNode.resource_type
  ));

  const candidatesByTransform = new Map();
  for (const node of compatible) {
    const transform = classifyClosedTransformation(source.source_template, node.template);
    if (!transform) continue;
    if (node.id !== transform.id) throw new Error(`Route catalog id/transform mismatch: ${node.id}/${transform.id}`);
    candidatesByTransform.set(transform.id, candidateFromNode(node, actors, source, transform, graph));
  }
  const candidates = CLOSED_TRANSFORMATIONS.map((transform) => candidatesByTransform.get(transform.id));
  if (candidates.some((candidate) => !candidate)) throw new Error('Route catalog is missing a closed derived operation');

  return {
    source_route_id: source.source_route_id,
    source_method: source.source_method,
    source_template: source.source_template,
    normalization: source.normalization,
    input_variant_count: 0,
    transformations: CLOSED_TRANSFORMATIONS.map(({ id, kind }) => ({ id, kind })),
    candidates,
    variants: candidates.filter((candidate) => candidate.source === 'derived_related_variant'),
  };
}

module.exports = {
  CLOSED_TRANSFORMATIONS,
  relationReasons,
  classifyClosedTransformation,
  generateRelatedVariants,
};
