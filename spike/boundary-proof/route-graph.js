'use strict';

const crypto = require('node:crypto');

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

function routeFamily(template) {
  const parts = template.split('/').filter(Boolean);
  return parts.slice(0, 3).join('/');
}

function inferEdges(nodes) {
  const edges = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const left = nodes[i];
      const right = nodes[j];
      const reasons = [];
      if (
        left.authority_boundary === right.authority_boundary
        && left.resource_type === right.resource_type
        && left.resource_parameter === right.resource_parameter
      ) {
        reasons.push('shared_authority_boundary');
      }
      if (routeFamily(left.template) === routeFamily(right.template)) {
        reasons.push('shared_resource_route_family');
      }
      if (reasons.length > 0) {
        edges.push({
          from: left.id < right.id ? left.id : right.id,
          to: left.id < right.id ? right.id : left.id,
          reasons: reasons.sort(),
        });
      }
    }
  }
  return edges.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
}

async function buildRouteGraph(baseUrl, fetchImpl = fetch) {
  const response = await fetchImpl(`${baseUrl}/__boundary/routes`, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Route catalog request failed: ${response.status}`);
  const document = await response.json();
  if (document.schema !== 'boqa.boundary.route-catalog.v1' || !Array.isArray(document.routes)) {
    throw new Error('Invalid route catalog schema');
  }
  const nodes = document.routes.map((route) => ({
    id: String(route.id),
    method: String(route.method).toUpperCase(),
    template: String(route.template),
    resource_type: String(route.resource_type),
    resource_parameter: String(route.resource_parameter),
    authority_boundary: String(route.authority_boundary),
    visibility: String(route.visibility),
    operation: String(route.operation),
  })).sort((a, b) => a.id.localeCompare(b.id));
  const graph = {
    schema: 'boqa.boundary.route-graph.v1',
    nodes,
    edges: inferEdges(nodes),
  };
  return { ...graph, graph_sha256: sha256(canonicalJson(graph)) };
}

module.exports = { buildRouteGraph, inferEdges, routeFamily, canonicalJson, sha256 };
