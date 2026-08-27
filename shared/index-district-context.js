// District summaries and autocomplete context for the public valuation page.
async function loadDistrictsFromDLD() {
  const countEl = document.getElementById('districtCount');
  countEl.textContent = 'Loading districts...';
  try {
    const [districtResponse, projectResponse] = await Promise.all([
      fetch('/data/district-list.json'),
      fetch('/data/project-building-summary.json')
    ]);
    if (!districtResponse.ok) throw new Error(`District summary HTTP ${districtResponse.status}`);
    const districtData = await districtResponse.json();
    const districts = Array.isArray(districtData?.districts) ? districtData.districts.filter(Boolean) : [];
    if (districts.length > 10) {
      dubaiDistrictsList = [...new Set(districts)].sort();
      projectBuildingSummary = null;
      if (projectResponse.ok) {
        try {
          const projectData = await projectResponse.json();
          if (Array.isArray(projectData?.entries)) projectBuildingSummary = projectData;
        } catch (projectError) {
          console.warn('⚠️ Could not parse project summary:', projectError.message);
        }
      }
      countEl.textContent = `✅ ${dubaiDistrictsList.length} districts available`;
      console.log(`✅ Loaded ${dubaiDistrictsList.length} districts from summary`);
      return;
    }
    throw new Error('District summary is empty');
  } catch (e) {
    projectBuildingSummary = null;
    console.warn('⚠️ Could not load client summaries:', e.message);
  }
  dubaiDistrictsList = UAE_DISTRICTS.dubai || [];
  countEl.textContent = `📋 Using ${dubaiDistrictsList.length} districts (fallback)`;
}

function projectOptionsForCurrentContext() {
  const type = document.getElementById('propType').value;
  const district = (document.getElementById('selectedDistrict').value || document.getElementById('districtInput').value || '').trim().toLowerCase();
  if (!district) return [];
  const options = new Set();
  (projectBuildingSummary?.entries || []).forEach(entry => {
    if (entry.propertyType !== type) return;
    const rowDistrict = String(entry.district || '').toLowerCase();
    if (district && !(rowDistrict.includes(district) || district.includes(rowDistrict))) return;
    (entry.projects || []).forEach(project => {
      if (project?.name && String(project.name).trim()) options.add(String(project.name).trim());
    });
  });
  return [...options].sort((a, b) => a.localeCompare(b));
}

function refreshProjectSuggestions() {
  const input = document.getElementById('projectBuildingInput');
  const row = document.getElementById('rowProjectBuilding');
  if (!input || !row) return;
  const visibility = AQAR_PROPERTY_EXTRA_FIELDS.getVisibility(document.getElementById('propType').value, document.getElementById('yearBuilt').value);
  row.classList.toggle('js-hidden', !visibility.projectBuilding);
  if (!visibility.projectBuilding) { selectedProjectBuilding = ''; input.value = ''; hideAutocompleteList(document.getElementById('projectBuildingAutocomplete')); }
  else if (selectedProjectBuilding && !projectOptionsForCurrentContext().includes(selectedProjectBuilding)) { selectedProjectBuilding = ''; input.value = ''; }
  updateProjectBuildingNotice();
  updateProjectMapLabel();
}

function getProjectEvidence(name) {
  const normalized = String(name || '').trim().toLowerCase();
  const type = document.getElementById('propType').value;
  const district = (document.getElementById('selectedDistrict').value || document.getElementById('districtInput').value || '').trim().toLowerCase();
  if (!normalized || !district) return { count: 0, verified: false };
  const entry = (projectBuildingSummary?.entries || []).find(candidate => {
    if (candidate.propertyType !== type) return false;
    const candidateDistrict = String(candidate.district || '').toLowerCase();
    return candidateDistrict === district || candidateDistrict.includes(district) || district.includes(candidateDistrict);
  });
  const project = entry?.projects?.find(candidate => String(candidate?.name || '').trim().toLowerCase() === normalized);
  const count = Number(project?.transactionCount || 0);
  return { count: Number.isFinite(count) ? count : 0, verified: count > 0 };
}

function updateProjectBuildingNotice() {
  const input = document.getElementById('projectBuildingInput');
  const notice = document.getElementById('projectBuildingNotice');
  if (!input || !notice) return;
  const value = input.value.trim();
  if (!value) { notice.textContent = 'Choose a project or leave as Unknown.'; notice.style.color = 'var(--muted)'; return; }
  if (!(document.getElementById('selectedDistrict').value || '').trim()) { notice.textContent = 'Select a district first to see project suggestions.'; notice.style.color = 'var(--gold)'; return; }
  if (!selectedProjectBuilding || selectedProjectBuilding.toLowerCase() !== value.toLowerCase()) { notice.textContent = 'No verified project match. The estimate remains based on the district.'; notice.style.color = 'var(--gold)'; return; }
  const evidence = getProjectEvidence(value);
  if (evidence.count < 5) { notice.textContent = `Limited project information (${evidence.count} transaction${evidence.count === 1 ? '' : 's'}). The estimate remains based on the district.`; notice.style.color = 'var(--gold)'; }
  else { notice.textContent = `Project information: ${evidence.count} transactions. The estimate remains based on the district.`; notice.style.color = 'var(--green)'; }
}

