function calculateWeightedValue(valuations, propData) {
  if (!valuations.length) {
    const fb = (propData.avgPriceSqm || 4000) * propData.area;
    return { finalValue: Math.round(fb), confidence: 'low', confidencePct: 25, valuations: [], range: { low: Math.round(fb * .8), high: Math.round(fb * 1.2) } };
  }

  // The shared calibration engine owns the weighted combination contract for browser and batch paths.
  const methodNames = {
    'Sales Comparison Approach': 'sales-comparison',
    'Income Capitalization Approach': 'income',
    'Cost Approach (Replacement)': 'cost',
    'DCF Analysis (10-Year)': 'dcf'
  };
  const propertyConfig = getCalibrationForProperty(propData.propType);
  const methodResults = valuations.map(v => ({
    method: methodNames[v.method] || (v.method.startsWith('DCF Analysis') ? 'dcf' : v.method),
    status: 'APPLIED',
    value: v.value,
    weight: v.weight,
    assumptions: []
  }));
  const combined = AQAR_CALIBRATION_ENGINE.combineMethodResults(
    methodResults,
    propertyConfig,
    AQAR_ACTIVE_CALIBRATION.configId || 'base-22.1'
  );
  const final = combined.value;
  const shadowConfig = window.aqarV21ShadowConfig || AQAR_V21_SHADOW_MULTIPLIERS.createNeutralConfig();
  const shadowTrace = AQAR_V21_SHADOW_MULTIPLIERS.compute(propData, shadowConfig);
  
  let confidencePct = 60;
  if (valuations.some(v => v.confidence === 'high')) confidencePct += 20;
  if (valuations.length >= 3) confidencePct += 10;
  if (valuations.length >= 4) confidencePct += 5;
  confidencePct = Math.min(95, Math.max(20, confidencePct));
  const vals = valuations.map(v => v.value);
  return { finalValue: final, confidence: confidencePct >= 75 ? 'high' : confidencePct >= 50 ? 'medium' : 'low', confidencePct: confidencePct, valuations, range: { low: Math.round(Math.min(...vals)*.92), high: Math.round(Math.max(...vals)*1.08) }, shadowEnabled: Boolean(shadowConfig.enabled), shadowValue: Math.round(final * shadowTrace.multiplier), shadowMultiplier: shadowTrace.multiplier, shadowTrace };
}
