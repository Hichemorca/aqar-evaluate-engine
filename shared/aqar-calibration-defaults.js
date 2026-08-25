(function (root, factory) {
  const config = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  if (root) root.AQAR_CALIBRATION_DEFAULTS = config;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PROPERTY_TYPES = ['apartment', 'villa', 'townhouse', 'office', 'retail', 'warehouse', 'land'];
  const METHOD_KEYS = ['sales-comparison', 'income', 'cost', 'dcf'];

  const baseWeights = {
    'sales-comparison': 0.4,
    income: 0.35,
    cost: 0.15,
    dcf: 0.1
  };

  const baseCoefficients = {
    sales: {
      maxPricePerSqm: 25000,
      noBedroomMultiplier: 0.8,
      featureBonusPerSqm: 50,
      ageDepreciation: 0.004,
      minimumAgeMultiplier: 0.8,
      conditionFactors: { excellent: 1.08, good: 1, fair: 0.82, 'needs-renovation': 0.75 },
      finishFactors: { luxury: 1.15, good: 1.05, normal: 1, basic: 0.92, poor: 0.8 },
      viewFactors: { sea: 1.15, 'partial-sea': 1.08, city: 1.05, garden: 1.04, park: 1.02, street: 0.97 },
      viewSecondaryFactor: 0.5,
      viewMinimumMultiplier: 0.8,
      viewMaximumMultiplier: 1.25,
      floorFactors: { penthouse: 1.12, 'very-high': 1.06, high: 1.03, mid: 1, low: 0.97, ground: 0.92 },
      streetFactors: { main: 1.08, corner: 1.05, secondary: 1, quiet: 0.96 },
      buildingConditionFactors: { excellent: 1.1, good: 1.03, fair: 0.95, old: 0.82 },
      furnishedFactors: { furnished: 1.04, 'semi-furnished': 1.02, unfurnished: 0.98 }
    },
    income: {
      expenseRate: 0.2,
      vacancyRatePercent: 10,
      capRatePercent: 7
    },
    cost: {
      constructionCostPerSqm: 3000,
      landValueFromMarketShare: 0.3,
      landValueFromBuildShare: 0.35,
      depreciationPerYear: 0.015,
      maximumDepreciation: 0.6,
      conditionFactors: { excellent: 0.95, good: 1, fair: 1.1, 'needs-renovation': 1.25 }
    },
    dcf: {
      years: 10,
      rentGrowthRate: 0.02,
      valueGrowthRate: 0.03,
      netOperatingIncomeRate: 0.75,
      terminalValueRate: 0.95,
      discountRate: 0.1,
      negativeNpvFallback: 0.85,
      fallbackCapRate: 0.07
    }
  };

  const baseGIS = {
    facilityWeights: { metro: 10, supermarket: 8, school: 7, hospital: 6, park: 5, gym: 4, cafe: 3, restaurant: 3 },
    distanceRadiusMeters: 1000,
    scoreCap: 1.5,
    impactMaximumPercent: 12,
    facilityContributionCap: 2,
    distanceDecayBaseKm: 1,
    proximityFactorPerScore: -0.0156,
    proximityMinimumMultiplier: 0.98,
    proximityMaximumMultiplier: 1.01
  };

  const methodApplicability = {
    apartment: ['sales-comparison', 'income', 'dcf'],
    villa: ['sales-comparison', 'income', 'cost', 'dcf'],
    townhouse: ['sales-comparison', 'income', 'cost', 'dcf'],
    office: ['sales-comparison', 'income', 'cost', 'dcf'],
    retail: ['sales-comparison', 'income', 'cost', 'dcf'],
    warehouse: ['sales-comparison', 'income', 'cost'],
    land: ['sales-comparison', 'income']
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createDefaultCalibrationConfig() {
    const propertyTypes = {};
    for (const propertyType of PROPERTY_TYPES) {
      propertyTypes[propertyType] = {
        weights: clone(baseWeights),
        coefficients: clone(baseCoefficients),
        applicableMethods: [...methodApplicability[propertyType]]
      };
    }
    propertyTypes.apartment.weights['sales-comparison'] = 0.55;
    propertyTypes.apartment.weights.cost = 0;
    propertyTypes.apartment.weights.dcf = 0.1;
    propertyTypes.land.weights['sales-comparison'] = 0.55;
    propertyTypes.land.weights.cost = 0;
    propertyTypes.land.weights.dcf = 0;
    propertyTypes.warehouse.weights.dcf = 0;
    return {
      schemaVersion: 1,
      engineVersion: '22.1.0',
      configId: 'base-22.1',
      status: 'active',
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
      updatedBy: 'system-default',
      propertyTypes,
      gis: clone(baseGIS)
    };
  }

  function getPropertyConfig(config, propertyType) {
    return config?.propertyTypes?.[propertyType] || createDefaultCalibrationConfig().propertyTypes[propertyType];
  }

  return Object.freeze({
    PROPERTY_TYPES: Object.freeze(PROPERTY_TYPES),
    METHOD_KEYS: Object.freeze(METHOD_KEYS),
    createDefaultCalibrationConfig,
    getPropertyConfig
  });
});
