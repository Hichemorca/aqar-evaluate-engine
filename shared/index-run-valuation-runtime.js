function runValuation() {
  const area = parseFloat(document.getElementById('area').value);
  if (!area || area < 10) { document.getElementById('area').classList.add('error'); document.getElementById('area').focus(); showToast('Area must be at least 10 sqm'); setTimeout(() => document.getElementById('area').classList.remove('error'), 3000); return; }
  document.getElementById('btnValuate').disabled = true;
  document.getElementById('btnValuate').innerHTML = '<span class="loading"></span> Calculating valuation...';
  document.getElementById('resultSection').classList.add('hidden');
  document.getElementById('resultSection').innerHTML = '';
  setTimeout(() => {
    const propData = collectPropertyData();
    const extraValidation = AQAR_PROPERTY_EXTRA_FIELDS.validate(propData);
    if (!extraValidation.valid) {
      showToast(extraValidation.errors.map(error => error.code).join(', '));
      document.getElementById('btnValuate').disabled = false;
      document.getElementById('btnValuate').innerHTML = '🧮 Calculate Valuation';
      return;
    }
    const validation = AQAR_POLICY.validatePropertyInput(propData);
    if (!validation.valid) {
      showToast(validation.errors.map(error => error.code).join(', '));
      document.getElementById('btnValuate').disabled = false;
      document.getElementById('btnValuate').innerHTML = '🧮 Calculate Valuation';
      return;
    }
    const applicableMethods = new Set(AQAR_POLICY.getApplicableMethods(propData.propType, 'interactive'));
    const valuations = [];
    if (applicableMethods.has('sales-comparison')) {
      const salesComp = salesComparisonApproach(propData);
      if (salesComp) valuations.push(salesComp);
    }
    if (applicableMethods.has('income')) {
      const incomeVal = incomeCapitalizationApproach(propData);
      if (incomeVal) valuations.push(incomeVal);
    }
    if (applicableMethods.has('cost')) {
      const costVal = costApproach(propData);
      if (costVal) valuations.push(costVal);
    }
    if (applicableMethods.has('dcf')) {
      const dcfVal = dcfApproach(propData);
      if (dcfVal) valuations.push(dcfVal);
    }
    if (!valuations.length) { displayEvidenceOnlyState(propData); document.getElementById('btnValuate').disabled = false; document.getElementById('btnValuate').innerHTML = '🧮 Calculate Valuation'; return; }
    const finalResult = calculateWeightedValue(valuations, propData);
    displayResult(finalResult, valuations, propData);
    document.getElementById('btnValuate').disabled = false;
    document.getElementById('btnValuate').innerHTML = '🧮 Recalculate Valuation';
    saveToHistory(finalResult, propData);
    recordValuationObservation(propData, finalResult);
  }, 800);
}
