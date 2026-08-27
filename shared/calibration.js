    let activeConfig = null;
    let originalConfig = null;
    const $ = id => document.getElementById(id);
    const token = () => $('adminToken').value.trim();
    const label = path => path[path.length - 1].replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').replace(/^./, c => c.toUpperCase());
    const formatDate = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString(); };
    const methodGroups = { 'sales-comparison': 'sales', income: 'income', cost: 'cost', dcf: 'dcf' };
    const methodLabels = { 'sales-comparison': 'Sales Comparison', income: 'Income', cost: 'Cost', dcf: 'DCF' };
    const propertyTypeLabels = { apartment: 'Apartment', villa: 'Villa', townhouse: 'Townhouse', office: 'Office', retail: 'Retail / Shop', warehouse: 'Warehouse', land: 'Land' };
    const valuationFieldDefinitions = [
      { title: 'Total Area (sqm)', groups: [
        { method: 'sales-comparison', group: 'sales', keys: ['maxPricePerSqm'] },
        { method: 'cost', group: 'cost', keys: ['constructionCostPerSqm', 'landValueFromMarketShare', 'landValueFromBuildShare'] }
      ] },
      { title: 'Bedrooms', groups: [{ method: 'sales-comparison', group: 'sales', keys: ['noBedroomMultiplier'] }] },
      { title: 'Features & Amenities', groups: [{ method: 'sales-comparison', group: 'sales', keys: ['featureBonusPerSqm'] }] },
      { title: 'Year Built', groups: [
        { method: 'sales-comparison', group: 'sales', keys: ['ageDepreciation', 'minimumAgeMultiplier'] },
        { method: 'cost', group: 'cost', keys: ['depreciationPerYear', 'maximumDepreciation'] }
      ] },
      { title: 'Condition', groups: [
        { method: 'sales-comparison', group: 'sales', keys: ['conditionFactors.excellent', 'conditionFactors.good', 'conditionFactors.fair', 'conditionFactors.needs-renovation'] },
        { method: 'cost', group: 'cost', keys: ['conditionFactors.excellent', 'conditionFactors.good', 'conditionFactors.fair', 'conditionFactors.needs-renovation'] }
      ] },
      { title: 'Finish Quality', groups: [{ method: 'sales-comparison', group: 'sales', keys: ['finishFactors.luxury', 'finishFactors.good', 'finishFactors.normal', 'finishFactors.basic', 'finishFactors.poor'] }] },
      { title: 'View Type', groups: [
        { method: 'sales-comparison', group: 'sales', keys: ['viewFactors.sea', 'viewFactors.partial-sea', 'viewFactors.city', 'viewFactors.garden', 'viewFactors.park', 'viewFactors.street', 'viewSecondaryFactor', 'viewMinimumMultiplier', 'viewMaximumMultiplier'] }
      ] },
      { title: 'Floor Level', groups: [{ method: 'sales-comparison', group: 'sales', keys: ['floorFactors.penthouse', 'floorFactors.very-high', 'floorFactors.high', 'floorFactors.mid', 'floorFactors.low', 'floorFactors.ground'] }] },
      { title: 'Street Position', groups: [{ method: 'sales-comparison', group: 'sales', keys: ['streetFactors.main', 'streetFactors.corner', 'streetFactors.secondary', 'streetFactors.quiet'] }] },
      { title: 'Building Condition', groups: [{ method: 'sales-comparison', group: 'sales', keys: ['buildingConditionFactors.excellent', 'buildingConditionFactors.good', 'buildingConditionFactors.fair', 'buildingConditionFactors.old'] }] },
      { title: 'Furnished Status', groups: [{ method: 'sales-comparison', group: 'sales', keys: ['furnishedFactors.furnished', 'furnishedFactors.semi-furnished', 'furnishedFactors.unfurnished'] }] },
      { title: 'Annual Rent (AED)', groups: [{ method: 'income', group: 'income', keys: ['vacancyRatePercent', 'capRatePercent'] }] },
      { title: 'Annual Expenses (AED)', groups: [{ method: 'income', group: 'income', keys: ['expenseRate'] }] }
    ];

    function showNotice(message, type='info') { const box = $('notice'); box.textContent = message; box.className = `notice show ${type}`; }
    function setStatus(message) { $('status').textContent = message; }
    function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
    function getAt(object, path) { return path.reduce((current, key) => current?.[key], object); }
    function setAt(object, path, value) { let current = object; path.slice(0, -1).forEach(key => { current = current[key]; }); current[path[path.length - 1]] = value; }

    function collectNumericLeaves(value, path=[], output=[]) {
      if (!value || typeof value !== 'object') return output;
      for (const [key, child] of Object.entries(value)) {
        const next = [...path, key];
        if (typeof child === 'number') output.push({ path: next, value: child });
        else if (child && typeof child === 'object' && !Array.isArray(child)) collectNumericLeaves(child, next, output);
      }
      return output;
    }

    function escapeHtml(value) { return AQAR_HTML_ESCAPE.escapeHtml(value); }
    function pathForV21(propertyType, group, key, field) { return ['v21ShadowMultipliers', 'propertyTypes', propertyType, group, key, field].filter(segment => segment !== '').map(encodeURIComponent).join('.'); }
    function pathForV21Band(propertyType, group, index, field) { return ['v21ShadowMultipliers', 'propertyTypes', propertyType, group, 'bands', index, field].map(encodeURIComponent).join('.'); }
    function renderShadowSection(propertyType, propertyConfig) {
      const shadow = activeConfig.v21ShadowMultipliers || {};
      const v21 = shadow.propertyTypes?.[propertyType] || {};
      const projectMap = v21.projectBuilding?.projectMultipliers || {};
      const projectRows = Object.entries(projectMap).map(([key, value]) => `<div class="field-grid shadow-project-row"><div class="field"><label>Project key (type | district | project)</label><input data-project-key-label="true" type="text" value="${escapeHtml(key)}" readonly></div><div class="field"><label>Multiplier</label><input data-path="${pathForV21(propertyType, 'projectBuilding', 'projectMultipliers', key)}" data-project-multiplier="true" data-project-key="${escapeHtml(key)}" type="number" min="0.01" step="0.001" value="${Number(value)}"></div><div class="field"><button type="button" class="secondary" data-action="remove-project-multiplier">Remove</button></div></div>`).join('');
      const ratioBands = v21.buaPlotArea?.bands || [];
      const renovationBands = v21.lastRenovation?.bands || [];
      const renderBands = (group, bands, metricKey, labelText) => bands.map((band, index) => `<div class="field-grid shadow-band-row"><div class="field"><label>${escapeHtml(labelText)} ${index + 1} max (${band[metricKey] === null ? 'open' : metricKey === 'maxRatio' ? 'ratio' : 'years'})</label><input data-path="${pathForV21Band(propertyType, group, index, metricKey)}" data-band-field="${metricKey}" data-null-if-empty="true" type="number" min="0" step="0.01" value="${band[metricKey] === null ? '' : Number(band[metricKey])}"></div><div class="field"><label>Multiplier</label><input data-path="${pathForV21Band(propertyType, group, index, 'multiplier')}" data-band-field="multiplier" type="number" min="0.01" step="0.001" value="${Number(band.multiplier)}"></div></div>`).join('');
      const globalControls = propertyType === 'apartment' ? `<div class="field-grid"><div class="field"><label>Shadow enabled (0/1)</label><input data-path="v21ShadowMultipliers.enabled" type="number" min="0" max="1" step="1" value="${shadow.enabled ? 1 : 0}"></div><div class="field"><label>Minimum project evidence</label><input data-path="v21ShadowMultipliers.minProjectEvidence" type="number" min="1" step="1" value="${Number(shadow.minProjectEvidence || 5)}"></div><div class="field"><label>Combined minimum ×</label><input data-path="v21ShadowMultipliers.combinedMinimumMultiplier" type="number" min="0.01" step="0.001" value="${Number(shadow.combinedMinimumMultiplier || 0.85)}"></div><div class="field"><label>Combined maximum ×</label><input data-path="v21ShadowMultipliers.combinedMaximumMultiplier" type="number" min="0.01" step="0.001" value="${Number(shadow.combinedMaximumMultiplier || 1.15)}"></div></div>` : '';
      const projectCard = `<article class="field-card"><div class="field-card-head"><h3>Project / Building Name</h3><span class="field-card-count">Shadow controls</span></div><div class="field-grid"><div class="field"><label>Default project multiplier</label><input data-path="${pathForV21(propertyType, 'projectBuilding', 'defaultMultiplier', '')}" type="number" min="0.01" step="0.001" value="${Number(v21.projectBuilding?.defaultMultiplier || 1)}"></div></div><div id="projectRows-${escapeHtml(propertyType)}">${projectRows || '<div class="small">No project-specific multipliers configured. Add one only after reviewing DLD evidence.</div>'}</div><div class="field-grid shadow-add-row"><div class="field"><label>New project key: type | district | project</label><input id="newProjectKey-${escapeHtml(propertyType)}" type="text" placeholder="apartment | district | project"></div><div class="field"><label>Multiplier</label><input id="newProjectValue-${escapeHtml(propertyType)}" type="number" min="0.01" step="0.001" value="1"></div><div class="field"><button type="button" data-action="add-project-multiplier" data-property-type="${escapeHtml(propertyType)}">Add project</button></div></div></article>`;
      const ratioCard = `<article class="field-card"><div class="field-card-head"><h3>BUA / Plot Area</h3><span class="field-card-count">Shadow controls</span></div>${renderBands('buaPlotArea', ratioBands, 'maxRatio', 'Ratio band')}</article>`;
      const renovationCard = `<article class="field-card"><div class="field-card-head"><h3>Last Renovation Year</h3><span class="field-card-count">Shadow controls</span></div>${renderBands('lastRenovation', renovationBands, 'maxAgeYears', 'Age band')}</article>`;
      const globalCard = globalControls ? `<article class="field-card advanced-field-card"><div class="field-card-head"><h3>Shadow Settings</h3><span class="field-card-count">Advanced</span></div>${globalControls}</article>` : '';
      return `<div class="section"><div class="section-title"><span>Experimental Shadow Controls</span><span class="panel-note">disabled by default · neutral = 1.00×</span></div><div class="small shadow-note">These controls affect only the experimental shadow preview until separately approved for production.</div><div class="field-card-grid">${projectCard}${ratioCard}${renovationCard}${globalCard}</div></div>`;
    }

    function renderInputField(path, value, options = {}) {
      const displayValue = options.percent ? Number(value) * 100 : value;
      const suffix = options.percent ? '<span class="panel-note">%</span>' : '';
      const step = options.percent ? '0.1' : (options.step || 'any');
      return `<div class="field"><label for="${escapeHtml(path.join('__'))}">${escapeHtml(label(path.slice(-2)))}</label><div class="calibration-input-row"><input id="${escapeHtml(path.join('__'))}" data-path="${escapeHtml(path.join('.'))}" data-percent="${Boolean(options.percent)}" type="number" step="${step}" value="${displayValue}">${suffix}</div></div>`;
    }

    function renderFieldCard(title, groups, cardClass = '') {
      const visibleGroups = groups.filter(group => group.fields.length);
      if (!visibleGroups.length) return '';
      const count = visibleGroups.reduce((total, group) => total + group.fields.length, 0);
      const body = visibleGroups.map(group => `${group.heading ? `<div class="panel-note calibration-group-heading">${escapeHtml(group.heading)}</div>` : ''}<div class="field-grid">${group.fields.join('')}</div>`).join('');
      return `<article class="field-card ${cardClass}"><div class="field-card-head"><h3>${escapeHtml(title)}</h3><span class="field-card-count">${count} controls</span></div>${body}</article>`;
    }

    function renderValuationFactors(propertyType, propertyConfig) {
      const cards = valuationFieldDefinitions.map(definition => {
        const groups = definition.groups.filter(definitionGroup => (propertyConfig.applicableMethods || []).includes(definitionGroup.method)).map(definitionGroup => {
          const coefficientObject = propertyConfig.coefficients?.[definitionGroup.group];
          const leaves = collectNumericLeaves(coefficientObject, []).filter(({ path }) => definitionGroup.keys.includes(path.join('.')));
          return {
            heading: methodLabels[definitionGroup.method] || definitionGroup.method,
            fields: leaves.map(({ path, value }) => renderInputField(['propertyTypes', propertyType, 'coefficients', definitionGroup.group, ...path], value))
          };
        });
        return renderFieldCard(definition.title, groups);
      }).filter(Boolean).join('');
      return cards ? `<div class="section"><div class="section-title"><span>Valuation Factors</span><span class="panel-note">Grouped by user-facing fields</span></div><div class="field-card-grid">${cards}</div></div>` : '';
    }

    function renderValuationMethods(propertyType, propertyConfig) {
      const fields = (propertyConfig.applicableMethods || []).filter(method => typeof propertyConfig.weights?.[method] === 'number').map(method => renderInputField(['propertyTypes', propertyType, 'weights', method], propertyConfig.weights[method], { percent: true }));
      return `<div class="section"><div class="section-title"><span>Valuation Methods</span><span class="panel-note">Applicable methods only</span></div>${renderWeightSummary(propertyType, propertyConfig)}${renderFieldCard('Method weights', [{ heading: '', fields }])}</div>`;
    }

    function renderAdvancedCalibration(propertyType, propertyConfig) {
      const used = new Set(valuationFieldDefinitions.flatMap(definition => definition.groups.filter(group => (propertyConfig.applicableMethods || []).includes(group.method)).flatMap(group => group.keys.map(key => `${group.group}:${key}`))));
      const cards = (propertyConfig.applicableMethods || []).map(method => {
        const group = methodGroups[method];
        const leaves = collectNumericLeaves(propertyConfig.coefficients?.[group], []).filter(({ path }) => !used.has(`${group}:${path.join('.')}`));
        return renderFieldCard(methodLabels[method] || method, [{ heading: '', fields: leaves.map(({ path, value }) => renderInputField(['propertyTypes', propertyType, 'coefficients', group, ...path], value)) }], 'advanced-field-card');
      }).filter(Boolean).join('');
      return cards ? `<div class="section"><div class="section-title"><span>Advanced Calibration</span><span class="panel-note">Additional method controls</span></div><div class="advanced-grid">${cards}</div></div>` : '';
    }

    function renderGlobalFactors(gis) {
      const fields = collectNumericLeaves(gis, ['gis']).map(({ path, value }) => renderInputField(path, value));
      return `<div class="section"><div class="section-title"><span>Valuation Factors</span><span class="panel-note">Shared Location & Facilities settings</span></div><div class="field-card-grid">${renderFieldCard('Location & Facilities', [{ heading: '', fields }])}</div></div>`;
    }

    function getApplicableWeightTotal(config) {
      const applicable = config?.applicableMethods || [];
      return applicable.reduce((sum, method) => sum + Number(config?.weights?.[method] || 0), 0);
    }

    function isValidWeightTotal(config) {
      return Math.abs(getApplicableWeightTotal(config) - 1) <= 0.000001;
    }

    function renderWeightSummary(propertyType, propertyConfig) {
      const total = getApplicableWeightTotal(propertyConfig);
      const valid = Math.abs(total - 1) <= 0.000001;
      const methods = (propertyConfig.applicableMethods || []).map(method => methodLabels[method] || method).join(' + ');
      return `<div id="weightSummary-${escapeHtml(propertyType)}" class="weight-summary${valid ? '' : ' invalid'}"><div><strong>${(total * 100).toFixed(1)}%</strong><small>Approved methods: ${escapeHtml(methods)}</small></div><span>${valid ? 'Valid total' : 'Save blocked: total must equal 100%'}</span></div>`;
    }

    function updateWeightSummaries() {
      if (!activeConfig) return true;
      let allValid = true;
      for (const [propertyType, propertyConfig] of Object.entries(activeConfig.propertyTypes || {})) {
        const inputs = [...$('editor').querySelectorAll(`input[data-path^="propertyTypes.${propertyType}.weights."]`)];
        const total = (propertyConfig.applicableMethods || []).reduce((sum, method) => {
          const input = inputs.find(item => item.dataset.path.endsWith(`.${method}`));
          return sum + (input ? Number(input.value || 0) / 100 : 0);
        }, 0);
        const valid = Math.abs(total - 1) <= 0.000001;
        allValid = allValid && valid;
        const box = $(`weightSummary-${propertyType}`);
        if (box) {
          box.classList.toggle('invalid', !valid);
          box.querySelector('strong').textContent = `${(total * 100).toFixed(1)}%`;
          box.querySelector('span').textContent = valid ? 'Valid total' : 'Save blocked: total must equal 100%';
          const panel = $(`weightSummary-${propertyType}`).closest('details');
          const headerTotal = panel?.querySelector('.type-total');
          if (headerTotal) {
            headerTotal.textContent = `${(total * 100).toFixed(1)}%`;
            headerTotal.classList.toggle('invalid', !valid);
          }
        }
      }
      return allValid;
    }

    function renderEditor(config) {
      let html = '';
      for (const [propertyType, propertyConfig] of Object.entries(config.propertyTypes || {})) {
        const applicableMethods = propertyConfig.applicableMethods || [];
        const total = getApplicableWeightTotal(propertyConfig);
        const totalClass = Math.abs(total - 1) <= 0.000001 ? '' : ' invalid';
        html += `<details class="type-card" data-property-type="${escapeHtml(propertyType)}"><summary class="type-title"><span>${escapeHtml(propertyTypeLabels[propertyType] || propertyType)}</span><span class="type-summary-meta"><span class="panel-note">${escapeHtml(applicableMethods.map(method => methodLabels[method] || method).join(' · '))}</span><strong class="type-total${totalClass}">${(total * 100).toFixed(1)}%</strong></span></summary><div class="type-content">`;
        html += renderValuationMethods(propertyType, propertyConfig);
        html += renderValuationFactors(propertyType, propertyConfig);
        html += renderAdvancedCalibration(propertyType, propertyConfig);
        if (['apartment', 'villa', 'townhouse'].includes(propertyType)) html += renderShadowSection(propertyType, propertyConfig);
        html += '</div></details>';
      }
      html += renderGlobalFactors(config.gis);
      $('editor').innerHTML = html;
      const typePanels = [...$('editor').querySelectorAll('details[data-property-type]')];
      typePanels.forEach(panel => panel.addEventListener('toggle', () => {
        if (panel.open) typePanels.filter(other => other !== panel).forEach(other => { other.open = false; });
      }));
      if (typePanels[0]) typePanels[0].open = true;
      $('editor').querySelectorAll('input[data-path]').forEach(input => input.addEventListener('input', updateChangeSummary));
      $('saveButton').disabled = false;
      $('reloadButton').disabled = false;
      $('configMeta').textContent = `${config.configId} · updated ${formatDate(config.updatedAt)}`;
      updateChangeSummary();
    }

    function decodePath(input) { return input.dataset.path.split('.').map(segment => decodeURIComponent(segment)); }
    function inputConfigValue(input) {
      if (input.dataset.nullIfEmpty === 'true' && input.value.trim() === '') return null;
      const value = Number(input.value);
      return input.dataset.percent === 'true' ? value / 100 : value;
    }
    function valuesEqual(left, right) {
      if (left === null && (right === null || right === undefined)) return true;
      if (typeof right === 'boolean') return Boolean(Number(left)) === right;
      return Number.isFinite(Number(left)) && Number.isFinite(Number(right)) ? Number(left) === Number(right) : left === right;
    }

    function updateChangeSummary() {
      if (!activeConfig || !originalConfig) return;
      const changed = [...$('editor').querySelectorAll('input[data-path]')].filter(input => !valuesEqual(inputConfigValue(input), getAt(originalConfig, decodePath(input))));
      const total = $('editor').querySelectorAll('input[data-path]').length;
      const totalsValid = updateWeightSummaries();
      $('changeSummary').textContent = !totalsValid ? `${changed.length} of ${total} values changed. Save is blocked until every approved-method total equals 100%.` : changed.length ? `${changed.length} of ${total} numeric values changed. Save will activate a new version immediately.` : `No changes. ${total} numeric controls are loaded.`;
      $('changeSummary').className = `notice show ${totalsValid ? 'info' : 'error'}`;
      $('saveButton').disabled = !totalsValid;
    }

    function readEditedConfig() {
      const next = deepClone(activeConfig);
      for (const [propertyType, propertyConfig] of Object.entries(next.v21ShadowMultipliers?.propertyTypes || {})) {
        const keys = new Set([...$('editor').querySelectorAll(`input[data-project-multiplier="true"][data-project-key]`)].filter(input => input.dataset.path.includes(`.${encodeURIComponent(propertyType)}.`)).map(input => input.dataset.projectKey));
        for (const key of Object.keys(propertyConfig.projectBuilding?.projectMultipliers || {})) if (!keys.has(key)) delete propertyConfig.projectBuilding.projectMultipliers[key];
      }
      $('editor').querySelectorAll('input[data-path]').forEach(input => {
        const path = decodePath(input);
        const value = inputConfigValue(input);
        if (path[0] === 'v21ShadowMultipliers' && path[1] === 'enabled') setAt(next, path, Boolean(value));
        else if (path[0] === 'v21ShadowMultipliers' && path[3] === 'projectBuilding' && path[4] === 'defaultMultiplier') setAt(next, path, value);
        else if (path[0] === 'v21ShadowMultipliers' && path[4] === 'projectMultipliers') {
          if (input.dataset.projectMultiplier === 'true') setAt(next, [...path.slice(0, 5), decodeURIComponent(input.dataset.projectKey || '')], value);
        } else if (path[0] === 'v21ShadowMultipliers' && path[4] === 'bands') {
          setAt(next, path, value);
        } else setAt(next, path, value);
      });
      return next;
    }

    function addProjectMultiplierRow(propertyType) {
      const keyInput = $(`newProjectKey-${propertyType}`), valueInput = $(`newProjectValue-${propertyType}`), key = keyInput.value.trim().toLowerCase(), value = Number(valueInput.value);
      if (!key || !Number.isFinite(value) || value <= 0) { showNotice('Enter a project key and a positive multiplier.', 'error'); return; }
      const rows = $(`projectRows-${propertyType}`);
      if (rows.querySelector(`[data-project-key="${CSS.escape(key)}"]`)) { showNotice('That project key is already listed.', 'error'); return; }
      const wrapper = document.createElement('div'); wrapper.className = 'field-grid project-multiplier-row';
      wrapper.innerHTML = `<div class="field"><label>Project key (type | district | project)</label><input data-project-key-label="true" type="text" value="${escapeHtml(key)}" readonly></div><div class="field"><label>Multiplier</label><input data-path="${pathForV21(propertyType, 'projectBuilding', 'projectMultipliers', key)}" data-project-multiplier="true" data-project-key="${escapeHtml(key)}" type="number" min="0.01" step="0.001" value="${value}"></div><div class="field"><button type="button" class="secondary" data-action="remove-project-multiplier">Remove</button></div>`;
      rows.appendChild(wrapper); rows.querySelectorAll('input[data-path]').forEach(input => input.removeEventListener('input', updateChangeSummary)); rows.querySelectorAll('input[data-path]').forEach(input => input.addEventListener('input', updateChangeSummary));
      keyInput.value = ''; valueInput.value = '1'; updateChangeSummary();
    }
    function removeProjectMultiplierRow(button) { button.closest('.field-grid').remove(); updateChangeSummary(); }

    function renderHistory(history) {
      $('history').innerHTML = history?.length ? history.slice(0, 12).map(item => `<div class="history-item"><strong>${escapeHtml(item.configId)}</strong><span>${escapeHtml(formatDate(item.updatedAt))} · ${escapeHtml(item.updatedBy || 'admin')}</span></div>`).join('') : '<div class="small">No saved versions yet.</div>';
    }

    async function request(method='GET', body) {
      const headers = { 'Authorization': `Bearer ${token()}` };
      if (body) headers['Content-Type'] = 'application/json';
      const response = await fetch('/api/calibration-config?history=true', { method, headers, body: body ? JSON.stringify(body) : undefined });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
      return payload;
    }

    async function loadConfig() {
      if (!token()) { showNotice('Enter the administrator token first.', 'error'); return; }
      $('loadButton').disabled = true; setStatus('Authenticating…');
      try {
        const payload = await request();
        activeConfig = deepClone(payload.config); originalConfig = deepClone(payload.config);
        renderEditor(activeConfig); renderHistory(payload.history); setStatus(`Connected · ${activeConfig.configId}`); showNotice('Configuration loaded. Changes are editable below.', 'success');
      } catch (error) { setStatus('Not connected'); showNotice(error.message, 'error'); }
      finally { $('loadButton').disabled = false; }
    }

    async function saveConfig() {
      if (!activeConfig) return;
      const config = readEditedConfig();
      if (!Object.values(config.propertyTypes || {}).every(isValidWeightTotal)) {
        updateChangeSummary();
        return;
      }
      $('saveButton').disabled = true; setStatus('Saving…');
      try {
        const payload = await request('POST', { config });
        activeConfig = deepClone(payload.config); originalConfig = deepClone(payload.config); renderEditor(activeConfig);
        const historyPayload = await request(); renderHistory(historyPayload.history); setStatus(`Active · ${activeConfig.configId}`); showNotice('Saved and activated for new valuations.', 'success');
      } catch (error) { setStatus('Save failed'); showNotice(error.message, 'error'); }
      finally { $('saveButton').disabled = false; }
    }


    $('editor').addEventListener('click', event => {
      const removeButton = event.target.closest('[data-action="remove-project-multiplier"]');
      if (removeButton) {
        removeProjectMultiplierRow(removeButton);
        return;
      }
      const addButton = event.target.closest('[data-action="add-project-multiplier"]');
      if (addButton) addProjectMultiplierRow(addButton.dataset.propertyType);
    });
    $('loadButton').addEventListener('click', loadConfig);
    $('reloadButton').addEventListener('click', loadConfig);
    $('saveButton').addEventListener('click', saveConfig);
    $('adminToken').addEventListener('keydown', event => { if (event.key === 'Enter') loadConfig(); });