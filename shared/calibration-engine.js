(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AQAR_CALIBRATION_ENGINE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const METHOD_KEYS = ['sales-comparison', 'income', 'cost', 'dcf'];

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function methodWeight(propertyConfig, method) {
    return Math.max(0, numberOr(propertyConfig?.weights?.[method], 0));
  }

  function notApplicable(method, weight, reason) {
    return { method, status: 'NOT_APPLICABLE', value: null, weight, reason, assumptions: [] };
  }

  function incomeValuation(input, propertyConfig) {
    const method = 'income';
    const weight = methodWeight(propertyConfig, method);
    const c = propertyConfig?.coefficients?.income || {};
    const annualRent = numberOr(input?.annualRent, 0);
    if (annualRent <= 0) return notApplicable(method, weight, 'annualRent is not available');

    const assumptions = [];
    const annualExpenses = numberOr(input?.annualExpenses, 0) > 0
      ? numberOr(input.annualExpenses, 0)
      : annualRent * numberOr(c.expenseRate, 0.2);
    if (!(numberOr(input?.annualExpenses, 0) > 0)) assumptions.push({ field: 'annualExpenses', value: annualExpenses, source: 'ASSUMPTION' });

    const vacancyRatePercent = numberOr(input?.vacancyRatePercent, numberOr(c.vacancyRatePercent, 10));
    if (!Number.isFinite(Number(input?.vacancyRatePercent))) assumptions.push({ field: 'vacancyRatePercent', value: vacancyRatePercent, source: 'ASSUMPTION' });

    const capRatePercent = numberOr(input?.capRatePercent, numberOr(c.capRatePercent, 7));
    if (!Number.isFinite(Number(input?.capRatePercent))) assumptions.push({ field: 'capRatePercent', value: capRatePercent, source: 'ASSUMPTION' });
    if (capRatePercent <= 0) return notApplicable(method, weight, 'cap rate must be positive');

    const noi = annualRent * (1 - vacancyRatePercent / 100) - annualExpenses;
    if (noi <= 0) return notApplicable(method, weight, 'net operating income is not positive');
    return {
      method,
      status: 'APPLIED',
      value: Math.round(noi / (capRatePercent / 100)),
      weight,
      assumptions,
      inputs: { annualRent, annualExpenses, vacancyRatePercent, capRatePercent }
    };
  }

  function costValuation(input, propertyConfig) {
    const method = 'cost';
    const weight = methodWeight(propertyConfig, method);
    const c = propertyConfig?.coefficients?.cost || {};
    const area = numberOr(input?.area, 0);
    if (area <= 0) return notApplicable(method, weight, 'area is not available');

    const assumptions = [];
    const constructionCostPerSqm = numberOr(input?.constructionCost, 0) > 0
      ? numberOr(input.constructionCost, 0)
      : numberOr(c.constructionCostPerSqm, 3000);
    if (!(numberOr(input?.constructionCost, 0) > 0)) assumptions.push({ field: 'constructionCostPerSqm', value: constructionCostPerSqm, source: 'ASSUMPTION' });

    const build = constructionCostPerSqm * area;
    const hasLandValue = numberOr(input?.landValue, 0) > 0;
    const hasMarketPrice = numberOr(input?.marketValue, 0) > 0;
    const land = hasLandValue
      ? numberOr(input.landValue, 0)
      : hasMarketPrice
        ? Math.round(numberOr(input.marketValue, 0) * numberOr(c.landValueFromMarketShare, 0.3))
        : Math.round(build * numberOr(c.landValueFromBuildShare, 0.35));
    if (!hasLandValue) assumptions.push({ field: 'landValue', value: land, source: 'ASSUMPTION' });

    const age = Math.min(50, Math.max(0, numberOr(input?.currentYear, 2026) - numberOr(input?.yearBuilt, 2026)));
    const depreciationPerYear = numberOr(c.depreciationPerYear, 0.015);
    const maximumDepreciation = numberOr(c.maximumDepreciation, 0.6);
    const depreciation = Math.min(maximumDepreciation, age * depreciationPerYear);
    const condition = input?.condition || 'good';
    const conditionFactor = numberOr(c.conditionFactors?.[condition], 1);
    return {
      method,
      status: 'APPLIED',
      value: Math.round((land + build) * (1 - depreciation) * conditionFactor),
      weight,
      assumptions,
      inputs: { area, constructionCostPerSqm, landValue: land, age, depreciation, condition, conditionFactor }
    };
  }

  function dcfValuation(input, propertyConfig) {
    const method = 'dcf';
    const weight = methodWeight(propertyConfig, method);
    const c = propertyConfig?.coefficients?.dcf || {};
    const annualRent = numberOr(input?.annualRent, 0);
    if (annualRent <= 0) return notApplicable(method, weight, 'annualRent is not available');

    const marketValue = numberOr(input?.marketValue, 0);
    const fallbackCapRate = numberOr(c.fallbackCapRate, 0.07);
    const assumptions = [];
    const currentValue = marketValue > 0 ? marketValue : annualRent / fallbackCapRate;
    if (marketValue <= 0) assumptions.push({ field: 'currentValue', value: currentValue, source: 'ASSUMPTION' });
    if (currentValue <= 0) return notApplicable(method, weight, 'current value is not positive');

    const years = Math.max(1, Math.round(numberOr(c.years, 10)));
    const rentGrowthRate = numberOr(c.rentGrowthRate, 0.02);
    const valueGrowthRate = numberOr(c.valueGrowthRate, 0.03);
    const netOperatingIncomeRate = numberOr(c.netOperatingIncomeRate, 0.75);
    const terminalValueRate = numberOr(c.terminalValueRate, 0.95);
    const discountRate = numberOr(c.discountRate, 0.1);
    const negativeNpvFallback = numberOr(c.negativeNpvFallback, 0.85);
    let npv = -currentValue;
    let runValue = currentValue;
    let runRent = annualRent;
    for (let year = 1; year <= years; year += 1) {
      runRent *= 1 + rentGrowthRate;
      runValue *= 1 + valueGrowthRate;
      npv += (runRent * netOperatingIncomeRate) / Math.pow(1 + discountRate, year);
      if (year === years) npv += (runValue * terminalValueRate) / Math.pow(1 + discountRate, years);
    }

    return {
      method,
      status: 'APPLIED',
      value: npv > 0 ? Math.round(npv) : Math.round(currentValue * negativeNpvFallback),
      weight,
      assumptions,
      inputs: { annualRent, currentValue, years, rentGrowthRate, valueGrowthRate, netOperatingIncomeRate, terminalValueRate, discountRate, negativeNpvFallback }
    };
  }

  function buildMethodResults(input, propertyConfig) {
    const applicable = new Set(propertyConfig?.applicableMethods || []);
    const salesWeight = methodWeight(propertyConfig, 'sales-comparison');
    const results = [];
    if (applicable.has('sales-comparison') && numberOr(input?.salesValue, 0) > 0) {
      results.push({ method: 'sales-comparison', status: 'APPLIED', value: Math.round(numberOr(input.salesValue, 0)), weight: salesWeight, assumptions: [] });
    } else {
      results.push(notApplicable('sales-comparison', salesWeight, applicable.has('sales-comparison') ? 'sales value is not available' : 'method is not applicable'));
    }

    if (applicable.has('income')) results.push(incomeValuation(input, propertyConfig));
    else results.push(notApplicable('income', methodWeight(propertyConfig, 'income'), 'method is not applicable'));
    if (applicable.has('cost')) results.push(costValuation(input, propertyConfig));
    else results.push(notApplicable('cost', methodWeight(propertyConfig, 'cost'), 'method is not applicable'));
    if (applicable.has('dcf')) results.push(dcfValuation(input, propertyConfig));
    else results.push(notApplicable('dcf', methodWeight(propertyConfig, 'dcf'), 'method is not applicable'));
    return results;
  }

  function combineMethodResults(methodResults, propertyConfig, calibrationId) {
    const applied = methodResults.filter((result) => result.status === 'APPLIED' && Number.isFinite(Number(result.value)) && methodWeight(propertyConfig, result.method) > 0);
    const totalWeight = applied.reduce((sum, result) => sum + methodWeight(propertyConfig, result.method), 0);
    if (!applied.length || totalWeight <= 0) {
      return { status: 'NO_APPLICABLE_METHOD', value: null, calibrationId, methods: methodResults, assumptions: [] };
    }

    const value = Math.round(applied.reduce((sum, result) => sum + Number(result.value) * methodWeight(propertyConfig, result.method), 0) / totalWeight);
    return {
      status: 'APPLIED',
      value,
      calibrationId,
      methods: methodResults,
      assumptions: applied.flatMap((result) => result.assumptions || [])
    };
  }

  return { METHOD_KEYS, buildMethodResults, combineMethodResults };
});
