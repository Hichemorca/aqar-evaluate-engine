const test = require('node:test');
const assert = require('node:assert/strict');
const { createNeutralConfig, compute, keyForProject } = require('../shared/v21-shadow-multiplier-engine');

test('disabled shadow config preserves neutral multiplier', () => {
  const result = compute({ propType: 'villa', bua: 250, plotArea: 500, lastRenovationYear: 2025 }, createNeutralConfig());
  assert.equal(result.multiplier, 1);
  assert.equal(result.applied.length, 0);
});

test('project multiplier requires a verified DLD suggestion and minimum evidence', () => {
  const config = createNeutralConfig();
  config.enabled = true;
  config.propertyTypes.apartment.projectBuilding.projectMultipliers[keyForProject({ propType: 'apartment', district: 'BURJ KHALIFA', projectBuilding: 'BAHWAN TOWER' })] = 1.04;
  const verified = compute({ propType: 'apartment', district: 'BURJ KHALIFA', projectBuilding: 'BAHWAN TOWER', projectBuildingSource: 'dld-suggestion', projectEvidenceCount: 6 }, config);
  const typed = compute({ propType: 'apartment', district: 'BURJ KHALIFA', projectBuilding: 'BAHWAN TOWER', projectBuildingSource: 'user-entered', projectEvidenceCount: 6 }, config);
  assert.equal(verified.multiplier, 1.04);
  assert.equal(typed.multiplier, 1);
});

test('BUA to Plot Area ratio selects the configured direct multiplier', () => {
  const config = createNeutralConfig();
  config.enabled = true;
  config.propertyTypes.villa.buaPlotArea.bands = [
    { maxRatio: 0.5, multiplier: 0.98 },
    { maxRatio: 0.8, multiplier: 1.01 },
    { maxRatio: Infinity, multiplier: 1.04 }
  ];
  const result = compute({ propType: 'villa', bua: 400, plotArea: 500 }, config);
  assert.equal(result.factors.buaPlotArea, 1.01);
  assert.equal(result.multiplier, 1.01);
});

test('renovation age selects the configured direct multiplier', () => {
  const config = createNeutralConfig();
  config.enabled = true;
  config.propertyTypes.apartment.lastRenovation.bands = [
    { maxAgeYears: 2, multiplier: 1.05 },
    { maxAgeYears: 5, multiplier: 1.02 },
    { maxAgeYears: Infinity, multiplier: 0.98 }
  ];
  const recent = compute({ propType: 'apartment', lastRenovationYear: 2025, currentYear: 2026 }, config);
  const old = compute({ propType: 'apartment', lastRenovationYear: 2015, currentYear: 2026 }, config);
  assert.equal(recent.multiplier, 1.05);
  assert.equal(old.multiplier, 0.98);
});

test('all three active factors are multiplied and bounded', () => {
  const config = createNeutralConfig();
  config.enabled = true;
  config.propertyTypes.villa.projectBuilding.projectMultipliers[keyForProject({ propType: 'villa', district: 'D', projectBuilding: 'P' })] = 1.04;
  config.propertyTypes.villa.buaPlotArea.bands = [{ maxRatio: Infinity, multiplier: 1.03 }];
  config.propertyTypes.villa.lastRenovation.bands = [{ maxAgeYears: Infinity, multiplier: 1.02 }];
  const result = compute({ propType: 'villa', district: 'D', projectBuilding: 'P', projectBuildingSource: 'dld-suggestion', projectEvidenceCount: 5, bua: 400, plotArea: 500, lastRenovationYear: 2025, currentYear: 2026 }, config);
  assert.equal(result.rawMultiplier, 1.04 * 1.03 * 1.02);
  assert.equal(result.multiplier, result.rawMultiplier);
});
