let data = null;

async function loadData() {
  try {
    const res = await fetch('/data/accuracy-data.json');
    data = await res.json();
    document.getElementById('stats').innerHTML = `
      &bull; ${data.metrics.totalRecords} transactions loaded |
      MIAYAAR accuracy: <b class="accuracy-value">${data.metrics.avgAccuracy}%</b> |
      Deviation: &plusmn;${data.metrics.avgDeviation}%
    `;
  } catch (e) {
    document.getElementById('stats').textContent = 'Data not available';
  }
}

function csvCell(value) {
  const text = String(value ?? '');
  const safeText = typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function exportCSV() {
  if (!data || !data.records) return alert('No data');
  const headers = ['Ref', 'Type', 'District', 'Area (sqm)', 'Actual Price (AED)', 'MIAYAAR Valuation (AED)', 'MIAYAAR vs Actual (%)', 'Date'];
  const rows = data.records.map(r => [
    r.propertyRef, r.propertyType, r.district, r.area, r.actualSalePrice,
    r.aqarValuation, r.aqarVsActual, r.saleDate
  ].map(csvCell).join(','));
  downloadFile([headers.map(csvCell).join(','), ...rows].join('\n') + '\n', 'miayaar-accuracy-data.csv', 'text/csv;charset=utf-8');
}

function exportJSON() {
  if (!data) return alert('No data');
  downloadFile(JSON.stringify(data, null, 2), 'miayaar-accuracy-data.json', 'application/json');
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  a.href = objectUrl;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

document.getElementById('exportCsvButton')?.addEventListener('click', exportCSV);
document.getElementById('exportJsonButton')?.addEventListener('click', exportJSON);
loadData();