function onProjectBuildingInput(value) {
  if (!selectedProjectBuilding || selectedProjectBuilding.toLowerCase() !== String(value || '').trim().toLowerCase()) selectedProjectBuilding = '';
  filterProjectBuildings(value);
  updateProjectBuildingNotice();
  updateProjectMapLabel();
}

function setAutocompleteExpanded(list, expanded) {
  const inputId = { districtAutocomplete: 'districtInput', projectBuildingAutocomplete: 'projectBuildingInput' }[list?.id];
  if (inputId) document.getElementById(inputId)?.setAttribute('aria-expanded', String(expanded));
}

function setAutocompleteItem(item, onSelect) {
  item.setAttribute('role', 'option');
  item.tabIndex = 0;
  item.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  });
}

function filterProjectBuildings(q) {
  const list = document.getElementById('projectBuildingAutocomplete');
  const input = document.getElementById('projectBuildingInput');
  if (!list || !input) return;
  promoteAutocompleteList(list);
  closeOtherAutocompleteLists(list);
  const options = projectOptionsForCurrentContext().filter(name => !q || name.toLowerCase().includes(q.toLowerCase().trim()));
  list.replaceChildren();
  if (!options.length) {
    list.style.display = q ? 'block' : 'none';
    if (q) positionAutocompleteList(list, input);
    if (q) { const empty = document.createElement('div'); empty.className = 'item'; empty.style.cssText = 'color:var(--muted);cursor:default;'; empty.textContent = 'No projects found in this district'; list.appendChild(empty); setAutocompleteExpanded(list, true); }
    return;
  }
  options.slice(0, 15).forEach(name => {
    const item = document.createElement('div');
    item.className = 'item';
    item.textContent = name;
    const select = () => selectProjectBuilding(name);
    item.addEventListener('click', select);
    setAutocompleteItem(item, select);
    list.appendChild(item);
  });
  list.style.display = 'block';
  setAutocompleteExpanded(list, true);
  positionAutocompleteList(list, input);
}

function selectProjectBuilding(name) {
  selectedProjectBuilding = name;
  document.getElementById('projectBuildingInput').value = name;
  hideAutocompleteList(document.getElementById('projectBuildingAutocomplete'));
  updateProjectBuildingNotice();
  updateProjectMapLabel();
  debouncedFetchGISData();
}

function promoteAutocompleteList(list) {
  if (!list || list.dataset.portalized === 'true') return;
  document.body.appendChild(list);
  list.classList.add('autocomplete-portal');
  list.dataset.portalized = 'true';
}

function positionAutocompleteList(list, input) {
  if (!list || !input || list.dataset.portalized !== 'true') return;
  const rect = input.getBoundingClientRect();
  const listHeight = Math.min(240, Math.max(100, list.scrollHeight || 200));
  let top = rect.bottom;
  if (top + listHeight > window.innerHeight - 8 && rect.top > listHeight + 8) top = rect.top - listHeight;
  list.style.top = `${Math.max(8, Math.round(top))}px`;
  list.style.left = `${Math.max(8, Math.round(rect.left))}px`;
  list.style.width = `${Math.round(rect.width)}px`;
  list.style.maxHeight = `${Math.max(100, Math.min(240, window.innerHeight - Math.max(8, Math.round(top)) - 8))}px`;
}

function hideAutocompleteList(list) {
  if (list) {
    list.style.display = 'none';
    setAutocompleteExpanded(list, false);
  }
}

function closeOtherAutocompleteLists(keep) {
  ['districtAutocomplete', 'projectBuildingAutocomplete'].forEach(id => {
    const list = document.getElementById(id);
    if (list && list !== keep) hideAutocompleteList(list);
  });
}

function repositionVisibleAutocompleteLists() {
  const pairs = [
    ['districtAutocomplete', 'districtInput'],
    ['projectBuildingAutocomplete', 'projectBuildingInput']
  ];
  pairs.forEach(([listId, inputId]) => {
    const list = document.getElementById(listId);
    if (list?.style.display === 'block') positionAutocompleteList(list, document.getElementById(inputId));
  });
}

window.addEventListener('scroll', repositionVisibleAutocompleteLists, true);

window.addEventListener('resize', repositionVisibleAutocompleteLists);

function filterDistricts(q) {
  const c = document.getElementById('districtAutocomplete');
  const input = document.getElementById('districtInput');
  if (!q || q.length < 1) { hideAutocompleteList(c); return; }
  promoteAutocompleteList(c);
  closeOtherAutocompleteLists(c);
  const r = dubaiDistrictsList.filter(d => d.toLowerCase().includes(q.toLowerCase().trim()));
  c.replaceChildren();
  if (r.length) {
    r.slice(0, 15).forEach(d => {
      const item = document.createElement('div');
      item.className = 'item';
      item.textContent = d;
      const select = () => selectDistrict(d);
      item.addEventListener('mousedown', event => {
        event.preventDefault();
        select();
      });
      setAutocompleteItem(item, select);
      c.appendChild(item);
    });
  } else {
    const empty = document.createElement('div');
    empty.className = 'item';
    empty.style.cssText = 'color:var(--muted);cursor:default;';
    empty.textContent = 'No districts found';
    c.appendChild(empty);
  }
  c.style.display = 'block';
  setAutocompleteExpanded(c, true);
  positionAutocompleteList(c, input);
}
