function updateExtraFieldVisibility() {
  const type = document.getElementById('propType').value;
  const yearBuilt = Number(document.getElementById('yearBuilt').value);
  const currentYear = AQAR_PROPERTY_EXTRA_FIELDS.CURRENT_YEAR;
  const visibility = AQAR_PROPERTY_EXTRA_FIELDS.getVisibility(type, yearBuilt, currentYear);
  const olderThanFiveYears = Number.isFinite(yearBuilt) && currentYear - yearBuilt > 5;
  const hasVisibleField = olderThanFiveYears && (visibility.bua || visibility.plotArea || visibility.renovationYear);
  document.getElementById('propertyExtraSection').classList.toggle('js-hidden', !hasVisibleField);
  document.getElementById('rowPropertyAreas').classList.toggle('js-hidden', !(visibility.bua || visibility.plotArea));
  document.getElementById('fgBua').classList.toggle('js-hidden', !visibility.bua);
  document.getElementById('fgPlotArea').classList.toggle('js-hidden', !visibility.plotArea);
  document.getElementById('fgLastRenovation').classList.toggle('js-hidden', !visibility.renovationYear);
  if (!visibility.bua) document.getElementById('bua').value = '';
  if (!visibility.plotArea) document.getElementById('plotArea').value = '';
  if (!visibility.renovationYear) document.getElementById('lastRenovationYear').value = '';
  refreshProjectSuggestions();
}

function handleViewTypeChange(cb) {
  const g = document.getElementById('viewTypeGroup'), all = g.querySelectorAll('input[type="checkbox"]'), excl = ['unknown','internal'], norm = ['sea','partial-sea','city','garden','park','street'];
  if (excl.includes(cb.value) && cb.checked) all.forEach(x => { if (x !== cb && x.checked) { x.checked = false; x.closest('.checkbox-item').classList.remove('checked'); } });
  else if (norm.includes(cb.value) && cb.checked) all.forEach(x => { if (excl.includes(x.value) && x.checked) { x.checked = false; x.closest('.checkbox-item').classList.remove('checked'); } });
  all.forEach(x => x.checked ? x.closest('.checkbox-item').classList.add('checked') : x.closest('.checkbox-item').classList.remove('checked'));
}
function getSelectedViewTypes() { return Array.from(document.querySelectorAll('#viewTypeGroup input[type="checkbox"]:checked')).map(el => el.value); }
