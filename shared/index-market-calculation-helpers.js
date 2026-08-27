function getFallbackPrice(city, district) {
  const cd = (district||'').trim().toLowerCase();
  const rates = { 'dubai marina':11850, 'palm jumeirah':16500, 'downtown dubai':13200, 'business bay':9200, 'jumeirah village circle':8500, 'dubai hills estate':10500, 'arabian ranches':9500, 'emirates hills':18500, 'al barsha':7800, 'deira':4500, 'bur dubai':5200, 'damac hills':8500, 'dubai creek harbour':11500, 'mirdif':5500, 'al furjan':7200, 'discovery gardens':6500, 'jumeirah beach residence':12500, 'the greens':8800, 'dubai silicon oasis':6200, 'international city':4800 };
  return rates[cd] || 7000;
}

function calculateViewMultiplier(viewTypes, propertyType) {
  if (!viewTypes || !viewTypes.length) return 1;
  if (viewTypes.includes('unknown') || viewTypes.includes('internal')) return 1;
  const sales = getCalibrationForProperty(propertyType || 'apartment').coefficients.sales;
  const factors = sales.viewFactors || {};
  const valid = viewTypes.filter(t => Number.isFinite(Number(factors[t])));
  if (!valid.length) return 1;
  valid.sort((a,b) => factors[b] - factors[a]);
  let mult = 1, first = true;
  const secondaryFactor = Number(sales.viewSecondaryFactor ?? 0.5);
  for (const t of valid) { if (first) { mult *= factors[t]; first = false; } else { mult += (factors[t]-1) * secondaryFactor; } }
  return Math.max(Number(sales.viewMinimumMultiplier ?? 0.8), Math.min(Number(sales.viewMaximumMultiplier ?? 1.25), mult));
}
