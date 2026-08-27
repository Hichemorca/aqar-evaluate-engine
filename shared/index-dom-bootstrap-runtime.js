document.addEventListener('DOMContentLoaded', function() {
  loadDistrictCoords();
  loadDistrictsFromDLD();
  document.getElementById('city').value = 'dubai';
  document.getElementById('gisRadius').value = String(getGISRadiusMeters());
  document.querySelectorAll('.checkbox-item').forEach(item => {
    item.addEventListener('click', function(e) {
      e.preventDefault();
      const cb = this.querySelector('input');
      cb.checked = !cb.checked;
      this.classList.toggle('checked', cb.checked);
      if (this.closest('#viewTypeGroup')) handleViewTypeChange(cb);
    });
  });
  onPropertyTypeChange();
  const valuationButton = document.getElementById('btnValuate');
  valuationButton.disabled = true;
  loadCalibrationConfig().finally(() => { valuationButton.disabled = false; setTimeout(initGISMap, 100); });
  loadAccuracyMeta();
  loadMarketIntelligence();
  document.addEventListener('click', function(e) {
    const districtList = document.getElementById('districtAutocomplete');
    const projectList = document.getElementById('projectBuildingAutocomplete');
    const districtInput = document.getElementById('districtInput');
    const projectInput = document.getElementById('projectBuildingInput');
    const insideDistrict = e.target === districtInput || districtList?.contains(e.target);
    const insideProject = e.target === projectInput || projectList?.contains(e.target);
    if (!insideDistrict) hideAutocompleteList(districtList);
    if (!insideProject) hideAutocompleteList(projectList);
  });
});
