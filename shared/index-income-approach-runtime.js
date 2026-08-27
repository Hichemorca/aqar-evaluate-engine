function incomeCapitalizationApproach(data) {
  if (!data.annualRent || data.annualRent <= 0) return null;
  const c = getCalibrationForProperty(data.propType).coefficients.income;
  const expenses = data.annualExpenses || Math.round(data.annualRent * c.expenseRate);
  const vacancy = data.scrapedData?.vacancyRate ?? c.vacancyRatePercent;
  const noi = data.annualRent * (1 - vacancy/100) - expenses;
  if (noi <= 0) return null;
  const cap = data.scrapedData?.capRate ? data.scrapedData.capRate/100 : c.capRatePercent / 100;
  const value = Math.round(noi / cap);
  return { method: 'Income Capitalization Approach', value, weight: getCalibrationForProperty(data.propType).weights.income, confidence: 'high', details: `NOI: ${Math.round(noi).toLocaleString()} AED / Cap Rate: ${(cap*100).toFixed(1)}%.`, perSqm: Math.round(value/data.area), rentalYield: Math.round((data.annualRent/value)*1000)/10 };
}
