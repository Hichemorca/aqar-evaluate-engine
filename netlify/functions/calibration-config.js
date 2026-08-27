const crypto = require('crypto');
const { connectLambda, getStore } = require('@netlify/blobs');
const calibrationDefaults = require('../../shared/aqar-calibration-defaults');
const { deepMergeKnown, validateConfig } = require('../../shared/calibration-validation');
const { withSecurityHeaders } = require('../../shared/http-security-headers');

const JSON_HEADERS = withSecurityHeaders({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0'
});
const STORE_NAME = 'aqar-calibration';
const ACTIVE_KEY = 'active';
const HISTORY_KEY = 'history/index';

function getEnv(name) {
  try {
    const netlifyValue = globalThis.Netlify?.env?.get?.(name);
    if (netlifyValue) return netlifyValue;
  } catch {
    // Fall through to the Lambda-compatible environment accessor.
  }
  return typeof process !== 'undefined' && process.env ? process.env[name] : undefined;
}

function response(statusCode, payload) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(payload) };
}

function safeEqual(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAuthorized(event) {
  const configuredToken = getEnv('AQAR_ADMIN_TOKEN');
  const authorization = event.headers?.authorization || event.headers?.Authorization || '';
  const suppliedToken = authorization.replace(/^Bearer\s+/i, '').trim();
  return configuredToken ? safeEqual(suppliedToken, configuredToken) : false;
}

function createStore(event) {
  connectLambda(event);
  return getStore(STORE_NAME);
}

async function readActive(store) {
  const stored = await store.get(ACTIVE_KEY, { type: 'json' });
  return deepMergeKnown(calibrationDefaults.createDefaultCalibrationConfig(), stored || {});
}

async function readHistory(store) {
  return (await store.get(HISTORY_KEY, { type: 'json' })) || [];
}

async function handler(event) {
  if (!['GET', 'POST'].includes(event.httpMethod)) return response(405, { success: false, error: 'Use GET or POST' });
  const includeHistory = event.queryStringParameters?.history === 'true';
  const configuredToken = getEnv('AQAR_ADMIN_TOKEN');

  if (event.httpMethod === 'POST' && !configuredToken) {
    return response(503, { success: false, error: 'AQAR_ADMIN_TOKEN is not configured' });
  }
  if (event.httpMethod === 'POST' || includeHistory) {
    if (!isAuthorized(event)) return response(401, { success: false, error: 'Unauthorized' });
  }

  try {
    const store = createStore(event);
    if (event.httpMethod === 'GET') {
      const config = await readActive(store);
      return response(200, { success: true, config, history: includeHistory ? await readHistory(store) : undefined });
    }

    const payload = JSON.parse(event.body || '{}');
    const defaults = calibrationDefaults.createDefaultCalibrationConfig();
    const current = await readActive(store);
    const candidate = deepMergeKnown(defaults, payload.config || payload);
    candidate.configId = `cal-${Date.now()}`;
    candidate.status = 'active';
    candidate.createdAt = current.createdAt || new Date().toISOString();
    candidate.updatedAt = new Date().toISOString();
    candidate.updatedBy = 'admin';
    candidate.engineVersion = current.engineVersion || defaults.engineVersion;
    candidate.propertyTypes = deepMergeKnown(defaults.propertyTypes, payload.config?.propertyTypes || payload.propertyTypes || {});

    const validation = validateConfig(candidate);
    if (!validation.valid) return response(400, { success: false, error: 'Invalid calibration configuration', errors: validation.errors });

    await store.setJSON(ACTIVE_KEY, candidate);
    const history = await readHistory(store);
    history.unshift({ configId: candidate.configId, updatedAt: candidate.updatedAt, updatedBy: candidate.updatedBy, engineVersion: candidate.engineVersion });
    await store.setJSON(`history/${candidate.configId}`, candidate);
    await store.setJSON(HISTORY_KEY, history.slice(0, 50));
    return response(200, { success: true, config: candidate, message: 'Calibration configuration saved and active for new valuations' });
  } catch (error) {
    console.error('Calibration API error:', error);
    return response(500, { success: false, error: 'Calibration configuration could not be read or saved' });
  }
}

module.exports = { handler, validateConfig, deepMergeKnown, getEnv, isAuthorized };
