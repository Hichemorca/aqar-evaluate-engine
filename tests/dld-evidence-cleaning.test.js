const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanDldRecords, normalizeDistrict } = require('../shared/dld-evidence-cleaning');
const { buildCleaningArtifacts } = require('../scripts/fetch-dld');

const validApartment = {
  propertyRef: 'DLD-1',
  transactionNumber: 'tx-1',
  instanceDate: '2026-01-15',
  propertyType: 'apartment',
  propSubType: 'Flat',
  district: ' Jumeirah   Village Circle ',
  area: 98,
  procedureArea: 98,
  actualSalePrice: 1_250_000,
  dataSource: 'dld-real',
  scrapedFrom: 'Dubai Land Department',
  verifiedBy: 'Government Record'
};

test('AQAR DLD cleaner normalizes eligible records and district names', () => {
  const result = cleanDldRecords([validApartment]);
  assert.equal(result.summary.eligible, 1);
  assert.equal(result.eligibleRecords[0].district, 'JUMEIRAH VILLAGE CIRCLE');
  assert.equal(result.eligibleRecords[0].evidenceStatus, 'eligible');
  assert.equal(normalizeDistrict('  Dubai   Marina '), 'DUBAI MARINA');
});

test('AQAR DLD cleaner keeps rejected evidence auditable and does not mutate raw input', () => {
  const source = [
    validApartment,
    { ...validApartment, transactionNumber: 'tx-commercial', propertyType: 'land', propSubType: 'Commercial' },
    { ...validApartment, transactionNumber: 'tx-ultra', actualSalePrice: 60_000_000 },
    { ...validApartment, transactionNumber: 'tx-invalid', area: 0 },
    { ...validApartment, transactionNumber: 'tx-duplicate' },
    { ...validApartment, transactionNumber: 'tx-duplicate', actualSalePrice: 2_000_000 }
  ];
  const before = JSON.stringify(source);
  const result = cleanDldRecords(source);

  assert.equal(JSON.stringify(source), before);
  assert.equal(result.summary.eligible, 2);
  assert.equal(result.summary.rejected, 2);
  assert.equal(result.summary.skipped, 1);
  assert.equal(result.summary.duplicateTransactionIds, 1);
  assert.ok(result.issues.some(issue => issue.reason === 'commercial_land'));
  assert.ok(result.issues.some(issue => issue.reason === 'ultra_luxury'));
  assert.ok(result.issues.some(issue => issue.reason === 'invalid_area_sqm'));
  assert.ok(result.issues.some(issue => issue.issueType === 'duplicate'));
  assert.ok(result.rejectedRecords.every(record => record.evidenceStatus === 'rejected'));
});

test('fetch-dld maps CSV rows into eligible and rejected evidence artifacts', () => {
  const csv = [
    'TRANSACTION_NUMBER,INSTANCE_DATE,PROP_TYPE_EN,PROP_SB_TYPE_EN,AREA_EN,ACTUAL_AREA,PROCEDURE_AREA,TRANS_VALUE',
    'tx-1,2026-01-15,Unit,Flat,JVC,98,98,1250000',
    'tx-2,2026-01-16,Land,Commercial,Al Furjan,600,600,11000000',
    'tx-3,2026-01-17,Land,Residential,Al Furjan,500,500,5000000'
  ].join('\n');
  const result = buildCleaningArtifacts(csv);
  assert.equal(result.report.recordsRead, 3);
  assert.equal(result.report.eligible, 2);
  assert.equal(result.report.rejected, 1);
  assert.equal(result.report.issueCountsByReason, undefined);
  assert.equal(result.cleaned.rejectedRecords[0].rejectionReason, 'commercial_land');
  assert.equal(result.checksum.length, 64);
});
