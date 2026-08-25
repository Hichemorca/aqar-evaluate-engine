const crypto = require('crypto');

const DLD_EVIDENCE_LIMITS = Object.freeze({
  maxUnitPriceAed: 50_000,
  maxPriceAed: 50_000_000,
  minimumAreaSqm: 10
});

const PROPERTY_TYPES = Object.freeze(['apartment', 'villa', 'townhouse', 'office', 'retail', 'warehouse', 'land']);

function text(...parts) {
  return parts.filter(value => value !== undefined && value !== null && String(value).trim()).join(' ').trim().toUpperCase();
}

function classifyPropertyType(rawType, rawSubType) {
  const primary = text(rawType);
  if (primary === 'LAND' || primary.includes('LAND')) return 'land';
  if (primary.includes('VILLA')) return 'villa';
  if (primary.includes('TOWNHOUSE')) return 'townhouse';
  if (primary.includes('OFFICE')) return 'office';
  if (primary.includes('RETAIL') || primary.includes('SHOP')) return 'retail';
  if (primary.includes('WAREHOUSE') || primary.includes('INDUSTRIAL') || primary.includes('WORKSHOP')) return 'warehouse';
  if (primary.includes('APARTMENT') || primary.includes('FLAT') || primary.includes('UNIT')) return 'apartment';

  const fallback = text(rawType, rawSubType);
  if (fallback.includes('LAND') || fallback.includes('PLOT')) return 'land';
  if (fallback.includes('VILLA')) return 'villa';
  if (fallback.includes('TOWNHOUSE') || fallback.includes('TOWN HOUSE')) return 'townhouse';
  if (fallback.includes('OFFICE')) return 'office';
  if (fallback.includes('RETAIL') || fallback.includes('SHOP')) return 'retail';
  if (fallback.includes('WAREHOUSE') || fallback.includes('INDUSTRIAL') || fallback.includes('WORKSHOP')) return 'warehouse';
  if (fallback.includes('APARTMENT') || fallback.includes('FLAT') || fallback.includes('UNIT')) return 'apartment';
  if (primary === 'BUILDING') return 'office';
  return undefined;
}

function sourceTransactionId(record) {
  const value = record?.transactionNumber ?? record?.sourceTransactionId ?? record?.id;
  const normalized = String(value ?? '').trim();
  return normalized ? (normalized.startsWith('dld:') ? normalized : `dld:${normalized}`) : undefined;
}

