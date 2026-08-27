function costApproach(data) {
  if (data.propType === 'apartment' || data.propType === 'land') return null;
  const c = getCalibrationForProperty(data.propType).coefficients.cost;
  const build = (data.constructionCost || c.constructionCostPerSqm) * data.area;
  const land = data.landValue || (data.avgPriceSqm ? Math.round(data.avgPriceSqm * data.area * c.landValueFromMarketShare) : Math.round(build * c.landValueFromBuildShare));
  const total = land + build;
  const age = Math.min(50, Math.max(0, 2026 - data.yearBuilt));
  const dep = Math.min(c.maximumDepreciation, age * c.depreciationPerYear);
  const adj = c.conditionFactors[data.condition] ?? 1;
  const value = Math.round(total * (1 - dep) * adj);
  return { method: 'Cost Approach (Replacement)', value, weight: getCalibrationForProperty(data.propType).weights.cost, confidence: data.constructionCost > 0 ? 'medium' : 'low', details: `Land: ${land.toLocaleString()} + Build: ${build.toLocaleString()} AED. Depreciation: ${(dep*100).toFixed(1)}%.`, perSqm: Math.round(value/data.area) };
}
