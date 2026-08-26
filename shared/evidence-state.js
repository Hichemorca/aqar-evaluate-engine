(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.AQAR_EVIDENCE_STATE = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STATES = Object.freeze({
    READY: 'ready',
    LIMITED: 'limited',
    INSUFFICIENT: 'insufficient',
    UNAVAILABLE: 'unavailable'
  });

  function classifyEvidenceState({ found, count = 0, reason = '', error = false } = {}) {
    const numericCount = Number(count) || 0;
    if (error) return STATES.UNAVAILABLE;
    if (!found) return STATES.INSUFFICIENT;
    if (numericCount < 5) return STATES.INSUFFICIENT;
    if (numericCount < 10) return STATES.LIMITED;
    return STATES.READY;
  }

  function getEvidencePresentation(state) {
    switch (state) {
      case STATES.READY:
        return { tone: 'success', title: 'Market evidence available', message: 'The valuation can use comparable sales.' };
      case STATES.LIMITED:
        return { tone: 'warning', title: 'Limited market evidence', message: 'A valuation may be calculated, but the comparable sample is limited. Review the evidence before relying on the result.' };
      case STATES.UNAVAILABLE:
        return { tone: 'error', title: 'Market data unavailable', message: 'The market-data service could not be reached. No synthetic market price will be created.' };
      case STATES.INSUFFICIENT:
      default:
        return { tone: 'warning', title: 'Insufficient market evidence', message: 'There are not enough comparable sales for a reliable estimate. No fallback price will be invented.' };
    }
  }

  return Object.freeze({ STATES, classifyEvidenceState, getEvidencePresentation });
});
