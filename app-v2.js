(function () {
  'use strict';

  const Core = window.DIEditorCore;
  const Property = window.DIPropertyModel;
  const Store = window.DIStorage;
  const Exporters = window.DIExporters;
  if (!Core || !Property || !Store || !Exporters) throw new Error('Domestic Intelligence modules did not load.');

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const LEGACY_KEY = 'domestic-intelligence-v01';
  const $ = selector => document.querySelector(selector);
  const el = {
    theme: $('#themeSelect'), themeColor: $('meta[name="theme-color"]'), reset: $('#resetButton'), connection: $('#connectionNote'),
    commission: $('#commissionView'), handover: $('#handoverView'), projectName: $('#projectName'),
    readiness: $('#homeReadiness'), modeHint: $('#modeHint'), undo: $('#undoButton'), redo: $('#redoButton'),
    toolbar: $('#editToolbar'), stage: $('#mapStage'), svg: $('#mapSvg'), gridLayer: $('#gridLayer'),
    wallLayer: $('#wallLayer'), pointLayer: $('#pointLayer'), handleLayer: $('#handleLayer'),
    mapEmpty: $('#mapEmpty'), mapHelp: $('#mapHelp'), selectionStatus: $('#selectionStatus'),
    layerControls: $('#layerControls'), showAll: $('#showAllLayers'), showAllInline: $('#showAllInline'),
    gridSize: $('#gridSize'), uploadPlan: $('#uploadPlanButton'), planInput: $('#planInput'), planCanvas: $('#planCanvas'),
    inspector: $('.inspector-card'), planInspector: $('#planInspector'), wallInspector: $('#wallInspector'), pointInspector: $('#pointInspector'),
    inspectorEmpty: $('#inspectorEmpty'), wallName: $('#wallName'), removeWall: $('#removeWall'),
    removePoint: $('#removePoint'), pointHeading: $('#pointHeading'), pointForm: $('#pointForm'),
    checkEditor: $('#checkEditor'), ipHelp: $('#ipHelp'), removePlan: $('#removePlan'), replacePlan: $('#replacePlan'),
    referenceButton: $('#desktopReferenceButton'), closeInspector: $('#closeInspector'),
    planScale: $('#planScale'), planRotation: $('#planRotation'), planOpacity: $('#planOpacity'),
    planX: $('#planX'), planY: $('#planY'), handoverStatus: $('#handoverStatus'),
    handoverRooms: $('#handoverRooms'), exportPdf: $('#exportPdf'), exportCsv: $('#exportCsv'),
    exportJson: $('#exportJson'), toast: $('#toast')
  };

  let history;
  let previewState = null;
  let selection = { type: 'point', id: null };
  let editorTool = 'select';
  let wallStart = null;
  let drag = null;
  let floorRecord = null;
  let planSource = null;
  let pendingReferenceWork = null;
  let saveTimer = null;
  let keyboardCursor = { x: 600, y: 400 };
  let referenceInspectorOpen = false;

  function placeEditorToolbar() {
    const desktopHost = document.querySelector('.workspace-controls');
    const mobileHost = document.querySelector('.map-card');
    const useDesktopHost = matchMedia('(min-width: 761px)').matches;
    const target = useDesktopHost ? desktopHost : mobileHost;
    if (!target || el.toolbar.parentElement === target) return;
    if (useDesktopHost) target.append(el.toolbar);
    else target.insertBefore(el.toolbar, el.stage);
  }

  function state() { return previewState || history.present; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
  function slug(value) { return String(value || 'domestic-intelligence').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'domestic-intelligence'; }
  function flash(message) { el.toast.textContent = message; el.toast.classList.add('show'); clearTimeout(flash.timer); flash.timer = setTimeout(() => el.toast.classList.remove('show'), 2200); }
  function labelStatus(status) { return status === 'ready' ? 'Ready' : status === 'attention' ? 'Needs attention' : status === 'empty' ? 'No devices' : 'Not tested'; }
  function propertyLabel(current = state()) { return current.home.address || current.home.name; }
  function setFormValue(elements, name, value) { if (elements[name]) elements[name].value = value == null ? '' : String(value); }

  const RICH_FIELD_VALIDATORS = Object.freeze({
    networkAddress: control => Core.isValidNetworkAddress(control.value) ? '' : 'Enter a valid IPv4, IPv6 or hostname, or leave blank.',
    macAddress: control => Core.isValidMacAddress(control.value) ? '' : 'Enter a valid MAC address or leave blank.',
    installationDate: control => !control.value || Core.isValidDate(control.value) ? '' : 'Enter a valid installation date.',
    warrantyDate: control => !control.value || Core.isValidDate(control.value) ? '' : 'Enter a valid warranty date.',
    lastTestedDate: control => !control.value || Core.isValidDate(control.value) ? '' : 'Enter a valid last-tested date.'
  });

  function fieldErrorId(name) { return `point-${name}-error`; }

  function clearFieldError(control) {
    if (!control) return;
    const errorId = fieldErrorId(control.name);
    document.getElementById(errorId)?.remove();
    control.removeAttribute('aria-invalid');
    const describedBy = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== errorId);
    if (describedBy.length) control.setAttribute('aria-describedby', describedBy.join(' '));
    else control.removeAttribute('aria-describedby');
  }

  function setFieldError(control, message) {
    clearFieldError(control);
    if (!message) return;
    const error = document.createElement('small');
    error.id = fieldErrorId(control.name);
    error.className = 'field-error';
    error.setAttribute('aria-live', 'polite');
    error.textContent = message;
    control.insertAdjacentElement('afterend', error);
    control.setAttribute('aria-invalid', 'true');
    const describedBy = new Set((control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    describedBy.add(error.id);
    control.setAttribute('aria-describedby', [...describedBy].join(' '));
  }

  function validateRichPointFields() {
    const invalid = [];
    Object.entries(RICH_FIELD_VALIDATORS).forEach(([name, validator]) => {
      const control = el.pointForm.elements[name];
      if (!control) return;
      const message = control.validity?.badInput ? 'Enter a valid value.' : validator(control);
      setFieldError(control, message);
      if (message) invalid.push(control);
    });
    if (invalid.length) {
      invalid[0].focus();
      flash(`Review ${invalid.length === 1 ? 'the highlighted field' : `${invalid.length} highlighted fields`} and try again.`);
      return false;
    }
    return true;
  }

  async function loadInitialState() {
    let saved = await Store.loadState();
    if (!saved) {
      try {
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) saved = JSON.parse(legacy);
      } catch (_) { /* malformed legacy data falls through */ }
    }
    let normalised = { ...Core.normaliseState(saved), workspaceMode: 'view' };
    floorRecord = await Store.loadFloorPlan();
    const metadata = normalised.map.floorplan;
    if (metadata && (!floorRecord || floorRecord.name !== metadata.name)) {
      const restoredPlan = floorRecord ? {
        name: floorRecord.name,
        type: floorRecord.type,
        transform: floorRecord.transform || { x: 0, y: 0, scale: 100, rotation: 0, opacity: 60 }
      } : null;
      normalised = { ...normalised, map: { ...normalised.map, floorplan: restoredPlan } };
      await Store.saveState(normalised).catch(() => null);
    } else if (!metadata && floorRecord) {
      await Store.removeFloorPlan().catch(() => null);
      floorRecord = null;
    }
    history = Core.createHistory(normalised, 80);
    selection.id = normalised.selected && normalised.selected.pointId || null;
    el.gridSize.value = String(normalised.map.gridSize);
    if (floorRecord) await prepareFloorPlan(floorRecord);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      try { await Store.saveState(history.present); }
      catch (error) { showConnection(error.message); }
    }, 120);
  }

  function cancelScheduledSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  async function flushScheduledSave() {
    if (saveTimer == null) return false;
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      await Store.saveState(history.present);
      return true;
    } catch (error) {
      showConnection(error.message);
      throw error;
    }
  }

  function trackReferenceWork(work) {
    const tracked = Promise.resolve(work).finally(() => {
      if (pendingReferenceWork === tracked) pendingReferenceWork = null;
    });
    pendingReferenceWork = tracked;
    return tracked;
  }

  async function flushPendingWork() {
    if (pendingReferenceWork) await pendingReferenceWork;
    return flushScheduledSave();
  }

  function replaceRuntimeState(next) {
    cancelScheduledSave();
    const normalised = Core.normaliseState(next);
    history = Core.createHistory(normalised, 80);
    previewState = null;
    selection = {
      type: normalised.selected?.wallId ? 'wall' : 'point',
      id: normalised.selected?.wallId || normalised.selected?.pointId || null
    };
    editorTool = 'select';
    wallStart = null;
    drag = null;
    render();
  }

  function commit(next, message) {
    previewState = null;
    history = Core.commitHistory(history, next);
    scheduleSave();
    render();
    if (message) flash(message);
  }

  function replacePresent(next) {
    history = { ...history, present: Core.normaliseState(next) };
    scheduleSave();
    render();
  }

  function updateView(view) { replacePresent({ ...state(), view }); }
  function updateWorkspaceMode(workspaceMode) {
    editorTool = 'select'; wallStart = null;
    const fitted = Core.setMapViewport(state(), { x: 0, y: 0, zoom: 1 });
    replacePresent({ ...fitted, workspaceMode });
  }

  function requireEditMode(action = 'change the spatial record') {
    if (state().workspaceMode === 'edit') return true;
    flash(`Switch to Edit map to ${action}.`);
    document.querySelector('[data-editor-mode="edit"]')?.focus();
    return false;
  }

  function render() {
    const current = state();
    placeEditorToolbar();
    document.querySelectorAll('.mode-tab').forEach(button => {
      const active = button.dataset.view === current.view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    el.commission.hidden = current.view !== 'commission';
    el.handover.hidden = current.view !== 'handover';
    document.querySelectorAll('[data-editor-mode]').forEach(button => {
      const active = button.dataset.editorMode === current.workspaceMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const editing = current.workspaceMode === 'edit';
    el.toolbar.hidden = !editing;
    el.stage.classList.toggle('editing', editing);
    el.modeHint.textContent = editing ? 'Edit mode: drag devices and walls; round handles resize selected walls.' : 'View mode prevents accidental map changes.';
    el.undo.disabled = !editing || !history.past.length;
    el.redo.disabled = !editing || !history.future.length;
    el.uploadPlan.disabled = !editing;
    el.gridSize.disabled = !editing;
    el.projectName.textContent = propertyLabel(current);
    renderSummary(); renderLayers(); renderMap(); renderInspector(); renderHandover();
    window.dispatchEvent(new CustomEvent('di:render', { detail: { state: clone(current), selection: { ...selection } } }));
  }

  function renderSummary() {
    const summary = Property.getPropertyReadiness(state());
    const percent = summary.totalChecks ? Math.round(summary.passedChecks / summary.totalChecks * 100) : 0;
    el.readiness.innerHTML = `<strong>${percent}% checked</strong><span>${labelStatus(summary.status)} · ${summary.passedChecks}/${summary.totalChecks} checks passed · ${summary.devices} devices</span>`;
  }

  function renderLayers() {
    const layers = state().map.layers;
    const labels = { floorplan: 'Reference plan', walls: 'Walls / structure', openings: 'Doors / windows', roomLabels: 'Room labels', devices: 'Devices', status: 'Commissioning status', deviceLabels: 'Device labels', labels: 'Device labels', network: 'Network groupings' };
    el.layerControls.innerHTML = Object.keys(Core.DEFAULT_LAYERS).map(key => `<label class="layer-toggle"><input type="checkbox" data-layer="${key}" ${layers[key] ? 'checked' : ''}><span>${labels[key] || key}</span></label>`).join('');
    el.planCanvas.style.display = layers.floorplan && floorRecord ? '' : 'none';
  }

  function svgNode(name, attrs = {}, text) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text != null) node.textContent = text;
    return node;
  }

  function renderMap() {
    const current = state(), layers = current.map.layers;
    el.gridLayer.replaceChildren(); el.wallLayer.replaceChildren(); el.pointLayer.replaceChildren(); el.handleLayer.replaceChildren();
    el.stage.style.backgroundSize = `${current.map.gridSize / current.map.width * 100}% ${current.map.gridSize / current.map.height * 100}%`;
    if (layers.walls) current.map.walls.forEach((wall, index) => {
      const hit = svgNode('line', { class: 'wall-hit', x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2, 'data-wall': wall.id, tabindex: 0, role: 'button', 'aria-label': `Wall ${index + 1}` });
      const line = svgNode('line', { class: `wall${selection.type === 'wall' && selection.id === wall.id ? ' selected' : ''}`, x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2, 'data-wall': wall.id, 'pointer-events': 'none' });
      el.wallLayer.append(hit, line);
      if (layers.labels || layers.deviceLabels) el.wallLayer.append(svgNode('text', { class: 'wall-label', 'data-wall-label': wall.id, x: (wall.x1 + wall.x2) / 2 + 8, y: (wall.y1 + wall.y2) / 2 - 8 }, `W${index + 1}`));
    });
    if (layers.devices) current.map.points.forEach(point => {
      const status = Core.deriveDeviceReadiness(point);
      const group = svgNode('g', { class: `device-point ${layers.status ? status : ''}${selection.type === 'point' && selection.id === point.id ? ' selected' : ''}`, transform: `translate(${point.x} ${point.y})`, 'data-point': point.id, tabindex: 0, role: 'button', 'aria-label': `${point.name}, ${labelStatus(status)}` });
      group.append(svgNode('circle', { class: 'pin-hit', r: 25 }), svgNode('circle', { class: 'pin-body', r: 25 }), svgNode('circle', { class: 'pin-core', r: 8 }));
      if (layers.labels || layers.deviceLabels) {
        const labelOnRight = point.x < current.map.width * 0.68;
        group.append(svgNode('text', { x: labelOnRight ? 34 : -34, y: 6, 'text-anchor': labelOnRight ? 'start' : 'end' }, point.name));
      }
      el.pointLayer.append(group);
    });
    const selectedWall = selection.type === 'wall' && current.map.walls.find(wall => wall.id === selection.id);
    if (selectedWall && current.workspaceMode === 'edit' && layers.walls) {
      el.handleLayer.append(svgNode('circle', { class: 'handle-hit', cx: selectedWall.x1, cy: selectedWall.y1, r: 15, 'data-handle': 'start', 'data-wall': selectedWall.id, tabindex: 0, role: 'button', 'aria-label': 'Move wall start' }), svgNode('circle', { class: 'handle', cx: selectedWall.x1, cy: selectedWall.y1, r: 15, 'data-handle': 'start', 'data-wall': selectedWall.id }));
      el.handleLayer.append(svgNode('circle', { class: 'handle-hit', cx: selectedWall.x2, cy: selectedWall.y2, r: 15, 'data-handle': 'end', 'data-wall': selectedWall.id, tabindex: 0, role: 'button', 'aria-label': 'Move wall end' }), svgNode('circle', { class: 'handle', cx: selectedWall.x2, cy: selectedWall.y2, r: 15, 'data-handle': 'end', 'data-wall': selectedWall.id }));
    }
    if (selectedWall) {
      const pixels = Math.hypot(selectedWall.x2 - selectedWall.x1, selectedWall.y2 - selectedWall.y1);
      let length = `${Math.round(pixels * 100) / 100} map units`;
      try { length = `${Math.round(Core.pixelsToCalibratedUnits(current.map, pixels) * 100) / 100} ${current.map.calibration.unit}`; } catch (_) {}
      el.handleLayer.append(svgNode('text', { class: 'dimension-label', x: (selectedWall.x1 + selectedWall.x2) / 2 + 12, y: (selectedWall.y1 + selectedWall.y2) / 2 - 12 }, length));
    }
    if (drag?.guides?.x) el.handleLayer.append(svgNode('line', { class: 'alignment-guide', x1: drag.guides.x.value, y1: 0, x2: drag.guides.x.value, y2: current.map.height }));
    if (drag?.guides?.y) el.handleLayer.append(svgNode('line', { class: 'alignment-guide', x1: 0, y1: drag.guides.y.value, x2: current.map.width, y2: drag.guides.y.value }));
    if (current.workspaceMode === 'edit' && (editorTool === 'wall' || editorTool === 'point')) el.handleLayer.append(svgNode('circle', { class: 'keyboard-cursor', cx: keyboardCursor.x, cy: keyboardCursor.y, r: 18 }));
    const nothingVisible = !layers.walls && !layers.devices && (!layers.floorplan || !floorRecord);
    el.mapEmpty.hidden = !nothingVisible;
    el.selectionStatus.textContent = selection.id ? `${selection.type === 'point' ? 'Device' : 'Wall'} selected` : 'Nothing selected';
    el.mapHelp.textContent = wallStart ? 'Choose the second wall endpoint. Keyboard: use arrow keys, then Enter.' : current.workspaceMode === 'edit' && (editorTool === 'wall' || editorTool === 'point') ? 'Tap the plan, or focus it and use arrow keys then Enter.' : current.workspaceMode === 'edit' ? 'Select and drag, or choose a tool to add an item.' : 'Select a device point to inspect commissioning details.';
    document.querySelectorAll('[data-tool]').forEach(button => {
      const active = button.dataset.tool === editorTool;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    renderPlanCanvas();
  }

  function renderInspector() {
    const current = state();
    const point = current.map.layers.devices && selection.type === 'point' && current.map.points.find(item => item.id === selection.id);
    const wall = current.map.layers.walls && selection.type === 'wall' && current.map.walls.find(item => item.id === selection.id);
    const hasPlan = Boolean(current.map.layers.floorplan && current.map.floorplan && floorRecord);
    const showPlan = Boolean(hasPlan && referenceInspectorOpen && !point && !wall);
    el.planInspector.hidden = !showPlan;
    el.pointInspector.hidden = !point;
    el.wallInspector.hidden = !wall;
    el.inspectorEmpty.hidden = true;
    el.inspector.dataset.context = point ? 'device' : wall ? 'wall' : showPlan ? 'reference' : 'none';
    el.commission.dataset.hasPlan = String(hasPlan);
    if (wall) el.wallName.textContent = `Wall ${current.map.walls.indexOf(wall) + 1}`;
    if (point) {
      el.pointHeading.textContent = point.name;
      const readiness = Core.deriveDeviceReadiness(point);
      const passedChecks = point.checks.filter(check => check.status === 'pass').length;
      const navTitle = $('#mobilePointNavTitle');
      if (navTitle) navTitle.textContent = point.name;
      const snapshotLocation = $('#pointSnapshotLocation');
      const snapshotChecks = $('#pointSnapshotChecks');
      if (snapshotLocation) snapshotLocation.textContent = `${current.rooms.find(room => room.id === point.roomId)?.name || 'Unassigned room'} · ${point.category || 'Device'}`;
      if (snapshotChecks) snapshotChecks.textContent = `${labelStatus(readiness)} · ${passedChecks}/${point.checks.length} checks`;
      const form = el.pointForm.elements;
      form.name.value = point.name;
      form.room.innerHTML = current.rooms.map(room => `<option value="${escapeHtml(room.id)}">${escapeHtml(room.name)}</option>`).join('');
      form.room.value = point.roomId || current.rooms[0].id;
      if ([...form.category.options].some(option => option.value === point.category)) form.category.value = point.category; else form.category.value = 'Other';
      ['brand','model','serialNumber','assetReference','protocol','networkAddress','macAddress','networkLabel','controllerReference','portReference','installationDate','installerBusiness','circuitReference','physicalLocationNotes','warrantyDate','firmwareVersion','lastTestedDate','issuesActions','maintenanceNotes','homeownerNotes','installerNotes'].forEach(name => setFormValue(form, name, point[name]));
      setFormValue(form, 'networkAddress', point.networkAddress || point.ipAddress);
      setFormValue(form, 'installerNotes', point.installerNotes || point.notes);
      el.checkEditor.innerHTML = point.checks.map((check, index) => `<div class="check-editor-row"><span>${escapeHtml(check.name)}</span><select data-check-index="${index}" aria-label="${escapeHtml(check.name)} status"><option value="pending" ${check.status === 'pending' ? 'selected' : ''}>Not tested</option><option value="pass" ${check.status === 'pass' ? 'selected' : ''}>Passed</option><option value="fix" ${check.status === 'fix' ? 'selected' : ''}>Needs fix</option></select></div>`).join('') || '<p class="muted compact">No acceptance checks recorded.</p>';
    }
    if (hasPlan) {
      const transform = current.map.floorplan.transform;
      el.planScale.value = transform.scale; el.planRotation.value = transform.rotation; el.planOpacity.value = transform.opacity;
      el.planX.value = transform.x; el.planY.value = transform.y;
    }
    const editing = current.workspaceMode === 'edit';
    const planLocked = Boolean(current.map.layerLocks?.floorplan);
    [el.planScale, el.planRotation, el.planOpacity, el.planX, el.planY].forEach(control => { control.disabled = !editing || planLocked; });
    el.removePlan.disabled = !editing || planLocked;
    el.removeWall.disabled = !editing || Boolean(current.map.layerLocks?.walls);
    el.removePoint.disabled = !editing || Boolean(current.map.layerLocks?.devices);
  }

  function exportShape() {
    return Property.toExportShape(state());
  }

  function renderHandover() {
    const current = Property.syncActiveFloor(state()), summary = Property.getPropertyReadiness(current), status = summary.status;
    const remaining = summary.totalChecks - summary.passedChecks;
    const handoverDetail = status === 'ready' ? 'All recorded acceptance checks have passed.' : summary.devices === 0 ? 'Add at least one device before handover.' : `${remaining} ${remaining === 1 ? 'check' : 'checks'} still need testing or attention.`;
    el.handoverStatus.className = `handover-status${status === 'ready' ? ' ready' : ''}`;
    el.handoverStatus.innerHTML = `<strong>${status === 'ready' ? 'Ready to hand over' : 'Handover not ready yet'}</strong><br>${handoverDetail}`;
    el.handoverRooms.innerHTML = current.home.floors.map(floor => {
      const points = floor.map.points || [];
      const statuses = points.map(Core.deriveDeviceReadiness);
      const floorStatus = statuses.includes('attention') ? 'attention' : !statuses.length ? 'empty' : statuses.includes('pending') ? 'pending' : 'ready';
      return `<section class="handover-room"><div class="section-heading"><h2>${escapeHtml(floor.name)}</h2><span class="status-pill">${labelStatus(floorStatus)}</span></div>${points.length ? points.map(point => {
        const room = current.rooms.find(item => item.id === point.roomId);
        return `<div class="handover-device"><strong>${escapeHtml(point.name)}</strong><span>${labelStatus(Core.deriveDeviceReadiness(point))}</span><div class="muted">${escapeHtml([room?.name, [point.brand, point.model].filter(Boolean).join(' ') || point.category].filter(Boolean).join(' · '))}</div></div>`;
      }).join('') : '<p class="muted">No devices recorded on this storey.</p>'}</section>`;
    }).join('');
  }

  function mapPosition(event) {
    const matrix = document.querySelector('#atlasContent')?.getScreenCTM() || el.svg.getScreenCTM();
    if (matrix) {
      const point = el.svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
      const local = point.matrixTransform(matrix.inverse());
      return { x: Math.max(0, Math.min(state().map.width, local.x)), y: Math.max(0, Math.min(state().map.height, local.y)) };
    }
    const rect = el.svg.getBoundingClientRect();
    return { x: Math.max(0, Math.min(state().map.width, (event.clientX - rect.left) / rect.width * state().map.width)), y: Math.max(0, Math.min(state().map.height, (event.clientY - rect.top) / rect.height * state().map.height)) };
  }

  function focusSpatial(type, id, endpoint) {
    requestAnimationFrame(() => {
      const safeId = window.CSS && CSS.escape ? CSS.escape(id) : id;
      const selector = type === 'point' ? `[data-point="${safeId}"]` : endpoint ? `.handle-hit[data-wall="${safeId}"][data-handle="${endpoint}"]` : `.wall-hit[data-wall="${safeId}"]`;
      document.querySelector(selector)?.focus();
    });
  }

  function select(type, id, focusTarget) {
    selection = { type, id }; referenceInspectorOpen = false; wallStart = null; editorTool = 'select'; render();
    if (focusTarget) focusSpatial(type, id, focusTarget.endpoint);
  }

  function addPointAt(current, position) {
    if (current.map.layerLocks?.devices) { flash('Unlock the Devices layer before adding a point.'); return; }
    const roomId = current.rooms[0].id;
    const next = Core.addPoint(current, { roomId, ...position, name: 'New device', category: 'Other', checks: [{ name: 'Operation', status: 'pending' }, { name: 'State feedback', status: 'pending' }] });
    const id = next.map.points.at(-1).id; selection = { type: 'point', id }; commit(next, 'Device point added.');
  }

  function addWallAt(current, position) {
    if (current.map.layerLocks?.walls) { flash('Unlock the Walls layer before adding a wall.'); return; }
    if (!wallStart) { wallStart = Core.snapPoint(current, position); flash('Choose the second wall endpoint.'); renderMap(); return; }
    try { const next = Core.addWall(current, { x1: wallStart.x, y1: wallStart.y, x2: position.x, y2: position.y }); const id = next.map.walls.at(-1).id; wallStart = null; selection = { type: 'wall', id }; commit(next, 'Wall added.'); }
    catch (error) { flash(error.message); }
  }

  function onMapKeyDown(event) {
    const target = event.target.closest('[data-point],[data-wall]');
    if (!target) return;
    const type = target.dataset.point ? 'point' : 'wall', id = target.dataset.point || target.dataset.wall, endpoint = target.dataset.handle;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(type, id, { endpoint }); return; }
    if (state().workspaceMode !== 'edit' || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    if ((type === 'point' && state().map.layerLocks?.devices) || (type === 'wall' && state().map.layerLocks?.walls)) { flash(`Unlock the ${type === 'point' ? 'Devices' : 'Walls'} layer before moving it.`); return; }
    event.preventDefault();
    const step = event.shiftKey ? 1 : state().map.gridSize;
    const delta = { x: event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, y: event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0 };
    try {
      let next;
      if (type === 'point') {
        const point = state().map.points.find(item => item.id === id);
        next = Core.movePoint(state(), id, { x: point.x + delta.x, y: point.y + delta.y }, { snap: !event.shiftKey });
      } else if (endpoint) {
        const wall = state().map.walls.find(item => item.id === id), start = endpoint === 'start';
        next = Core.moveConnectedWallEndpoint(state(), id, endpoint, { x: (start ? wall.x1 : wall.x2) + delta.x, y: (start ? wall.y1 : wall.y2) + delta.y }, event.shiftKey ? { grid: false, endpoints: false } : {});
      } else next = Core.moveWall(state(), id, delta, event.shiftKey ? { grid: false, endpoints: false } : {});
      commit(next, type === 'point' ? 'Device moved.' : 'Wall updated.');
      focusSpatial(type, id, endpoint);
    } catch (error) { flash(error.message); }
  }

  function onStageKeyDown(event) {
    if (event.target !== el.stage || state().workspaceMode !== 'edit' || !['wall', 'point'].includes(editorTool)) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); const step = event.shiftKey ? 1 : state().map.gridSize;
      keyboardCursor = { x: Math.max(0, Math.min(state().map.width, keyboardCursor.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0))), y: Math.max(0, Math.min(state().map.height, keyboardCursor.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0))) };
      renderMap(); el.stage.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (editorTool === 'point') addPointAt(state(), keyboardCursor); else addWallAt(state(), keyboardCursor);
      el.stage.focus();
    }
  }

  function onPointerDown(event) {
    const current = state();
    const pointNode = event.target.closest('[data-point]');
    const wallNode = event.target.closest('[data-wall]');
    const handleNode = event.target.closest('[data-handle]');
    const position = mapPosition(event);
    const nearbyPoint = !pointNode && current.map.layers.devices ? current.map.points.map(point => ({ point, gap: Math.hypot(point.x - position.x, point.y - position.y) })).filter(item => item.gap <= 34 / Math.max(.25, current.map.viewport?.zoom || 1)).sort((a,b) => a.gap - b.gap)[0]?.point : null;
    const pointId = pointNode?.dataset.point || nearbyPoint?.id;
    if (pointId) {
      select('point', pointId);
      if (current.workspaceMode === 'edit' && !current.map.layerLocks?.devices) drag = { type: 'point', id: pointId, start: position, origin: history.present, pointerId: event.pointerId };
    } else if (wallNode) {
      select('wall', wallNode.dataset.wall);
      if (current.workspaceMode === 'edit' && !current.map.layerLocks?.walls) drag = { type: handleNode ? 'handle' : 'wall', endpoint: handleNode && handleNode.dataset.handle, id: wallNode.dataset.wall, start: position, origin: history.present, pointerId: event.pointerId };
    } else if (current.workspaceMode === 'edit' && editorTool === 'wall') {
      addWallAt(current, position);
    } else if (current.workspaceMode === 'edit' && editorTool === 'point') {
      addPointAt(current, position);
    } else if (!pointNode) { selection = { type: null, id: null }; render(); }
    if (drag) { el.svg.setPointerCapture(event.pointerId); event.preventDefault(); }
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const position = mapPosition(event);
    try {
      if (drag.type === 'point') { const aligned = Core.snapAlignedPoint(drag.origin, position, { excludePointId: drag.id }); drag.guides = aligned.guides; previewState = Core.movePoint(drag.origin, drag.id, aligned, { snap: false }); }
      if (drag.type === 'wall') previewState = Core.moveWall(drag.origin, drag.id, { x: position.x - drag.start.x, y: position.y - drag.start.y });
      if (drag.type === 'handle') { const aligned = Core.snapAlignedPoint(drag.origin, position, { excludeWallId: drag.id }); drag.guides = aligned.guides; previewState = Core.moveConnectedWallEndpoint(drag.origin, drag.id, drag.endpoint, aligned, { grid: false, endpoints: false }); }
      renderSpatialPreview();
    } catch (_) { /* ignore invalid zero-length preview */ }
  }

  function renderSpatialPreview() {
    if (!previewState || !drag) return;
    const safe = value => window.CSS && CSS.escape ? CSS.escape(value) : value;
    const updateWall = wall => {
      document.querySelectorAll(`[data-wall="${safe(wall.id)}"]`).forEach(node => {
        if (node.dataset.handle === 'start') { node.setAttribute('cx', wall.x1); node.setAttribute('cy', wall.y1); }
        else if (node.dataset.handle === 'end') { node.setAttribute('cx', wall.x2); node.setAttribute('cy', wall.y2); }
        else if (node.tagName === 'line') { node.setAttribute('x1', wall.x1); node.setAttribute('y1', wall.y1); node.setAttribute('x2', wall.x2); node.setAttribute('y2', wall.y2); }
      });
      const label = document.querySelector(`[data-wall-label="${safe(wall.id)}"]`);
      if (label) { label.setAttribute('x', (wall.x1 + wall.x2) / 2 + 8); label.setAttribute('y', (wall.y1 + wall.y2) / 2 - 8); }
    };
    if (drag.type === 'point') {
      const point = previewState.map.points.find(item => item.id === drag.id);
      const node = document.querySelector(`[data-point="${safe(drag.id)}"]`);
      if (point && node) node.setAttribute('transform', `translate(${point.x} ${point.y})`);
    } else {
      previewState.map.walls.forEach((wall, index) => {
        const before = drag.origin.map.walls[index];
        if (!before || wall.x1 !== before.x1 || wall.y1 !== before.y1 || wall.x2 !== before.x2 || wall.y2 !== before.y2) updateWall(wall);
      });
      const wall = previewState.map.walls.find(item => item.id === drag.id);
      const dimension = el.handleLayer.querySelector('.dimension-label');
      if (wall && dimension) {
        const pixels = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1); let length = `${Math.round(pixels * 100) / 100} map units`;
        try { length = `${Math.round(Core.pixelsToCalibratedUnits(previewState.map, pixels) * 100) / 100} ${previewState.map.calibration.unit}`; } catch (_) {}
        dimension.setAttribute('x', (wall.x1 + wall.x2) / 2 + 12); dimension.setAttribute('y', (wall.y1 + wall.y2) / 2 - 12); dimension.textContent = length;
      }
    }
    el.handleLayer.querySelectorAll('.alignment-guide').forEach(node => node.remove());
    if (drag.guides?.x) el.handleLayer.append(svgNode('line', { class: 'alignment-guide', x1: drag.guides.x.value, y1: 0, x2: drag.guides.x.value, y2: previewState.map.height }));
    if (drag.guides?.y) el.handleLayer.append(svgNode('line', { class: 'alignment-guide', x1: 0, y1: drag.guides.y.value, x2: previewState.map.width, y2: drag.guides.y.value }));
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (previewState) commit(previewState, drag.type === 'point' ? 'Device moved.' : 'Wall updated.');
    previewState = null; drag = null;
    try { el.svg.releasePointerCapture(event.pointerId); } catch (_) { /* already released */ }
  }

  function onPointerCancel(event) {
    if (!drag) return;
    previewState = null; drag = null; render();
    try { el.svg.releasePointerCapture(event.pointerId); } catch (_) { /* already released */ }
  }

  function planMetadata(record) {
    const current = state();
    return current.map.floorplan || { name: record.name || 'Floor plan', type: record.type, transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 60 } };
  }

  async function decodeFloorPlan(record) {
    if (!record) throw new Error('No floor plan was provided.');
    const source = record.blob || record.dataUrl;
    const type = record.type || record.blob && record.blob.type || '';
    if (type === 'application/pdf') {
      const pdfjs = await import('./vendor/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', location.href).href;
      const data = record.blob ? await record.blob.arrayBuffer() : await fetch(record.dataUrl).then(response => response.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data }).promise;
      if (pdf.numPages !== 1) throw new Error('Use a single-page PDF floor plan.');
      const page = await pdf.getPage(1), viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return canvas;
    }
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    try {
      const image = new Image(); image.decoding = 'async'; image.src = url; await image.decode();
      return image;
    } finally {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
    }
  }

  async function prepareFloorPlan(record) {
    if (!record) { planSource = null; renderPlanCanvas(); return false; }
    try {
      const decoded = await decodeFloorPlan(record);
      planSource = decoded;
      renderPlanCanvas();
      return true;
    } catch (error) { flash(error.message); return false; }
  }

  function renderPlanCanvas() {
    const canvas = el.planCanvas, context = canvas.getContext('2d');
    const landscape = el.stage.dataset.atlasOrientation === 'landscape';
    const logicalWidth = state().map.width, logicalHeight = state().map.height;
    const targetWidth = landscape ? logicalHeight : logicalWidth;
    const targetHeight = landscape ? logicalWidth : logicalHeight;
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const current = state();
    if (!planSource || !current.map.floorplan || !current.map.layers.floorplan) return;
    const transform = current.map.floorplan.transform;
    const fit = Math.min(logicalWidth * 0.94 / planSource.width, logicalHeight * 0.94 / planSource.height);
    const width = planSource.width * fit * transform.scale / 100;
    const height = planSource.height * fit * transform.scale / 100;
    context.save();
    if (landscape) { context.translate(logicalHeight, 0); context.rotate(Math.PI / 2); }
    context.globalAlpha = transform.opacity / 100;
    context.translate(logicalWidth / 2 + transform.x, logicalHeight / 2 + transform.y);
    context.rotate(transform.rotation * Math.PI / 180);
    context.drawImage(planSource, -width / 2, -height / 2, width, height); context.restore();
  }

  function updatePlanTransform() {
    const current = state(); if (!current.map.floorplan) return;
    if (!requireEditMode('transform the reference plan')) { previewState = null; renderInspector(); renderPlanCanvas(); return; }
    if (current.map.layerLocks?.floorplan) { flash('Unlock the Reference plan layer before changing its transform.'); renderInspector(); return; }
    const transform = { x: Number(el.planX.value) || 0, y: Number(el.planY.value) || 0, scale: Number(el.planScale.value), rotation: Number(el.planRotation.value), opacity: Number(el.planOpacity.value) };
    commit({ ...current, map: { ...current.map, floorplan: { ...current.map.floorplan, transform } } });
  }

  function showConnection(message) { el.connection.textContent = message; el.connection.hidden = !message; }
  function showUpdateAvailable() {
    el.connection.replaceChildren();
    const text = document.createElement('span'); text.textContent = 'A Domestic Intelligence update is ready. ';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet-action'; button.textContent = 'Reload now';
    button.addEventListener('click', () => location.reload()); el.connection.append(text, button); el.connection.hidden = false;
  }
  function applyTheme() {
    document.documentElement.removeAttribute('data-theme');
    if (el.theme) el.theme.value = 'system';
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    el.themeColor.content = dark ? '#100A1F' : '#F1F4FA';
  }

  function bindEvents() {
    document.querySelectorAll('.mode-tab').forEach(button => button.addEventListener('click', () => updateView(button.dataset.view)));
    document.querySelectorAll('[data-editor-mode]').forEach(button => button.addEventListener('click', () => updateWorkspaceMode(button.dataset.editorMode)));
    document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', event => { editorTool = button.dataset.tool; wallStart = null; renderMap(); if (!event.detail) el.stage.focus(); }));
    el.undo.addEventListener('click', () => { if (!requireEditMode('undo a map change')) return; history = Core.undoHistory(history); previewState = null; scheduleSave(); render(); flash('Undid the last map change.'); });
    el.redo.addEventListener('click', () => { if (!requireEditMode('redo a map change')) return; history = Core.redoHistory(history); previewState = null; scheduleSave(); render(); flash('Redid the map change.'); });
    el.layerControls.addEventListener('change', event => {
      const input = event.target.closest('[data-layer]'); if (!input) return;
      if (!input.checked && ((input.dataset.layer === 'devices' && selection.type === 'point') || (input.dataset.layer === 'walls' && selection.type === 'wall'))) selection = { type: null, id: null };
      commit(Core.setLayerVisibility(state(), input.dataset.layer, input.checked), `${input.parentElement.innerText.trim()} layer ${input.checked ? 'shown' : 'hidden'}.`);
    });
    [el.showAll, el.showAllInline].forEach(button => button.addEventListener('click', () => { const shown = Core.showAllLayers(state()); commit({ ...shown, map: { ...shown.map, layerLocks: Object.fromEntries(Object.keys(Core.DEFAULT_LAYERS).map(key => [key, false])) } }, 'All layers shown and unlocked.'); }));
    el.gridSize.addEventListener('change', () => { if (!requireEditMode('change the editing grid')) return; commit({ ...state(), map: { ...state().map, gridSize: Number(el.gridSize.value) } }, 'Grid updated.'); });
    const openReference = () => {
      if (!requireEditMode('configure the reference plan')) return;
      selection = { type: null, id: null };
      referenceInspectorOpen = Boolean(state().map.floorplan && floorRecord);
      render();
      if (!referenceInspectorOpen) el.planInput.click();
    };
    el.uploadPlan.addEventListener('click', () => { if (requireEditMode('upload a reference plan')) { selection = { type: null, id: null }; referenceInspectorOpen = true; el.planInput.click(); } });
    el.referenceButton.addEventListener('click', openReference);
    el.replacePlan.addEventListener('click', () => { if (requireEditMode('replace the reference plan')) { selection = { type: null, id: null }; referenceInspectorOpen = true; el.planInput.click(); } });
    el.closeInspector.addEventListener('click', () => { referenceInspectorOpen = false; selection = { type: null, id: null }; render(); el.stage.focus(); });
    el.svg.addEventListener('pointerdown', onPointerDown); el.svg.addEventListener('pointermove', onPointerMove); el.svg.addEventListener('pointerup', onPointerUp); el.svg.addEventListener('pointercancel', onPointerCancel); el.svg.addEventListener('lostpointercapture', onPointerCancel);
    el.svg.addEventListener('keydown', onMapKeyDown); el.stage.addEventListener('keydown', onStageKeyDown);
    el.pointForm.addEventListener('submit', event => {
      event.preventDefault(); const point = state().map.points.find(item => item.id === selection.id); if (!point) return;
      if (!validateRichPointFields()) return;
      const data = new FormData(el.pointForm);
      const room = state().rooms.find(item => item.id === data.get('room')) || state().rooms.find(item => item.id === point.roomId) || state().rooms[0];
      const networkAddress = String(data.get('networkAddress') || '').trim();
      el.ipHelp.textContent = 'Optional. Installer export only.'; el.pointForm.elements.networkAddress.removeAttribute('aria-invalid');
      const checks = point.checks.map((check, index) => ({ ...check, status: el.checkEditor.querySelector(`[data-check-index="${index}"]`).value }));
      const fields = ['brand','model','serialNumber','assetReference','protocol','macAddress','networkLabel','controllerReference','portReference','installationDate','installerBusiness','circuitReference','physicalLocationNotes','warrantyDate','firmwareVersion','lastTestedDate','issuesActions','maintenanceNotes','homeownerNotes','installerNotes'];
      const patch = { name: String(data.get('name')).trim(), roomId: room.id, category: data.get('category'), networkAddress, ipAddress: networkAddress, checks };
      fields.forEach(name => { patch[name] = String(data.get(name) || '').trim(); });
      if (!patch.protocol) patch.protocol = 'Other';
      patch.notes = patch.installerNotes;
      try { commit(Core.updatePoint(state(), point.id, patch), 'Device record saved.'); }
      catch (error) { flash(error.message); }
    });
    el.pointForm.addEventListener('input', event => {
      const control = event.target.closest('[name]');
      const validator = control && RICH_FIELD_VALIDATORS[control.name];
      if (!validator || !document.getElementById(fieldErrorId(control.name))) return;
      const message = control.validity?.badInput ? 'Enter a valid value.' : validator(control);
      if (!message) clearFieldError(control);
    });
    el.removePoint.addEventListener('click', () => { if (!requireEditMode('remove a device point')) return; if (state().map.layerLocks?.devices) { flash('Unlock the Devices layer before removing a point.'); return; } if (!selection.id || !confirm('Remove this device point? You can still use Undo immediately afterwards.')) return; commit(Core.removePoint(state(), selection.id), 'Device point removed.'); selection = { type: null, id: null }; render(); });
    el.removeWall.addEventListener('click', () => { if (!requireEditMode('remove a wall')) return; if (state().map.layerLocks?.walls) { flash('Unlock the Walls layer before removing a wall.'); return; } if (!selection.id) return; commit(Core.removeWall(state(), selection.id), 'Wall removed.'); selection = { type: null, id: null }; render(); });
    el.planInput.addEventListener('change', async () => {
      if (!requireEditMode('upload a reference plan')) { el.planInput.value = ''; return; }
      const file = el.planInput.files[0]; const validation = Store.validateFloorPlan(file);
      if (!validation.ok) { flash(validation.error); el.planInput.value = ''; return; }
      selection = { type: null, id: null };
      referenceInspectorOpen = true;
      await trackReferenceWork((async () => {
        const previousState = state();
        try {
          const metadata = { name: file.name, transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 60 } };
          const decoded = await decodeFloorPlan({ name: file.name, type: validation.type, blob: file });
          await flushScheduledSave();
          const nextState = { ...state(), map: { ...state().map, floorplan: { name: file.name, type: validation.type, transform: metadata.transform } } };
          await Store.saveState(nextState);
          const saved = await Store.saveFloorPlan(file, metadata);
          floorRecord = { ...(saved.metadata || metadata), name: file.name, type: validation.type, blob: file }; planSource = decoded;
          referenceInspectorOpen = true;
          commit(nextState, saved.warning || 'Floor plan stored locally.');
          cancelScheduledSave();
        } catch (error) {
          await Store.saveState(previousState).catch(() => null);
          flash(error.message);
        }
      })());
      el.planInput.value = '';
    });
    [el.planScale, el.planRotation, el.planOpacity, el.planX, el.planY].forEach(input => input.addEventListener('change', updatePlanTransform));
    [el.planScale, el.planRotation, el.planOpacity].forEach(input => input.addEventListener('input', () => {
      const current = history.present; if (!current.map.floorplan) return;
      if (current.workspaceMode !== 'edit' || current.map.layerLocks?.floorplan) { previewState = null; renderInspector(); renderPlanCanvas(); return; }
      const key = input === el.planScale ? 'scale' : input === el.planRotation ? 'rotation' : 'opacity';
      previewState = { ...current, map: { ...current.map, floorplan: { ...current.map.floorplan, transform: { ...current.map.floorplan.transform, [key]: Number(input.value) } } } };
      renderPlanCanvas();
    }));
    el.removePlan.addEventListener('click', async () => {
      if (!requireEditMode('remove the reference plan')) return;
      if (state().map.layerLocks?.floorplan) { flash('Unlock the Reference plan layer before removing it.'); return; }
      if (!confirm('Remove the locally stored floor-plan background?')) return;
      try { await Store.removeFloorPlan(); floorRecord = null; planSource = null; commit({ ...state(), map: { ...state().map, floorplan: null } }, 'Floor plan removed.'); }
      catch (error) { flash(`Floor plan was not removed: ${error.message}`); }
    });
    el.exportPdf.addEventListener('click', () => { Exporters.downloadBlob(Exporters.createHomeownerPdf(exportShape()), `${slug(propertyLabel())}-handover.pdf`); flash('Homeowner PDF downloaded.'); });
    el.exportCsv.addEventListener('click', () => { Exporters.downloadBlob(Exporters.createInstallerCsvBlob(exportShape()), `${slug(propertyLabel())}-installer.csv`); flash('Installer CSV downloaded.'); });
    el.exportJson.addEventListener('click', () => { Exporters.downloadBlob(Exporters.createInstallerJsonBlob(exportShape()), `${slug(propertyLabel())}-installer.json`); flash('Installer JSON downloaded.'); });
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
    el.reset.addEventListener('click', async () => {
      if (!confirm('Reset all local v0.2 changes, imported plans and device details?')) return;
      try { await Store.clearAll(); floorRecord = null; planSource = null; history = Core.createHistory(Core.createInitialState(), 80); selection = { type: 'point', id: history.present.map.points[0].id }; render(); scheduleSave(); flash('Synthetic demo restored.'); }
      catch (error) { flash(`Reset could not be completed: ${error.message}`); }
    });
    window.addEventListener('online', () => { showConnection(''); flash('Back online. Local changes are preserved.'); });
    window.addEventListener('offline', () => showConnection('Offline mode — the cached editor remains available and changes stay on this browser.'));
    window.addEventListener('resize', placeEditorToolbar);
  }

  async function init() {
    applyTheme(); await loadInitialState(); bindEvents(); render();
    window.DIAppBridge = Object.freeze({
      getState: () => clone(history.present),
      getSelection: () => ({ ...selection }),
      requireEditMode,
      cancelScheduledSave,
      flushScheduledSave,
      flushPendingWork,
      redrawPlan: renderPlanCanvas,
      replaceRuntimeState,
      commitState: (next, message) => commit(next, message),
      selectSpatial: (type, id, focusTarget) => select(type, id, focusTarget),
      notify: flash,
      refresh: render
    });
    window.dispatchEvent(new CustomEvent('di:app-state-ready'));
    if (!navigator.onLine) showConnection('Offline mode — the cached editor remains available and changes stay on this browser.');
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(registration => {
      if (registration.waiting && navigator.serviceWorker.controller) showUpdateAvailable();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateAvailable(); });
      });
    }).catch(() => showConnection('Offline installation is unavailable in this browser; the editor still works online.'));
  }

  init().catch(error => { console.error(error); document.body.innerHTML = `<main class="fatal"><h1>Domestic Intelligence could not start</h1><p>${escapeHtml(error.message)}</p><button onclick="location.reload()">Try again</button></main>`; });
})();
