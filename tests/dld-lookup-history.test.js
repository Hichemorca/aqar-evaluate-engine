const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildResult, getCleanedDLDData } = require('../netlify/functions/dld-lookup');

test('dld cleaned cache reuses the same source and refreshes for a new source', () => {
  const raw = [
    { evidenceStatus: 'eligible', district: 'Test District', propertyType: 'apartment', area: 100, actualSalePrice: 1000000, saleDate: '2026-01-01', propertyRef: 'test-1' },
    { evidenceStatus: 'eligible', district: 'Test District', propertyType: 'apartment', area: 110, actualSalePrice: 1100000, saleDate: '2026-01-02', propertyRef: 'test-2' },
    { evidenceStatus: 'eligible', district: 'Test District', propertyType: 'apartment', area: 120, actualSalePrice: 1200000, saleDate: '2026-01-03', propertyRef: 'test-3' }
  ];
  const first = getCleanedDLDData(raw);
  assert.equal(getCleanedDLDData(raw), first);
  const replacement = raw.map(record => ({ ...record }));
  assert.notEqual(getCleanedDLDData(replacement), first);
});

test('dld lookup all-history window includes valid older comparables', () => {
  const targetDate = new Date('2026-08-26T00:00:00.000Z');
  const transactions = [
    { saleDate: '2024-01-10', actualSalePrice: 900000, area: 100 },
    { saleDate: '2024-02-10', actualSalePrice: 920000, area: 100 },
    { saleDate: '2024-03-10', actualSalePrice: 940000, area: 100 },
    { saleDate: '2024-04-10', actualSalePrice: 960000, area: 100 },
    { saleDate: '2024-05-10', actualSalePrice: 980000, area: 100 }
  ];

  const result = buildResult(transactions, [Infinity], targetDate, 'district_size');

  assert.ok(result);
  assert.equal(result.count, transactions.length);
  assert.equal(result.timeWindow, Infinity);
  assert.deepEqual(result.comparablePrices, [900000, 920000, 940000, 960000, 980000]);
});
