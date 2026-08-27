function dcfApproach(data) {
  const calibration = getCalibrationForProperty(data.propType);
  if (!calibration.applicableMethods.includes('dcf') || !data.annualRent || data.annualRent <= 0) return null;
  const c = calibration.coefficients.dcf;
  const cur = data.avgPriceSqm ? data.avgPriceSqm * data.area : data.annualRent / c.fallbackCapRate;
  if (cur <= 0) return null;
  let npv = -cur, runVal = cur, runRent = data.annualRent;
  for (let y = 1; y <= c.years; y++) {
    runRent *= 1 + c.rentGrowthRate; runVal *= 1 + c.valueGrowthRate;
    npv += (runRent * c.netOperatingIncomeRate) / Math.pow(1 + c.discountRate, y);
    if (y === c.years) npv += (runVal * c.terminalValueRate) / Math.pow(1 + c.discountRate, c.years);
  }
  const value = npv > 0 ? Math.round(npv) : Math.round(cur * c.negativeNpvFallback);
  return { method: `DCF Analysis (${c.years}-Year)`, value, weight: calibration.weights.dcf, confidence: 'medium', details: `${c.years}-year projection. Rent growth: ${(c.rentGrowthRate*100).toFixed(1)}%/yr. Value growth: ${(c.valueGrowthRate*100).toFixed(1)}%/yr.`, perSqm: Math.round(value/data.area) };
}
