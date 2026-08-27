const https = require('https');
const url = require('url');

// ============================================================
// IMPORT SHARED CLEANING
// ============================================================
const { getSizeCategory, applyAllFilters } = require('../../scripts/cleaning-pipeline');
const { isSupportedPropertyType } = require('../../shared/aqar-policy');
const { withSecurityHeaders } = require('../../shared/http-security-headers');

const DLD_CACHE_TTL_MS = 5 * 60 * 1000;
const DLD_REQUEST_TIMEOUT_MS = 15000;
const MAX_DLD_BODY_BYTES = 80 * 1024 * 1024;
const PUBLIC_ORIGIN = 'https://aqar-valuation-engine.netlify.app';
let dldCache = { data: null, expiresAt: 0 };
let dldFetchInFlight = null;

// ============================================================
// HELPERS
// ============================================================
function fetchDLDData() {
  if (dldCache.data && Date.now() < dldCache.expiresAt) return Promise.resolve(dldCache.data);
  if (dldFetchInFlight) return dldFetchInFlight;

  dldFetchInFlight = new Promise((resolve, reject) => {
    const baseUrl = process.env.URL || PUBLIC_ORIGIN;
    const fileUrl = `${baseUrl}/data/dld-transactions.json`;
    console.log('🔍 Fetching:', fileUrl);
    const req = https.get(fileUrl, { headers: { Accept: 'application/json' } }, (res) => {
      let data = '';
      let bodyBytes = 0;
      const timeout = setTimeout(() => res.destroy(new Error('DLD request timeout')), DLD_REQUEST_TIMEOUT_MS);
      res.setEncoding('utf8');
      res.on('data', chunk => {
        bodyBytes += Buffer.byteLength(chunk, 'utf8');
        if (bodyBytes > MAX_DLD_BODY_BYTES) res.destroy(new Error('DLD response too large'));
        else data += chunk;
      });
      res.on('error', error => { clearTimeout(timeout); reject(error); });
      res.on('end', () => {
        clearTimeout(timeout);
        if (res.statusCode !== 200) return reject(new Error(`DLD source returned HTTP ${res.statusCode}`));
        try {
          const parsed = JSON.parse(data);
          if (!Array.isArray(parsed)) return reject(new Error('DLD source returned an invalid dataset'));
          dldCache = { data: parsed, expiresAt: Date.now() + DLD_CACHE_TTL_MS };
          resolve(parsed);
        } catch (error) {
          reject(new Error('DLD source returned invalid JSON'));
        }
      });
    });
    req.setTimeout(DLD_REQUEST_TIMEOUT_MS, () => req.destroy(new Error('DLD request timeout')));
    req.on('error', reject);
  }).finally(() => { dldFetchInFlight = null; });

  return dldFetchInFlight;
}

function getCorsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  const headers = { 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  if (origin === (process.env.URL || PUBLIC_ORIGIN)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function median(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function monthlyGrowthRate(transactions) {
  if (!transactions || transactions.length < 10) return 0.005;
  const byMonth = {};
  for (const t of transactions) {
    const d = new Date(t.saleDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(t.actualSalePrice / t.area);
  }
  const months = Object.keys(byMonth).sort();
  if (months.length < 3) return 0.005;
  const medians = months.map(m => median(byMonth[m])).filter(Boolean);
  let total = 0, count = 0;
  for (let i = 1; i < medians.length; i++) {
    if (medians[i - 1] > 0) {
      total += (medians[i] - medians[i - 1]) / medians[i - 1];
      count++;
    }
  }
  return count > 0 ? total / count : 0.005;
}

function getTimeAdjustedPrice(saleDate, pricePerSqm, growth, months) {
  return pricePerSqm * Math.pow(1 + growth, months);
}

function buildResult(transactions, windows, targetDate, level) {
  const growth = monthlyGrowthRate(transactions);
  for (const days of windows) {
    const filtered = days === Infinity
      ? transactions
      : (() => {
          const cutoff = new Date(targetDate);
          cutoff.setDate(cutoff.getDate() - days);
          return transactions.filter(t => new Date(t.saleDate) >= cutoff);
        })();
    if (filtered.length >= 5) {
      const adjusted = filtered.map(t => {
        const months = (targetDate - new Date(t.saleDate)) / (30.44 * 86400000);
        return getTimeAdjustedPrice(new Date(t.saleDate), t.actualSalePrice / t.area, growth, months);
      });
      const sorted = [...adjusted].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const medianVal = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      const comparablePrices = filtered.map(t => Number(t.actualSalePrice)).filter(price => Number.isFinite(price) && price > 0);
      return {
        avgPricePerSqm: Math.round(medianVal),
        minComparablePrice: comparablePrices.length ? Math.round(Math.min(...comparablePrices)) : null,
        maxComparablePrice: comparablePrices.length ? Math.round(Math.max(...comparablePrices)) : null,
        comparablePrices: comparablePrices.sort((a, b) => a - b).map(price => Math.round(price)),
        comparablePriceBasis: 'actual_sale_price',
        count: filtered.length,
        timeWindow: days,
        confidence: days <= 90 ? 'high' : days <= 180 ? 'medium' : 'low',
        monthlyGrowthRate: growth,
        level: level
      };
    }
  }
  return null;
}

// ===== ADAPTIVE SEARCH =====
function adaptiveSearch(district, propertyType, sizeCat, transactions, targetDate) {
  const windows = [30, 60, 90, 180, 365, 730, Infinity];
  const districtLower = district.toLowerCase().trim();

  // ===== LEVEL 1: District + Type + Size (Fuzzy) =====
  let relevant = transactions.filter(t => {
    const d = (t.district || '').toLowerCase();
    return (d.includes(districtLower) || districtLower.includes(d)) &&
           t.propertyType === propertyType &&
           getSizeCategory(t.area, t.propertyType) === sizeCat;
  });

  if (relevant.length >= 5) {
    return buildResult(relevant, windows, targetDate, 'district_size');
  }

  // ===== LEVEL 2: District + Type only (no size) =====
  if (relevant.length > 0 && relevant.length < 5) {
    console.log(`⚠️ Only ${relevant.length} with size, trying without size...`);
  }
  const relevantNoSize = transactions.filter(t => {
    const d = (t.district || '').toLowerCase();
    return (d.includes(districtLower) || districtLower.includes(d)) &&
           t.propertyType === propertyType;
  });

  if (relevantNoSize.length >= 5) {
    return buildResult(relevantNoSize, windows, targetDate, 'district_type');
  }

  // ===== LEVEL 3: District only (any type) =====
  if (relevantNoSize.length > 0 && relevantNoSize.length < 5) {
    console.log(`⚠️ Only ${relevantNoSize.length} with type, trying district only...`);
  }
  const relevantDistrict = transactions.filter(t => {
    const d = (t.district || '').toLowerCase();
    return d.includes(districtLower) || districtLower.includes(d);
  });

  if (relevantDistrict.length >= 5) {
    return buildResult(relevantDistrict, windows, targetDate, 'district_only');
  }

  console.log(`❌ No data found for ${district} (tried ${relevant.length} with size, ${relevantNoSize.length} with type, ${relevantDistrict.length} district only)`);
  return null;
}

// ============================================================
// HANDLER
// ============================================================

const dldRateLimit = new Map();
const DLD_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DLD_RATE_LIMIT_MAX = 60;
const DLD_RATE_LIMIT_MAX_KEYS = 5000;

function rateLimitKey(event) {
  return event?.headers?.['x-nf-client-connection-ip'] || event?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || 'anonymous';
}

function isRateLimited(event) {
  const key = rateLimitKey(event);
  const now = Date.now();
  for (const [storedKey, stored] of dldRateLimit) {
    if (now - stored.startedAt >= DLD_RATE_LIMIT_WINDOW_MS) dldRateLimit.delete(storedKey);
  }
  if (!dldRateLimit.has(key) && dldRateLimit.size >= DLD_RATE_LIMIT_MAX_KEYS) {
    const oldest = [...dldRateLimit.entries()].sort((left, right) => left[1].startedAt - right[1].startedAt)[0];
    if (oldest) dldRateLimit.delete(oldest[0]);
  }
  const current = dldRateLimit.get(key);
  if (!current || now - current.startedAt >= DLD_RATE_LIMIT_WINDOW_MS) {
    dldRateLimit.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > DLD_RATE_LIMIT_MAX;
}

function jsonResponse(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

exports.handler = async (event) => {
  const headers = withSecurityHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    Vary: 'Origin'
  });
  const corsHeaders = getCorsHeaders(event);
  Object.assign(headers, corsHeaders);

  if (event.httpMethod !== 'GET') return jsonResponse(405, { ...headers, Allow: 'GET' }, { found: false, error: 'Method not allowed' });
  if (isRateLimited(event)) return jsonResponse(429, { ...headers, 'Retry-After': '60' }, { found: false, error: 'Too many requests' });

  try {
    const { district: rawDistrict, propertyType, area } = event.queryStringParameters || {};
    const district = typeof rawDistrict === 'string' ? rawDistrict.trim() : '';

    if (!district || district.length > 120 || !propertyType || !area) {
      return jsonResponse(400, headers, { found: false, error: 'district, propertyType, and area are required' });
    }

    const numericArea = Number(area);
    if (!isSupportedPropertyType(propertyType) || !Number.isFinite(numericArea) || numericArea <= 0) {
      return jsonResponse(400, headers, { found: false, error: 'Unsupported property type or invalid area' });
    }

    const raw = await fetchDLDData();
    if (!raw || raw.length === 0) return jsonResponse(503, headers, { found: false, error: 'DLD data unavailable' });

    const cleaned = applyAllFilters(raw);
    if (cleaned.length === 0) return jsonResponse(503, headers, { found: false, error: 'DLD data unavailable' });

    const size = getSizeCategory(numericArea, propertyType);
    const result = adaptiveSearch(district, propertyType, size, cleaned, new Date());

    if (!result) {
      return jsonResponse(200, headers, {
        found: false,
        reason: 'no-sufficient-data',
        district,
        propertyType,
        size
      });
    }

    return jsonResponse(200, headers, {
      found: true,
      avgPricePerSqm: result.avgPricePerSqm,
      minComparablePrice: result.minComparablePrice,
      maxComparablePrice: result.maxComparablePrice,
      comparablePrices: result.comparablePrices,
      comparablePriceBasis: result.comparablePriceBasis,
      count: result.count,
      timeWindow: result.timeWindow,
      confidence: result.confidence,
      monthlyGrowthRate: result.monthlyGrowthRate,
      level: result.level,
      source: 'dld',
      weight: 1.0,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ DLD lookup error:', error.message);
    return jsonResponse(502, headers, { found: false, error: 'DLD lookup unavailable' });
  }
};

module.exports.buildResult = buildResult;
module.exports.adaptiveSearch = adaptiveSearch;
module.exports.getCorsHeaders = getCorsHeaders;
