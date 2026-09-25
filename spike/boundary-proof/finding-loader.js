'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_INPUT_PATH = path.join(__dirname, 'boundary-contract.yaml');
const EXPECTED_TOP_LEVEL_KEYS = Object.freeze([
  'finding',
  'resource',
  'expected_owner',
  'prohibited_actor',
  'private_marker',
]);
const FORBIDDEN_INPUT_KEYS = Object.freeze([
  'variants',
  'routes',
  'route_catalog',
  'ground_truth',
  'source_route_id',
]);

function scalar(value) {
  const input = value.trim();
  if (input === 'true') return true;
  if (input === 'false') return false;
  if (input === 'null') return null;
  if (/^-?\d+$/.test(input)) return Number(input);
  if (input.startsWith('"') && input.endsWith('"')) return JSON.parse(input);
  if (input.startsWith("'") && input.endsWith("'")) return input.slice(1, -1);
  return input;
}

function parseClosedYaml(text) {
  const lines = text.split(/\r?\n/)
    .map((raw, index) => ({ raw, index: index + 1 }))
    .filter(({ raw }) => raw.trim() && !raw.trimStart().startsWith('#'))
    .map(({ raw, index }) => ({
      indent: raw.match(/^ */)[0].length,
      text: raw.trim(),
      line: index,
    }));

  function parseBlock(start, indent) {
    if (start >= lines.length) return { value: {}, next: start };
    const isArray = lines[start].text.startsWith('- ');
    const value = isArray ? [] : {};
    let cursor = start;

    while (cursor < lines.length) {
      const line = lines[cursor];
      if (line.indent < indent) break;
      if (line.indent > indent) throw new Error(`Unexpected indentation at YAML line ${line.line}`);

      if (isArray) {
        if (!line.text.startsWith('- ')) throw new Error(`Mixed YAML collection at line ${line.line}`);
        const rest = line.text.slice(2).trim();
        if (!rest) {
          const nested = parseBlock(cursor + 1, indent + 2);
          value.push(nested.value);
          cursor = nested.next;
          continue;
        }
        const split = rest.match(/^([^:]+):(.*)$/);
        if (!split) {
          value.push(scalar(rest));
          cursor += 1;
          continue;
        }
        const item = {};
        const key = split[1].trim();
        const tail = split[2].trim();
        item[key] = tail ? scalar(tail) : null;
        cursor += 1;
        while (cursor < lines.length && lines[cursor].indent > indent) {
          const child = lines[cursor];
          if (child.indent !== indent + 2 || child.text.startsWith('- ')) {
            throw new Error(`Invalid YAML list item at line ${child.line}`);
          }
          const childSplit = child.text.match(/^([^:]+):(.*)$/);
          if (!childSplit) throw new Error(`Invalid YAML mapping at line ${child.line}`);
          const childKey = childSplit[1].trim();
          const childTail = childSplit[2].trim();
          if (childTail) {
            item[childKey] = scalar(childTail);
            cursor += 1;
          } else {
            const nested = parseBlock(cursor + 1, child.indent + 2);
            item[childKey] = nested.value;
            cursor = nested.next;
          }
        }
        value.push(item);
        continue;
      }

      if (line.text.startsWith('- ')) throw new Error(`Mixed YAML collection at line ${line.line}`);
      const split = line.text.match(/^([^:]+):(.*)$/);
      if (!split) throw new Error(`Invalid YAML mapping at line ${line.line}`);
      const key = split[1].trim();
      const tail = split[2].trim();
      if (Object.hasOwn(value, key)) throw new Error(`Duplicate YAML key ${key}`);
      if (tail) {
        value[key] = scalar(tail);
        cursor += 1;
      } else if (cursor + 1 >= lines.length || lines[cursor + 1].indent <= indent) {
        value[key] = {};
        cursor += 1;
      } else {
        const nested = parseBlock(cursor + 1, lines[cursor + 1].indent);
        value[key] = nested.value;
        cursor = nested.next;
      }
    }
    return { value, next: cursor };
  }

  if (lines.length === 0) throw new Error('Closed YAML input is empty');
  const parsed = parseBlock(0, lines[0].indent);
  if (parsed.next !== lines.length) throw new Error('Trailing YAML content');
  return parsed.value;
}

function deepKeys(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    for (const item of value) deepKeys(item, output);
    return output;
  }
  for (const [key, nested] of Object.entries(value)) {
    output.push(key);
    deepKeys(nested, output);
  }
  return output;
}

function assertExact(value, expected, label) {
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new Error(`Closed input mismatch: ${label}`);
  }
}

function validateMinimalFindingInput(input) {
  assertExact(Object.keys(input), EXPECTED_TOP_LEVEL_KEYS, 'top-level keys');
  assertExact(input.finding, { path: '/api/invoices/481' }, 'finding');
  assertExact(input.resource, { id: '481' }, 'resource');
  if (input.expected_owner !== 'actor_a') throw new Error('expected_owner must be actor_a');
  if (input.prohibited_actor !== 'actor_b') throw new Error('prohibited_actor must be actor_b');
  if (input.private_marker !== 'BOQA_TENANT_A_7F39') throw new Error('private_marker mismatch');

  const presentForbidden = deepKeys(input).filter((key) => FORBIDDEN_INPUT_KEYS.includes(key));
  if (presentForbidden.length > 0) {
    throw new Error(`Forbidden compiler-input key: ${presentForbidden.join(',')}`);
  }
  return input;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function loadClosedBoundaryInput(filePath = DEFAULT_INPUT_PATH) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const input = validateMinimalFindingInput(parseClosedYaml(raw));
  return { input: deepFreeze(input), raw, filePath: path.resolve(filePath) };
}

function loadKnownFinding(filePath = DEFAULT_INPUT_PATH) {
  const { input } = loadClosedBoundaryInput(filePath);
  return Object.freeze({
    path: input.finding.path,
    resource_id: input.resource.id,
    expected_owner: input.expected_owner,
    prohibited_actor: input.prohibited_actor,
    private_marker: input.private_marker,
  });
}

module.exports = {
  DEFAULT_INPUT_PATH,
  EXPECTED_TOP_LEVEL_KEYS,
  FORBIDDEN_INPUT_KEYS,
  parseClosedYaml,
  validateMinimalFindingInput,
  loadClosedBoundaryInput,
  loadKnownFinding,
};
