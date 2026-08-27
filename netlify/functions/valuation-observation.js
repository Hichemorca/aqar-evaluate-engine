const crypto = require('crypto');
const { connectLambda, getStore } = require('@netlify/blobs');
const extraFields = require('../../shared/property-extra-fields');
const projectEvidenceIndex = require('../../data/dld-project-evidence-index.json');
const { withSecurityHeaders } = require('../../shared/http-security-headers');

const JSON_HEADERS = withSecurityHeaders({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0'
});
const STORE_NAME = 'aqar-input-observations';
const KEY_PREFIX = 'events/';
const SCHEMA_VERSION = 'v2.1-observation-1';
const CONSENT_VERSION = 'v2.1-observation-consent-1';
const MAX_BODY_BYTES = 32 * 1024;
const PROPERTY_TYPES = new Set(['apartment', 'villa', 'townhouse', 'office', 'retail', 'warehouse', 'land']);
const PROJECT_TYPES = new Set(['apartment', 'villa', 'townhouse']);
const STATUS_VALUES = new Set(['verified-dld', 'unknown', 'unverified-user']);
const EVIDENCE_VALUES = new Set(['ready', 'limited', 'insufficient', 'unavailable']);

function response(statusCode, payload) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(payload) };
}

function isSameOriginRequest(event = {}) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const hostHeader = event.headers?.host || event.headers?.Host || event.headers?.['x-forwarded-host'] || event.headers?.['X-Forwarded-Host'];
  if (!origin || !hostHeader) return true;
  try { return new URL(origin).host === String(hostHeader).split(',')[0].trim(); } catch { return false; }
}

function bodyByteLength(body) { return Buffer.byteLength(String(body || ''), 'utf8'); }

function text(value, max = 160) {
  if (value === undefined || value === null) return null;
  const valueText = String(value).trim();
  return valueText ? valueText.slice(0, max) : null;
}

