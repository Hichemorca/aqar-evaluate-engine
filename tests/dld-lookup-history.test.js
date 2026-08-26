const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildResult } = require('../netlify/functions/dld-lookup');

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
