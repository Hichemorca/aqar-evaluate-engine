async function loadAccuracyMeta() {
  try {
    const response = await fetch('/data/accuracy-summary.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const metrics = data.metrics || {};
    const metadata = data.metadata || {};
    const records = Number(metadata.totalRecords || metrics.totalRecords || 0);
    const accuracy = Number(metrics.avgAccuracy || 0);
    if (records > 0) document.getElementById('accuracyRecordCount').textContent = records.toLocaleString();
    if (accuracy > 0) {
      const formattedAccuracy = accuracy.toFixed(1);
      document.getElementById('accuracyRate').textContent = formattedAccuracy;
      document.getElementById('footerAccuracyRate').textContent = formattedAccuracy;
    }
    if (metadata.lastUpdated) {
      const updated = new Date(metadata.lastUpdated);
      if (!Number.isNaN(updated.getTime())) {
        document.getElementById('lastDataRefresh').textContent = updated.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }
    window.aqarAccuracyMetrics = metrics;
  } catch (error) {
    console.warn('Could not load accuracy metadata:', error.message);
  }
}
function showToast(msg, dur=3000) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), dur);
}
function onPropertyTypeChange() {
  const type = document.getElementById('propType').value;
  const policy = AQAR_POLICY.getPropertyPolicy(type);
  const isRelevant = field => policy ? !policy.irrelevantFields.includes(field) : false;
  document.getElementById('rowBedrooms').classList.toggle('js-hidden', !isRelevant('bedrooms'));
  document.getElementById('rowFeatures').classList.toggle('js-hidden', !isRelevant('features'));
  document.getElementById('rowYearCondition').classList.toggle('js-hidden', !(isRelevant('yearBuilt') || isRelevant('condition')));
  document.getElementById('incomeSection').classList.toggle('js-hidden', !isRelevant('annualRent'));
  document.getElementById('costSection').classList.toggle('js-hidden', !(isRelevant('landValue') || isRelevant('constructionCost')));
  document.querySelectorAll('#featuresGroup .checkbox-item').forEach(item => {
    const types = item.dataset.types||'';
    item.classList.toggle('js-hidden', !(isRelevant('features') && types.includes(type)));
    if (!types.includes(type)) { const cb = item.querySelector('input'); if (cb?.checked) { cb.checked = false; item.classList.remove('checked'); } }
  });
  document.getElementById('fgFinishQuality').classList.toggle('js-hidden', !isRelevant('finishQuality'));
  document.getElementById('fgViewType').classList.toggle('js-hidden', !isRelevant('viewTypes'));
  document.getElementById('fgFloorLevel').classList.toggle('js-hidden', !isRelevant('floorLevel'));
  document.getElementById('fgStreetPosition').classList.toggle('js-hidden', !isRelevant('streetPosition'));
  document.getElementById('fgBuildingCondition').classList.toggle('js-hidden', !isRelevant('buildingCondition'));
  document.getElementById('fgFurnishedStatus').classList.toggle('js-hidden', !isRelevant('furnishedStatus'));
  updateExtraFieldVisibility();
  if (policy) {
    const fieldElements = {
      bedrooms: document.getElementById('bedrooms'),
      yearBuilt: document.getElementById('yearBuilt'),
      condition: document.getElementById('condition'),
      finishQuality: document.getElementById('finishQuality'),
      floorLevel: document.getElementById('floorLevel'),
      streetPosition: document.getElementById('streetPosition'),
      buildingCondition: document.getElementById('buildingCondition'),
      furnishedStatus: document.getElementById('furnishedStatus'),
      annualRent: document.getElementById('annualRent'),
      annualExpenses: document.getElementById('annualExpenses'),
      landValue: document.getElementById('landValue'),
      constructionCost: document.getElementById('constructionCost')
    };
    policy.irrelevantFields.forEach(field => {
      if (field === 'features') {
        document.querySelectorAll('#featuresGroup input:checked').forEach(cb => { cb.checked = false; cb.closest('.checkbox-item')?.classList.remove('checked'); });
      } else if (field === 'viewTypes') {
        document.querySelectorAll('#viewTypeGroup input:checked').forEach(cb => { cb.checked = false; cb.closest('.checkbox-item')?.classList.remove('checked'); });
      } else if (fieldElements[field]) {
        fieldElements[field].value = '';
      }
    });
  }
}
