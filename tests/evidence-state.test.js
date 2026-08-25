const test = require('node:test');
const assert = require('node:assert/strict');
const { STATES, classifyEvidenceState, getEvidencePresentation } = require('../shared/evidence-state');

test('classifies ten or more comparables as ready', () => {
  assert.equal(classifyEvidenceState({ found: true, count: 10 }), STATES.READY);
  assert.equal(getEvidencePresentation(STATES.READY).tone, 'success');
});

test('classifies five to nine comparables as limited without blocking calculation', () => {
  assert.equal(classifyEvidenceState({ found: true, count: 5 }), STATES.LIMITED);
  assert.equal(classifyEvidenceState({ found: true, count: 9 }), STATES.LIMITED);
  assert.equal(getEvidencePresentation(STATES.LIMITED).tone, 'warning');
});

test('classifies no-sufficient-data responses as insufficient', () => {
  assert.equal(classifyEvidenceState({ found: false, reason: 'no-sufficient-data' }), STATES.INSUFFICIENT);
  assert.match(getEvidencePresentation(STATES.INSUFFICIENT).message, /No fallback price/);
});

test('classifies transport failures as unavailable', () => {
  assert.equal(classifyEvidenceState({ found: false, error: true }), STATES.UNAVAILABLE);
  assert.equal(getEvidencePresentation(STATES.UNAVAILABLE).tone, 'error');
});
