const crypto = require('crypto');
const { connectLambda, getStore } = require('@netlify/blobs');
const calibrationDefaults = require('../../shared/aqar-calibration-defaults');

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const STORE_NAME = 'aqar-calibration';
const ACTIVE_KEY = 'active';
const HISTORY_KEY = 'history/index';

function getEnv(name) {
  return typeof Netlify !== 'undefined' && Netlify?.env?.get ? Netlify.env.get(name) : undefined;
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

function deepMergeKnown(base, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return base;
  const output = { ...base };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.prototype.hasOwnProperty.call(base, key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      output[key] = deepMergeKnown(base[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function validateNumericLeaves(value, path, errors) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) errors.push(`${path} must be finite`);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) validateNumericLeaves(child, `${path}.${key}`, errors);
}

function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') errors.push('configuration must be an object');
  if (config?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  for (const propertyType of calibrationDefaults.PROPERTY_TYPES) {
    const property = config?.propertyTypes?.[propertyType];
    if (!property) {
      errors.push(`missing property type: ${propertyType}`);
      continue;
    }
    for (const method of calibrationDefaults.METHOD_KEYS) {
      const weight = property.weights?.[method];
      if (!Number.isFinite(Number(weight)) || Number(weight) < 0 || Number(weight) > 1) {
        errors.push(`${propertyType}.weights.${method} must be between 0 and 1`);
      }
    }
    const totalWeight = calibrationDefaults.METHOD_KEYS.reduce((sum, method) => sum + Number(property.weights?.[method] || 0), 0);
    if (totalWeight <= 0) errors.push(`${propertyType} must have at least one positive method weight`);
    const applicable = new Set(property.applicableMethods || []);
    if (![...applicable].every(method => calibrationDefaults.METHOD_KEYS.includes(method))) errors.push(`${propertyType}.applicableMethods contains an unknown method`);
  }
  validateNumericLeaves(config?.gis, 'gis', errors);
  for (const propertyType of calibrationDefaults.PROPERTY_TYPES) validateNumericLeaves(config?.propertyTypes?.[propertyType]?.coefficients, `${propertyType}.coefficients`, errors);
  return { valid: errors.length === 0, errors };
}

function createStore(event) {
  connectLambda(event);
  return getStore(STORE_NAME);
}

async function readActive(store) {
  return (await store.get(ACTIVE_KEY, { type: 'json' })) || calibrationDefaults.createDefaultCalibrationConfig();
}

async function readHistory(store) {
  return (await store.get(HISTORY_KEY, { type: 'json' })) || [];
}

async function handler(event) {
  if (!['GET', 'POST'].includes(event.httpMethod)) return response(405, { success: false, error: 'Use GET or POST' });
  const includeHistory = event.queryStringParameters?.history === 'true';
  if (event.httpMethod === 'POST' && !getEnv('AQAR_ADMIN_TOKEN')) return response(503, { success: false, error: 'AQAR_ADMIN_TOKEN is not configured' });
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

module.exports = { handler, validateConfig, deepMergeKnown };
