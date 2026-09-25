'use strict';

const http = require('node:http');
const { URL } = require('node:url');
const vulnerablePolicy = require('./vulnerable-routes');
const fixedPolicy = require('./fixed-routes');
const { ROUTES, INVOICES, actorByToken } = require('./fixtures');

function json(response, status, body) {
  const payload = `${JSON.stringify(body)}\n`;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  response.end(payload);
}

function bearer(request) {
  const header = request.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function matchRoute(url) {
  const pathname = url.pathname;
  let match = pathname.match(/^\/api\/v2\/invoices\/([^/]+)$/);
  if (match) return { route_id: 'v2', invoice_id: decodeURIComponent(match[1]) };
  match = pathname.match(/^\/api\/invoices\/([^/]+)\/export$/);
  if (match) return { route_id: 'export', invoice_id: decodeURIComponent(match[1]) };
  match = pathname.match(/^\/api\/accounts\/([^/]+)\/invoices\/([^/]+)$/);
  if (match) return { route_id: 'nested', account_id: decodeURIComponent(match[1]), invoice_id: decodeURIComponent(match[2]) };
  match = pathname.match(/^\/api\/invoices\/([^/]+)$/);
  if (match) return { route_id: 'original', invoice_id: decodeURIComponent(match[1]) };
  if (pathname === '/api/invoices' && url.searchParams.has('id')) {
    return { route_id: 'query', invoice_id: url.searchParams.get('id') };
  }
  return null;
}

function routeCatalog() {
  return {
    schema: 'boqa.boundary.route-catalog.v2',
    routes: ROUTES.map((route) => ({
      ...route,
      resource_type: 'invoice',
      authority_boundary: 'tenant_account_invoice',
      visibility: 'private',
    })),
  };
}

function createBoundaryHandler({ mode, env }) {
  if (!['vulnerable', 'fixed'].includes(mode)) throw new Error('mode must be vulnerable or fixed');
  if (!env.BOQA_ACTOR_A_TOKEN || !env.BOQA_ACTOR_B_TOKEN) throw new Error('Both synthetic actor tokens are required');
  const policy = mode === 'vulnerable' ? vulnerablePolicy : fixedPolicy;

  return function handler(request, response) {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { status: 'ok', mode });
    if (request.method === 'GET' && url.pathname === '/__boundary/routes') return json(response, 200, routeCatalog());
    if (request.method !== 'GET') return json(response, 405, { error: 'method_not_allowed' });

    const matched = matchRoute(url);
    if (!matched) return json(response, 404, { error: 'not_found' });
    const actor = actorByToken(bearer(request), env);
    if (!actor) return json(response, 401, { error: 'unauthorized' });
    const invoice = INVOICES[matched.invoice_id];
    if (!invoice) return json(response, 404, { error: 'not_found' });
    if (matched.route_id === 'nested' && matched.account_id !== invoice.account_id) return json(response, 404, { error: 'not_found' });

    const ownsInvoice = actor.tenant_id === invoice.tenant_id
      && actor.account_id === invoice.account_id
      && actor.user_id === invoice.user_id;
    if (ownsInvoice || policy[matched.route_id] === true) return json(response, 200, invoice);
    return json(response, 403, { error: 'forbidden' });
  };
}

function startBoundaryLab({ mode, host = '127.0.0.1', port = 0, env = process.env }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(createBoundaryHandler({ mode, env }));
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({ server, host, port: address.port, baseUrl: `http://${host}:${address.port}`, mode });
    });
  });
}

async function cli() {
  const args = process.argv.slice(2);
  const mode = args[args.indexOf('--mode') + 1] || 'vulnerable';
  const port = Number(args[args.indexOf('--port') + 1] || process.env.BOUNDARY_PORT || 0);
  const running = await startBoundaryLab({ mode, port });
  process.stdout.write(`${JSON.stringify({ mode, base_url: running.baseUrl })}\n`);
}

if (require.main === module) cli().catch((error) => { console.error(error.stack || error); process.exit(1); });
module.exports = { createBoundaryHandler, startBoundaryLab, matchRoute, routeCatalog };
