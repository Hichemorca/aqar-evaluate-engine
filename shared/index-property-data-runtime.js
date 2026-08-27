// Property input collection runtime for the public valuation page.

function collectPropertyData() {
  const propType = document.getElementById('propType').value;
  const policy = AQAR_POLICY.getPropertyPolicy(propType);
  const isRelevant = field => policy ? !policy.irrelevantFields.includes(field) : false;
  const features = [];
  if (isRelevant('features')) {
    document.querySelectorAll('#featuresGroup input:checked').forEach(cb => features.push(cb.value));
  }
  const readNumber = field => isRelevant(field) ? (parseFloat(document.getElementById(field).value) || 0) : 0;
  const readValue = field => isRelevant(field) ? document.getElementById(field).value : '';
  const extraReadNumber = field => {
    const value = document.getElementById(field).value;
    return value === '' ? '' : parseFloat(value);
  };
  return {
    city: document.getElementById('city').value,
    district: document.getElementById('selectedDistrict').value || document.getElementById('districtInput').value,
    projectBuilding: document.getElementById('projectBuildingInput').value.trim(),
    projectBuildingSource: selectedProjectBuilding ? 'dld-suggestion' : (document.getElementById('projectBuildingInput').value.trim() ? 'user-entered' : ''),
    projectEvidenceCount: selectedProjectBuilding ? getProjectEvidence(selectedProjectBuilding).count : 0,
    bua: extraReadNumber('bua'),
    plotArea: extraReadNumber('plotArea'),
    lastRenovationYear: extraReadNumber('lastRenovationYear'),
    propType,
    area: parseFloat(document.getElementById('area').value) || 0,
    bedrooms: isRelevant('bedrooms') ? (parseInt(document.getElementById('bedrooms').value) || 0) : 0,
    yearBuilt: isRelevant('yearBuilt') ? Math.max(1970, Math.min(2026, parseInt(document.getElementById('yearBuilt').value) || 2020)) : 2026,
    condition: isRelevant('condition') ? document.getElementById('condition').value : 'good',
    features,
    avgPriceSqm: parseFloat(document.getElementById('avgPriceSqm').value) || 0,
    annualRent: readNumber('annualRent'),
    annualExpenses: readNumber('annualExpenses'),
    landValue: readNumber('landValue'),
    constructionCost: readNumber('constructionCost'),
    scrapedData: scrapedDistrictData,
    evidenceState: currentEvidenceState || scrapedDistrictData?.evidenceState || AQAR_EVIDENCE_STATE.STATES.INSUFFICIENT,
    finishQuality: readValue('finishQuality'),
    viewTypes: isRelevant('viewTypes') ? getSelectedViewTypes() : [],
    floorLevel: readValue('floorLevel'),
    streetPosition: readValue('streetPosition'),
    buildingCondition: readValue('buildingCondition'),
    furnishedStatus: readValue('furnishedStatus'),
    gisData: gisData,
    gisRadius: 1000,
    currentYear: 2026,
    extraFieldsVersion: 'v2.1-ui-only'
  };
}
