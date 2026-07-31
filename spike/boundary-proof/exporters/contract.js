'use strict';

const fs = require('node:fs');
const path = require('node:path');

function scalar(value) {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const entries = Object.entries(item);
        const [firstKey, firstValue] = entries[0];
        const lines = [`${pad}- ${firstKey}: ${firstValue && typeof firstValue === 'object' ? '' : scalar(firstValue)}`];
        if (firstValue && typeof firstValue === 'object') lines.push(toYaml(firstValue, indent + 4));
        for (const [key, child] of entries.slice(1)) {
          if (child && typeof child === 'object') {
            lines.push(`${' '.repeat(indent + 2)}${key}:`);
            lines.push(toYaml(child, indent + 4));
          } else {
            lines.push(`${' '.repeat(indent + 2)}${key}: ${scalar(child)}`);
          }
        }
        return lines.join('\n');
      }
      return `${pad}- ${scalar(item)}`;
    }).join('\n');
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, child]) => {
      if (child && typeof child === 'object') {
        return `${pad}${key}:\n${toYaml(child, indent + 2)}`;
      }
      return `${pad}${key}: ${scalar(child)}`;
    }).join('\n');
  }
  return `${pad}${scalar(value)}`;
}

function buildContract({ finding, graph, variants, protectedCases, publicControl }) {
  return {
    schema: 'boqa.boundary.contract.v1',
    finding: {
      id: finding.id,
      category: finding.category,
      method: finding.method,
      original_route_template: finding.route_template,
      authority_boundary: finding.authority_boundary,
      resource_type: finding.resource_type,
      resource_parameter: finding.resource_parameter,
    },
    discovery: {
      route_graph_sha256: graph.graph_sha256,
      related_variant_count: variants.length,
      relation_required: 'shared_authority_boundary',
    },
    actors: {
      owner: { credential_env: 'BOUNDARY_OWNER_TOKEN', purpose: 'positive_private_control' },
      outsider: { credential_env: 'BOUNDARY_OUTSIDER_TOKEN', purpose: 'negative_authority_control' },
    },
    invariant: {
      categorical_rule: 'outsider_must_not_receive_same_semantic_private_resource_as_owner',
      status_only_is_proof: false,
      required_private_kind: finding.expected_private_kind,
    },
    protected_cases: protectedCases.map((item) => ({
      id: item.id,
      source: item.source,
      method: item.method,
      path: item.concrete_path,
      route_template: item.route_template,
      operation: item.operation,
    })),
    public_control: {
      id: publicControl.id,
      method: publicControl.method,
      path: publicControl.concrete_path,
      route_template: publicControl.route_template,
    },
    expected_outputs: [
      'boundary-contract.yaml',
      'boundary-regression.spec.ts',
      'evidence.json',
    ],
  };
}

function writeContract(outDir, contract) {
  const file = path.join(outDir, 'boundary-contract.yaml');
  fs.writeFileSync(file, `${toYaml(contract)}\n`, 'utf8');
  return file;
}

module.exports = { buildContract, writeContract, toYaml };
