// Primary form event listeners for the public valuation page.
(function registerPrimaryInteractions() {
  const bind = () => {
    document.getElementById('propType')?.addEventListener('change', onPropertyTypeChange);
    document.getElementById('yearBuilt')?.addEventListener('input', updateExtraFieldVisibility);
    document.querySelectorAll('#viewTypeGroup input[type="checkbox"]').forEach(input => {
      input.addEventListener('change', () => handleViewTypeChange(input));
    });

    const districtInput = document.getElementById('districtInput');
    districtInput?.addEventListener('input', () => filterDistricts(districtInput.value));
    districtInput?.addEventListener('focus', () => districtInput.select());

    const projectInput = document.getElementById('projectBuildingInput');
    projectInput?.addEventListener('input', () => onProjectBuildingInput(projectInput.value));
    projectInput?.addEventListener('focus', () => filterProjectBuildings(projectInput.value));

    document.getElementById('btnScrape')?.addEventListener('click', scrapeRealData);
    document.getElementById('btnValuate')?.addEventListener('click', runValuation);
    document.getElementById('btnReset')?.addEventListener('click', resetAll);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
