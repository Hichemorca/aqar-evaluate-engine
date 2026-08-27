'use strict';

const SECURITY_HEADERS = Object.freeze({
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
});

function withSecurityHeaders(headers = {}) {
  return { ...SECURITY_HEADERS, ...headers };
}

module.exports = { SECURITY_HEADERS, withSecurityHeaders };
