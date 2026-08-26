(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AQAR_COMPARABLE_BRACKET = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getComparableBracket(targetValue, prices) {
    const target = Number(targetValue);
    const values = Array.isArray(prices)
      ? prices.map(Number).filter(price => Number.isFinite(price) && price > 0).sort((a, b) => a - b)
      : [];
    if (!Number.isFinite(target) || !values.length) return null;
    const lower = [...values].reverse().find(price => price < target);
    const upper = values.find(price => price > target);
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) return null;
    return { lower, upper };
  }

  return Object.freeze({ getComparableBracket });
});
