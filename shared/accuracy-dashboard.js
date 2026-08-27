const escapeHtml = value => AQAR_HTML_ESCAPE.escapeHtml(value);
let currentDataSource = 'unknown';

async function loadDashboard() {
  await loadFromLocal();
}

async function loadFromLocal() {
  document.getElementById('tableContainer').innerHTML = '<div class="loading"><div class="spinner"></div><div>Loading saved data...</div></div>';
  try {
    const response = await fetch('/data/accuracy-data.json');
    if (!response.ok) {
      document.getElementById('tableContainer').innerHTML = '<div class="loading loading-error">⚠️ Could not load the verified DLD snapshot. Official accuracy is unavailable until a verified snapshot is restored.</div>';
      return false;
    }
    const data = await response.json();
    if (!data.records || data.records.length === 0) {
      document.getElementById('tableContainer').innerHTML = '<div class="loading">No verified DLD accuracy snapshot is available.</div>';
      return false;
    }
    const unverified = data.records.filter(record =>
      record.dataSource !== 'dld-real-cleaned' ||
      record.scrapedFrom !== 'Dubai Land Department' ||
      record.verifiedBy !== 'Government Record'
    );
    if (unverified.length > 0) {
      document.getElementById('tableContainer').innerHTML = '<div class="loading loading-error">⚠️ Accuracy snapshot rejected: it contains records without verified provenance.</div>';
      return false;
    }
    updateStats(data.metrics);
    updateTable(data.records);
    updateLastUpdated(data.metadata?.lastUpdated);
    updateSourceBadge('cached', '✅ Verified Snapshot');
    currentDataSource = 'cached';
    return true;
  } catch (err) {
    console.log('No local data file found');
    return false;
  }
}

// Live accuracy loading remains disabled until an approved verified source adapter is available.

function updateStats(metrics) {
  if (!metrics) return;
  const avgAcc = document.getElementById('avgAccuracy');
  avgAcc.textContent = metrics.avgAccuracy ? metrics.avgAccuracy + '%' : '—';
  avgAcc.className = 'stat-value ' + (metrics.avgAccuracy >= 90 ? 'green' : metrics.avgAccuracy >= 75 ? 'gold' : 'red');
  document.getElementById('avgDeviation').textContent = metrics.avgDeviation ? '±' + metrics.avgDeviation + '%' : '—';
  document.getElementById('priceBand15').textContent = metrics.priceBand15 ? metrics.priceBand15 + '%' : '—';
  const totalRecords = Number(metrics.totalRecords || 0);
  document.getElementById('totalRecords').textContent = totalRecords ? totalRecords.toLocaleString() : '0';
  document.getElementById('datasetRecordCount').textContent = totalRecords ? totalRecords.toLocaleString() : '0';
  document.getElementById('trackedRecordsDetail').textContent = totalRecords ? `${totalRecords.toLocaleString()} validation records` : 'Validation records';
}

function updateTable(properties) {
  if (!properties || properties.length === 0) {
    document.getElementById('tableContainer').innerHTML = '<div class="loading">No transaction data available.</div>';
    return;
  }
  let html = '<table><thead><tr>';
  html += '<th>Ref</th><th>City</th><th>Type</th><th>District</th><th>Area</th>';
  html += '<th>Actual Price</th><th>MIAYAAR Valuation</th><th>Diff</th>';
  html += '<th>Date</th>';
  html += '</tr></thead><tbody>';
  properties.slice(0, 100).forEach(p => {
    const aqarDiff = p.aqarVsActual || 0;
    const diffClass = Math.abs(aqarDiff) < 15 ? 'green' : Math.abs(aqarDiff) < 25 ? 'gold' : 'red';
    html += '<tr>';
    html += `<td class="table-ref-cell">${escapeHtml((p.propertyRef || '—').substring(0, 12))}</td>`;
    html += `<td class="table-city-cell">${escapeHtml(p.city || 'dubai')}</td>`;
    html += `<td>${escapeHtml(p.propertyType || '—')}</td>`;
    html += `<td>${escapeHtml(p.district || '—')}</td>`;
    html += `<td>${p.area ? p.area.toLocaleString() + ' sqm' : '—'}</td>`;
    html += `<td>${p.actualSalePrice ? Number(p.actualSalePrice).toLocaleString() + ' AED' : '—'}</td>`;
    html += `<td>${p.aqarValuation ? Number(p.aqarValuation).toLocaleString() + ' AED' : '—'}</td>`;
    html += `<td><span class="badge ${diffClass}">${aqarDiff > 0 ? '+' : ''}${aqarDiff}%</span></td>`;
    html += `<td class="table-date-cell">${escapeHtml(p.saleDate || '—')}</td>`;
    html += '</tr>';
  });
  html += '</tbody></table>';
  html += `<div class="table-summary">Showing ${Math.min(properties.length, 100)} of ${properties.length} transactions</div>`;
  document.getElementById('tableContainer').innerHTML = html;
}

function updateLastUpdated(dateStr) {
  if (!dateStr) { document.getElementById('lastUpdated').textContent = ''; return; }
  const date = new Date(dateStr);
  const now = new Date();
  const diffHours = Math.round((now - date) / 3600000);
  const timeAgo = diffHours < 1 ? 'Just now' : diffHours < 24 ? diffHours + ' hours ago' : Math.round(diffHours / 24) + ' days ago';
  document.getElementById('lastUpdated').textContent = `Last updated: ${date.toLocaleString()} (${timeAgo})`;
}

function updateSourceBadge(type, label) {
  const badge = document.getElementById('dataSourceBadge');
  badge.innerHTML = `<span class="data-source-badge ${type}">${label}</span>`;
}

document.addEventListener('DOMContentLoaded', loadDashboard);
document.getElementById('loadSavedDataButton')?.addEventListener('click', loadFromLocal);
