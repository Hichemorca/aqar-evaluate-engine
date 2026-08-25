(function (root, factory) {
  const policy = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = policy;
  if (root) root.AQAR_POLICY = policy;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PROPERTY_TYPES = Object.freeze([
    'apartment',
    'villa',
    'townhouse',
    'office',
    'retail',
    'warehouse',
    'land'
  ]);

  const METHOD_KEYS = Object.freeze([
    'sales-comparison',
    'income',
    'cost',
    'dcf'
  ]);

  // These lists mirror the current AQAR behavior in each execution path.
  // They intentionally preserve existing differences until the owner resolves them.
  const PROPERTY_POLICY = Object.freeze({
    apartment: Object.freeze({
      interactiveMethods: Object.freeze(['sales-comparison', 'income', 'dcf']),
      batchMethods: Object.freeze(['sales-comparison', 'income']),
      requiredFields: Object.freeze(['area']),
      optionalFields: Object.freeze(['bedrooms', 'yearBuilt', 'condition', 'features', 'finishQuality', 'viewTypes', 'floorLevel', 'buildingCondition', 'furnishedStatus', 'district', 'avgPriceSqm', 'annualRent', 'annualExpenses']),
      irrelevantFields: Object.freeze(['streetPosition', 'landValue', 'constructionCost'])
    }),
    villa: Object.freeze({
      interactiveMethods: Object.freeze(['sales-comparison', 'income', 'cost', 'dcf']),
      batchMethods: Object.freeze(['sales-comparison', 'income', 'cost']),
      requiredFields: Object.freeze(['area']),
      optionalFields: Object.freeze(['yearBuilt', 'condition', 'features', 'finishQuality', 'viewTypes', 'streetPosition', 'buildingCondition', 'furnishedStatus', 'district', 'avgPriceSqm', 'annualRent', 'annualExpenses', 'landValue', 'constructionCost']),
      irrelevantFields: Object.freeze(['bedrooms', 'floorLevel'])
    }),
    townhouse: Object.freeze({
      interactiveMethods: Object.freeze(['sales-comparison', 'income', 'cost', 'dcf']),
      batchMethods: Object.freeze(['sales-comparison', 'income', 'cost']),
      requiredFields: Object.freeze(['area']),
      optionalFields: Object.freeze(['yearBuilt', 'condition', 'features', 'finishQuality', 'viewTypes', 'streetPosition', 'buildingCondition', 'furnishedStatus', 'district', 'avgPriceSqm', 'annualRent', 'annualExpenses', 'landValue', 'constructionCost']),
      irrelevantFields: Object.freeze(['bedrooms', 'floorLevel'])
    }),
    office: Object.freeze({
      interactiveMethods: Object.freeze(['sales-comparison', 'income', 'cost', 'dcf']),
      batchMethods: Object.freeze(['sales-comparison', 'income', 'cost']),
      requiredFields: Object.freeze(['area']),
      optionalFields: Object.freeze(['yearBuilt', 'condition', 'features', 'finishQuality', 'viewTypes', 'floorLevel', 'streetPosition', 'buildingCondition', 'furnishedStatus', 'district', 'avgPriceSqm', 'annualRent', 'annualExpenses', 'landValue', 'constructionCost']),
      irrelevantFields: Object.freeze(['bedrooms'])
    }),
    retail: Object.freeze({
      interactiveMethods: Object.freeze(['sales-comparison', 'income', 'cost', 'dcf']),
      batchMethods: Object.freeze(['sales-comparison', 'income', 'cost']),
      requiredFields: Object.freeze(['area']),
      optionalFields: Object.freeze(['yearBuilt', 'condition', 'features', 'finishQuality', 'streetPosition', 'buildingCondition', 'district', 'avgPriceSqm', 'annualRent', 'annualExpenses', 'landValue', 'constructionCost']),
      irrelevantFields: Object.freeze(['bedrooms', 'viewTypes', 'floorLevel', 'furnishedStatus'])
    }),
    warehouse: Object.freeze({
      interactiveMethods: Object.freeze(['sales-comparison', 'income', 'cost']),
      batchMethods: Object.freeze(['sales-comparison', 'income', 'cost']),
      requiredFields: Object.freeze(['area']),
      optionalFields: Object.freeze(['yearBuilt', 'condition', 'buildingCondition', 'district', 'avgPriceSqm', 'annualRent', 'annualExpenses', 'landValue', 'constructionCost']),
      irrelevantFields: Object.freeze(['bedrooms', 'features', 'finishQuality', 'viewTypes', 'floorLevel', 'streetPosition', 'furnishedStatus'])
    }),
    land: Object.freeze({
      interactiveMethods: Object.freeze(['sales-comparison', 'income']),
      batchMethods: Object.freeze(['sales-comparison', 'income']),
      requiredFields: Object.freeze(['area']),
      optionalFields: Object.freeze(['district', 'avgPriceSqm']),
      irrelevantFields: Object.freeze(['bedrooms', 'yearBuilt', 'condition', 'features', 'finishQuality', 'viewTypes', 'floorLevel', 'streetPosition', 'buildingCondition', 'furnishedStatus', 'annualRent', 'annualExpenses', 'landValue', 'constructionCost'])
    })
  });

  const METHODOLOGY_DECISIONS_REQUIRED = Object.freeze([
    'DCF applicability differs between interactive and batch execution paths.',
    'The land income field is hidden in the UI while the current calculation function can use it if populated programmatically.'
  ]);

  function isSupportedPropertyType(propertyType) {
    return PROPERTY_TYPES.includes(propertyType);
  }

  function getPropertyPolicy(propertyType) {
    return isSupportedPropertyType(propertyType) ? PROPERTY_POLICY[propertyType] : null;
  }

  function getApplicableMethods(propertyType, context) {
    const policy = getPropertyPolicy(propertyType);
    if (!policy) return [];
    return [...policy[context === 'batch' ? 'batchMethods' : 'interactiveMethods']];
  }

  function getMethodStatus(propertyType, method, context) {
    if (!METHOD_KEYS.includes(method)) return 'UNKNOWN_METHOD';
    return getApplicableMethods(propertyType, context).includes(method)
      ? 'APPLICABLE'
      : 'NOT_APPLICABLE';
  }

  function validatePropertyInput(property) {
    const errors = [];
    if (!property || !isSupportedPropertyType(property.propType)) {
      errors.push({ field: 'propType', code: 'UNSUPPORTED_PROPERTY_TYPE' });
    }
    if (!Number.isFinite(Number(property?.area)) || Number(property.area) < 10) {
      errors.push({ field: 'area', code: 'AREA_MUST_BE_AT_LEAST_10_SQM' });
    }
    return { valid: errors.length === 0, errors };
  }

  return Object.freeze({
    PROPERTY_TYPES,
    METHOD_KEYS,
    PROPERTY_POLICY,
    METHODOLOGY_DECISIONS_REQUIRED,
    isSupportedPropertyType,
    getPropertyPolicy,
    getApplicableMethods,
    getMethodStatus,
    validatePropertyInput
  });
});
