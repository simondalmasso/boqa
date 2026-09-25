'use strict';

const LOOPBACK_BASE_URL_PATTERN = /^http:\/\/(?:(127\.0\.0\.1|localhost):([1-9][0-9]{0,4})|\[::1\]:([1-9][0-9]{0,4}))\/?$/;

function validateLoopbackBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string' || baseUrl.length === 0 || baseUrl !== baseUrl.trim()) {
    throw new Error('BOQA-005 baseUrl must be an exact loopback HTTP URL with an explicit port');
  }

  const match = LOOPBACK_BASE_URL_PATTERN.exec(baseUrl);
  if (!match) {
    throw new Error('BOQA-005 compiler is restricted to http://127.0.0.1:<port>, http://localhost:<port>, or http://[::1]:<port>');
  }

  const portText = match[2] || match[3];
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || String(port) !== portText) {
    throw new Error('BOQA-005 loopback port must be canonical and between 1 and 65535');
  }

  const parsed = new URL(baseUrl);
  if (
    parsed.protocol !== 'http:'
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.pathname !== '/'
    || parsed.search !== ''
    || parsed.hash !== ''
  ) {
    throw new Error('BOQA-005 baseUrl contains a prohibited URL component');
  }

  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

module.exports = { validateLoopbackBaseUrl };
