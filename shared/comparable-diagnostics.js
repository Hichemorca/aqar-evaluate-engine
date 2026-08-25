const { getSizeCategory } = require('./../scripts/cleaning-pipeline');

const DIAGNOSTIC_THRESHOLDS = Object.freeze({
  projectSizeMinimum: 3,
  projectMinimum: 5,
  retailProjectMinimum: 2,
  districtSizeMinimum: 5,
  districtMinimum: 5,
  moderateIqrRatio: 0.3,
  highIqrRatio: 0.5,
  moderateMaxMinRatio: 3,
  highMaxMinRatio: 5,
  landXlargeMinimumSqm: 3000
});

function comparableKey(record, level) {
  const propertyType = record.propertyType || '';
  const sizeCategory = getSizeCategory(Number(record.area), propertyType);
  const project = String(record.project || '');
  const district = String(record.district || '');
  if (level === 'project_size') return project.length > 2 ? `${project}__${propertyType}__${sizeCategory}` : null;
  if (level === 'project') return project.length > 2 ? `${project}__${propertyType}` : null;
  if (level === 'district_size') return district ? `${district}__${propertyType}__${sizeCategory}` : null;
  if (level === 'district') return district ? `${district}__${propertyType}` : null;
  return null;
}

function buildComparableGroups(records) {
  const groups = {};
  for (const level of ['project_size', 'project', 'district_size', 'district']) {
    groups[level] = {};
    for (const record of records) {
      const key = comparableKey(record, level);
      if (key) (groups[level][key] ||= []).push(record);
    }
  }
  return groups;
}

function quantile(values, percentile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * percentile)];
}

function peerSummary(records, target) {
  const prices = records
    .filter(record => record.propertyRef !== target.propertyRef)
    .map(record => Number(record.pricePerSqm || (record.actualSalePrice / Math.max(1, Number(record.area)))))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!prices.length) return { count: 0 };
  const min = prices[0];
  const max = prices[prices.length - 1];
  const q1 = quantile(prices, 0.25);
  const median = quantile(prices, 0.5);
  const q3 = quantile(prices, 0.75);
  const iqrRatio = median > 0 ? (q3 - q1) / median : null;
  const maxMinRatio = min > 0 ? max / min : null;
  return {
    count: prices.length,
    min: Number(min.toFixed(2)),
    q1: Number(q1.toFixed(2)),
    median: Number(median.toFixed(2)),
    q3: Number(q3.toFixed(2)),
    max: Number(max.toFixed(2)),
    iqrRatio: iqrRatio === null ? null : Number(iqrRatio.toFixed(4)),
    maxMinRatio: maxMinRatio === null ? null : Number(maxMinRatio.toFixed(4))
  };
}

function dispersionFlag(summary) {
  if (!summary || !summary.count) return 'unavailable';
  if ((summary.iqrRatio !== null && summary.iqrRatio >= DIAGNOSTIC_THRESHOLDS.highIqrRatio) ||
      (summary.maxMinRatio !== null && summary.maxMinRatio >= DIAGNOSTIC_THRESHOLDS.highMaxMinRatio)) return 'high';
  if ((summary.iqrRatio !== null && summary.iqrRatio >= DIAGNOSTIC_THRESHOLDS.moderateIqrRatio) ||
      (summary.maxMinRatio !== null && summary.maxMinRatio >= DIAGNOSTIC_THRESHOLDS.moderateMaxMinRatio)) return 'moderate';
  return 'low';
}

function createComparableDiagnostics(record, groups) {
  const counts = {};
  const peerSummaries = {};
  for (const level of ['project_size', 'project', 'district_size', 'district']) {
    const key = comparableKey(record, level);
    const group = key && groups[level]?.[key] ? groups[level][key] : [];
    const summary = peerSummary(group, record);
    counts[level] = summary.count;
    peerSummaries[level] = summary;
  }
  const projectMinimum = record.propertyType === 'retail'
    ? DIAGNOSTIC_THRESHOLDS.retailProjectMinimum
    : DIAGNOSTIC_THRESHOLDS.projectMinimum;
  const qualifies = {
    project_size: counts.project_size >= DIAGNOSTIC_THRESHOLDS.projectSizeMinimum,
    project: counts.project >= projectMinimum,
    district_size: counts.district_size >= DIAGNOSTIC_THRESHOLDS.districtSizeMinimum,
    district: counts.district >= DIAGNOSTIC_THRESHOLDS.districtMinimum
  };
  let selectedLevel = null;
  if (qualifies.project_size) selectedLevel = 'project_size';
  else if (qualifies.project) selectedLevel = 'project';
  else if (qualifies.district_size) selectedLevel = 'district_size';
  else if (qualifies.district) selectedLevel = 'district';
  const selectedSummary = selectedLevel ? peerSummaries[selectedLevel] : { count: 0 };
  const sizeCategory = getSizeCategory(Number(record.area), record.propertyType);
  const flags = [];
  const selectedDispersion = dispersionFlag(selectedSummary);
  if (selectedDispersion === 'moderate' || selectedDispersion === 'high') flags.push(`${selectedDispersion}_peer_dispersion`);
  if (record.propertyType === 'land' && sizeCategory === 'land_xlarge') flags.push('land_xlarge');
  if (!selectedLevel) flags.push('no_qualifying_comparable_level');
  return {
    schemaVersion: 1,
    diagnosticsOnly: true,
    sizeCategory,
    comparableCounts: counts,
    qualifies,
    selectedLevel,
    selectedComparableCount: selectedSummary.count || 0,
    selectedPeerPricePerSqm: selectedSummary,
    selectedDispersion,
    flags
  };
}

module.exports = { DIAGNOSTIC_THRESHOLDS, comparableKey, buildComparableGroups, createComparableDiagnostics, dispersionFlag, peerSummary };
