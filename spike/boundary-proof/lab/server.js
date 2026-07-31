#!/usr/bin/env node
'use strict';

const http = require('node:http');
const {
  ROUTE_CATALOG,
  actorFromAuthorization,
  privatePayload,
  publicPayload,
} = require('./fixtures');

function parseArgs(argv) {
  const args = { mode: 'vulnerable', host: '127.0.0.1', port: 0 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode') args.mode = argv[++i];
    else if (arg === '--host') args.host = argv[++i];
    else if (arg === '--port') args.port = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['vulnerable', 'fixed'].includes(args.mode)) {
    throw new Error(`Unsupported lab mode: ${args.mode}`);
  }
  if (!Number.isInteger(args.port) || args.port < 0 || args.port > 65535) {
    throw new Error(`Invalid port: ${args.port}`);
  }
  return args;
}

function compileMatcher(template) {
  const escaped = template
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '([^/]+)' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${escaped}$`);
}

const MATCHERS = ROUTE_CATALOG.map((route) => ({ ...route, matcher: compileMatcher(route.template) }));

function sendJson(res, status, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function createBoundaryLab({ mode, env = process.env }) {
  if (!env.BOUNDARY_OWNER_TOKEN || !env.BOUNDARY_OUTSIDER_TOKEN) {
    throw new Error('BOUNDARY_OWNER_TOKEN and BOUNDARY_OUTSIDER_TOKEN are required');
  }
  if (env.BOUNDARY_OWNER_TOKEN === env.BOUNDARY_OUTSIDER_TOKEN) {
    throw new Error('Owner and outsider tokens must differ');
  }

  const policy = mode === 'vulnerable'
    ? require('./vulnerable-routes')
    : require('./fixed-routes');

  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { status: 'ok', lab: 'boundary-proof', mode });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/__boundary/routes') {
      sendJson(res, 200, {
        schema: 'boqa.boundary.route-catalog.v1',
        routes: ROUTE_CATALOG,
      });
      return;
    }
    if (req.method !== 'GET') {
      sendJson(res, 405, { kind: 'method_not_allowed' });
      return;
    }

    const matched = MATCHERS.find((route) => route.matcher.test(url.pathname));
    if (!matched) {
      sendJson(res, 404, { kind: 'not_found' });
      return;
    }

    const match = url.pathname.match(matched.matcher);
    const projectId = decodeURIComponent(match[1]);
    const actor = actorFromAuthorization(req.headers.authorization, env);
    const decision = policy.decideAccess(matched, actor);
    if (!decision.allowed) {
      sendJson(res, actor ? 403 : 401, {
        kind: 'access_denied',
        reason: decision.reason,
        project_id: projectId,
      });
      return;
    }

    const payload = matched.visibility === 'private'
      ? privatePayload(matched, projectId)
      : publicPayload(matched, projectId);
    sendJson(res, 200, payload);
  });
}

async function startBoundaryLab(options) {
  const server = createBoundaryLab(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });
  const address = server.address();
  return {
    server,
    host: options.host,
    port: address.port,
    baseUrl: `http://${options.host}:${address.port}`,
    mode: options.mode,
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const running = await startBoundaryLab(options);
  process.stdout.write(`${JSON.stringify({ event: 'BOUNDARY_LAB_READY', mode: running.mode, host: running.host, port: running.port })}\n`);
  const close = () => running.server.close(() => process.exit(0));
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = { createBoundaryLab, startBoundaryLab, parseArgs };