function recordFingerprint(record) {
  return crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

function normalizeDistrict(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function valueNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const parsed = Number(String(value).replace(/,/g, '').trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function invalidReason(record) {
  if (!sourceTransactionId(record)) return 'missing_source_transaction_id';
  const rawDate = record.saleDate || record.instanceDate || record.transactionDate || record.d;
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return 'invalid_transaction_date';
  const areaSqm = valueNumber(record.area, record.actualArea, record.procedureArea, record.a);
  if (!Number.isFinite(areaSqm) || areaSqm <= DLD_EVIDENCE_LIMITS.minimumAreaSqm) return 'invalid_area_sqm';
  const salePriceAed = valueNumber(record.actualSalePrice, record.transValue, record.p);
  if (!Number.isFinite(salePriceAed) || salePriceAed <= 0) return 'invalid_sale_price_aed';
  const district = record.district || record.areaName || record.x;
  if (!String(district ?? '').trim()) return 'missing_district';
  const propertyType = classifyPropertyType(record.propertyType || record.propType || record.t, record.propSubType || record.s);
  if (!propertyType || !PROPERTY_TYPES.includes(propertyType)) return 'unsupported_property_type';
  return undefined;
}

function normalizeDldRecord(record) {
  const invalid = invalidReason(record);
  if (invalid) return { record: undefined, invalidReason: invalid };

  const propertyType = classifyPropertyType(record.propertyType || record.propType || record.t, record.propSubType || record.s);
  const areaSqm = valueNumber(record.area, record.actualArea, record.procedureArea, record.a);
  const salePriceAed = valueNumber(record.actualSalePrice, record.transValue, record.p);
  const rawType = record.propType || record.propertyType || record.t || 'Unknown';
  const rawSubType = record.propSubType || record.s || null;
  const rawClassificationText = text(rawType, rawSubType);
  let rejectionReason = null;
  if (propertyType === 'land' && /(COMMERCIAL|GENERAL USE)/.test(rawClassificationText)) rejectionReason = 'commercial_land';
  if (salePriceAed > DLD_EVIDENCE_LIMITS.maxPriceAed || salePriceAed / areaSqm > DLD_EVIDENCE_LIMITS.maxUnitPriceAed) rejectionReason = 'ultra_luxury';

  const rawDate = record.saleDate || record.instanceDate || record.transactionDate || record.d;
  const transactionDate = new Date(rawDate);
  const district = normalizeDistrict(record.district || record.areaName || record.x);
  const sourceId = sourceTransactionId(record);
  const normalized = {
    ...record,
    propertyRef: record.propertyRef || `DLD-${String(record.transactionNumber || sourceId).replace(/^dld:/, '')}`,
    transactionNumber: record.transactionNumber || String(sourceId).replace(/^dld:/, ''),
    instanceDate: record.instanceDate || String(rawDate),
    saleDate: record.saleDate || transactionDate.toISOString().slice(0, 10),
    propertyType,
    propSubType: rawSubType || rawType,
    district,
    area: Number.isFinite(Number(record.area)) ? Number(record.area) : areaSqm,
    procedureArea: valueNumber(record.procedureArea, record.actualArea, record.a) || areaSqm,
    actualSalePrice: salePriceAed,
    dataSource: record.dataSource || 'dld-real',
    scrapedFrom: record.scrapedFrom || 'Dubai Land Department',
    verifiedBy: record.verifiedBy || 'Government Record',
    sourceTransactionId: sourceId,
    evidenceStatus: rejectionReason ? 'rejected' : 'eligible',
    rejectionReason,
    pricePerSqm: salePriceAed / areaSqm
  };
  return { record: normalized, invalidReason: undefined };
}

function cleanDldRecords(records) {
  if (!Array.isArray(records)) throw new TypeError('DLD records must be an array.');
  const cleanedRecords = [];
  const issues = [];
  const firstSeenAt = new Map();

  records.forEach((record, recordIndex) => {
    const fingerprint = recordFingerprint(record);
    const transactionId = sourceTransactionId(record);
    if (transactionId && firstSeenAt.has(transactionId)) {
      issues.push({ recordIndex, issueType: 'duplicate', reason: `duplicate_source_transaction_id:first_seen_at_index=${firstSeenAt.get(transactionId)}`, sourceTransactionId: transactionId, recordFingerprint: fingerprint });
      return;
    }
    if (transactionId) firstSeenAt.set(transactionId, recordIndex);

    const normalized = normalizeDldRecord(record);
    if (!normalized.record) {
      issues.push({ recordIndex, issueType: 'invalid', reason: normalized.invalidReason, sourceTransactionId: transactionId || null, recordFingerprint: fingerprint });
      return;
    }

    cleanedRecords.push(normalized.record);
    if (normalized.record.evidenceStatus === 'rejected') {
      issues.push({ recordIndex, issueType: 'rejected', reason: normalized.record.rejectionReason, sourceTransactionId: normalized.record.sourceTransactionId, recordFingerprint: fingerprint });
    }
  });

  const issueCounts = {
    duplicates: issues.filter(issue => issue.issueType === 'duplicate').length,
    rejected: issues.filter(issue => issue.issueType === 'rejected').length,
    invalid: issues.filter(issue => issue.issueType === 'invalid').length
  };
  const eligible = cleanedRecords.filter(record => record.evidenceStatus === 'eligible').length;
  const rejected = cleanedRecords.length - eligible;
  return {
    cleanedRecords,
    eligibleRecords: cleanedRecords.filter(record => record.evidenceStatus === 'eligible'),
    rejectedRecords: cleanedRecords.filter(record => record.evidenceStatus === 'rejected'),
    issues,
    summary: {
      recordsRead: records.length,
      normalized: cleanedRecords.length,
      uniqueTransactionIds: firstSeenAt.size,
      duplicateTransactionIds: issueCounts.duplicates,
      eligible,
      rejected,
      skipped: issueCounts.invalid,
      issueCounts
    }
  };
}

module.exports = {
  DLD_EVIDENCE_LIMITS,
  PROPERTY_TYPES,
  classifyPropertyType,
  normalizeDistrict,
  normalizeDldRecord,
  cleanDldRecords,
  recordFingerprint,
  sourceTransactionId
};