function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function projectKey(propertyType, district, project) {
  return [propertyType, district, project].map(value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')).join('||');
}

function projectEvidenceCount(propertyType, district, project) {
  return Number(projectEvidenceIndex.projects?.[projectKey(propertyType, district, project)]?.count || 0);
}

function integerOrNull(value) {
  const number = optionalNumber(value);
  return number === null ? null : Number.isInteger(number) ? number : NaN;
}

function validatePayload(payload = {}) {
  const errors = [];
  if (payload?.consent?.analytics !== true) errors.push({ field: 'consent.analytics', code: 'explicit-consent-required' });

  const property = payload.property || {};
  const propertyType = text(property.propertyType, 32)?.toLowerCase();
  const currentYear = new Date().getUTCFullYear();
  const yearBuilt = integerOrNull(property.yearBuilt);
  const propertyInput = {
    propType: propertyType,
    yearBuilt,
    bua: property.bua,
    plotArea: property.plotArea,
    lastRenovationYear: property.lastRenovationYear
  };
  if (!PROPERTY_TYPES.has(propertyType)) errors.push({ field: 'property.propertyType', code: 'property-type-invalid' });
  if (yearBuilt !== null && (!Number.isInteger(yearBuilt) || yearBuilt < 1800 || yearBuilt > currentYear)) errors.push({ field: 'property.yearBuilt', code: 'year-built-invalid' });
  if (!text(property.district, 120)) errors.push({ field: 'property.district', code: 'district-required' });

  const fieldValidation = extraFields.validate(propertyInput, currentYear);
  for (const error of fieldValidation.errors) errors.push({ field: `property.${error.field}`, code: error.code });
  const visibility = fieldValidation.visibility;
  const bua = optionalNumber(property.bua);
  const plotArea = optionalNumber(property.plotArea);
  const renovationYear = integerOrNull(property.lastRenovationYear);
  if (!visibility.bua && bua !== null) errors.push({ field: 'property.bua', code: 'field-not-applicable' });
  if (!visibility.plotArea && plotArea !== null) errors.push({ field: 'property.plotArea', code: 'field-not-applicable' });
  if (!visibility.renovationYear && renovationYear !== null) errors.push({ field: 'property.lastRenovationYear', code: 'field-not-applicable' });

  const project = property.project || {};
  const projectStatus = text(project.status, 32) || 'unknown';
  if (!STATUS_VALUES.has(projectStatus)) errors.push({ field: 'property.project.status', code: 'project-status-invalid' });
  if (!PROJECT_TYPES.has(propertyType) && (text(project.value) || projectStatus !== 'unknown')) errors.push({ field: 'property.project', code: 'project-not-applicable' });
  if (projectStatus === 'verified-dld') {
    if (!PROJECT_TYPES.has(propertyType)) errors.push({ field: 'property.project.status', code: 'verified-project-not-applicable' });
    if (!text(project.value, 180) || text(project.source, 64) !== 'dld-transactions' || !text(project.normalizedKey, 240)) errors.push({ field: 'property.project', code: 'verified-project-source-required' });
    const canonicalKey = projectKey(propertyType, property.district, project.value);
    if (text(project.normalizedKey, 240) !== canonicalKey || projectEvidenceCount(propertyType, property.district, project.value) < 1) errors.push({ field: 'property.project', code: 'project-not-found-in-dld-index' });
  }

  const valuation = payload.valuation || {};
  if (!finitePositive(valuation.baselineValue)) errors.push({ field: 'valuation.baselineValue', code: 'baseline-value-required' });
  if (!finitePositive(valuation.shadowValue)) errors.push({ field: 'valuation.shadowValue', code: 'shadow-value-required' });
  if (valuation.evidenceState !== undefined && !EVIDENCE_VALUES.has(text(valuation.evidenceState, 32))) errors.push({ field: 'valuation.evidenceState', code: 'evidence-state-invalid' });
  const trace = valuation.shadowTrace || {};
  for (const field of ['projectMultiplier', 'buaPlotMultiplier', 'renovationMultiplier', 'combinedMultiplier']) {
    if (trace[field] !== undefined && (!Number.isFinite(Number(trace[field])) || Number(trace[field]) <= 0)) errors.push({ field: `valuation.shadowTrace.${field}`, code: 'multiplier-invalid' });
  }

  if (bodyByteLength(JSON.stringify(payload)) > MAX_BODY_BYTES) errors.push({ field: 'request', code: 'payload-too-large' });
  return { valid: errors.length === 0, errors, propertyType, yearBuilt, bua, plotArea, renovationYear, visibility };
}

function normalizeProject(property, propertyType) {
  const project = property.project || {};
  const status = text(project.status, 32) || 'unknown';
  if (!PROJECT_TYPES.has(propertyType) || status === 'unknown') return { value: null, status: 'unknown', source: null, normalizedKey: null, evidenceCount: 0 };
  const count = projectEvidenceCount(propertyType, property.district, project.value);
  const verified = status === 'verified-dld' && count > 0 && text(project.normalizedKey, 240) === projectKey(propertyType, property.district, project.value);
  return {
    value: verified ? text(project.value, 180) : null,
    status: verified ? 'verified-dld' : 'unknown',
    source: verified ? 'dld-transactions' : null,
    normalizedKey: verified ? projectKey(propertyType, property.district, project.value) : null,
    evidenceCount: verified ? count : 0
  };
}

function normalizeObservation(payload, now = new Date()) {
  const property = payload.property || {};
  const valuation = payload.valuation || {};
  const propertyType = text(property.propertyType, 32)?.toLowerCase();
  const validation = validatePayload(payload);
  const observationId = crypto.randomUUID();
  const createdAt = now.toISOString();
  const cleanOptional = value => optionalNumber(value);
  const cleanInteger = value => { const number = integerOrNull(value); return Number.isInteger(number) ? number : null; };
  const trace = valuation.shadowTrace || {};
  return {
    observationId,
    schemaVersion: SCHEMA_VERSION,
    createdAt,
    source: 'public-valuation-form',
    consent: { analytics: true, consentVersion: CONSENT_VERSION },
    property: {
      propertyType,
      district: text(property.district, 120),
      yearBuilt: cleanInteger(property.yearBuilt),
      area: cleanOptional(property.area),
      bedrooms: cleanOptional(property.bedrooms),
      detailedUnitType: text(property.detailedUnitType, 120),
      floor: text(property.floor, 40),
      parkingCount: cleanOptional(property.parkingCount),
      project: normalizeProject(property, propertyType),
      bua: validation.visibility.bua ? cleanOptional(property.bua) : null,
      plotArea: validation.visibility.plotArea ? cleanOptional(property.plotArea) : null,
      lastRenovationYear: validation.visibility.renovationYear ? cleanInteger(property.lastRenovationYear) : null
    },
    valuation: {
      baselineValue: cleanOptional(valuation.baselineValue),
      shadowValue: cleanOptional(valuation.shadowValue),
      shadowTrace: {
        projectMultiplier: cleanOptional(trace.projectMultiplier),
        buaPlotMultiplier: cleanOptional(trace.buaPlotMultiplier),
        renovationMultiplier: cleanOptional(trace.renovationMultiplier),
        combinedMultiplier: cleanOptional(trace.combinedMultiplier)
      },
      calibrationConfigId: text(valuation.calibrationConfigId, 120),
      evidenceState: text(valuation.evidenceState, 32) || null
    },
    outcome: { status: 'not-provided', value: null, currency: 'AED', source: null, verified: false }
  };
}

function createStore(event) {
  connectLambda(event);
  return getStore(STORE_NAME);
}

async function handler(event) {
  if (event.httpMethod !== 'POST') return response(405, { success: false, error: 'Use POST' });
  if (!isSameOriginRequest(event)) return response(403, { success: false, error: 'Observation origin is not allowed' });
  const contentLength = Number(event.headers?.['content-length'] || event.headers?.['Content-Length'] || 0);
  if (contentLength > MAX_BODY_BYTES) return response(413, { success: false, error: 'Observation payload is too large' });
  if (!event.body || bodyByteLength(event.body) > MAX_BODY_BYTES) return response(400, { success: false, error: 'Observation payload is invalid' });

  let payload;
  try { payload = JSON.parse(event.body); } catch { return response(400, { success: false, error: 'Observation payload is invalid' }); }
  const validation = validatePayload(payload);
  if (!validation.valid) return response(400, { success: false, error: 'Observation payload failed validation', errors: validation.errors });

  try {
    const observation = normalizeObservation(payload);
    const store = createStore(event);
    const date = new Date(observation.createdAt);
    const key = `${KEY_PREFIX}${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${observation.observationId}.json`;
    await store.setJSON(key, observation);
    return response(201, { success: true, observationId: observation.observationId });
  } catch (error) {
    console.error('Observation storage error:', error?.message || 'unknown');
    return response(503, { success: false, error: 'Observation could not be stored' });
  }
}

module.exports = { handler, validatePayload, normalizeObservation, isSameOriginRequest, constants: { STORE_NAME, KEY_PREFIX, SCHEMA_VERSION, CONSENT_VERSION, MAX_BODY_BYTES } };
