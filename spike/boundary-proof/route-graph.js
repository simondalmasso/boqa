'use strict';

const crypto = require('node:crypto');
const { validateLoopbackBaseUrl } = require('./destination-boundary');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function inferEdges(nodes) {
  const edges = [];
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const left = nodes[leftIndex];
      const right = nodes[rightIndex];
      const reasons = [];
      if (left.authority_boundary === right.authority_boundary) reasons.push('shared_authority_boundary');
      if (left.resource_type === right.resource_type) reasons.push('shared_resource_type');
      if (left.method === right.method) reasons.push('shared_http_method');
      if (reasons.includes('shared_authority_boundary') && reasons.includes('shared_resource_type')) {
        edges.push({ from: left.id, to: right.id, reasons });
      }
    }
  }
  return edges.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
}

function concretePathForTemplate(template, resourceId) {
  if (template.includes(':accountId')) return null;
  return template.replaceAll(':id', encodeURIComponent(resourceId));
}

function normalizeFindingPath(input, graph) {
  const findingPath = input.finding.path;
  const resourceId = input.resource.id;
  const matches = graph.nodes.filter((node) => concretePathForTemplate(node.template, resourceId) === findingPath);
  if (matches.length !== 1) {
    throw new Error(`Finding path must normalize to exactly one route-catalog operation; matches=${matches.length}`);
  }
  const source = matches[0];
  return Object.freeze({
    source_route_id: source.id,
    source_method: source.method,
    source_template: source.template,
    finding_path: findingPath,
    resource_id: resourceId,
    normalization: 'concrete_resource_id_to_path_parameter',
  });
}

async function buildRouteGraph(baseUrl, fetchImpl = fetch) {
  const safeBaseUrl = validateLoopbackBaseUrl(baseUrl);
  const response = await fetchImpl(`${safeBaseUrl}/__boundary/routes`, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Route catalog request failed: ${response.status}`);
  const document = await response.json();
  if (document.schema !== 'boqa.boundary.route-catalog.v2' || !Array.isArray(document.routes)) {
    throw new Error('Invalid route catalog schema');
  }
  const nodes = document.routes.map((route) => ({
    id: String(route.id),
    method: String(route.method).toUpperCase(),
    template: String(route.template),
    operation: String(route.operation),
    resource_type: String(route.resource_type),
    authority_boundary: String(route.authority_boundary),
    visibility: String(route.visibility),
  })).sort((a, b) => a.id.localeCompare(b.id));
  const graph = { schema: 'boqa.boundary.route-graph.v3', nodes, edges: inferEdges(nodes) };
  return { ...graph, graph_sha256: sha256(canonicalJson(graph)) };
}

module.exports = {
  canonicalJson,
  sha256,
  inferEdges,
  concretePathForTemplate,
  normalizeFindingPath,
  buildRouteGraph,
};
