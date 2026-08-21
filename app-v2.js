(function () {
  'use strict';

  const Core = window.DIEditorCore;
  const Property = window.DIPropertyModel;
  const Store = window.DIStorage;
  const Exporters = window.DIExporters;
  if (!Core || !Property || !Store || !Exporters) throw new Error('Domestic Intelligence modules did not load.');

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const THEME_KEY = 'domestic-intelligence-theme-v2';
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
    planInspector: $('#planInspector'), wallInspector: $('#wallInspector'), pointInspector: $('#pointInspector'),
    inspectorEmpty: $('#inspectorEmpty'), wallName: $('#wallName'), removeWall: $('#removeWall'),
    removePoint: $('#removePoint'), pointHeading: $('#pointHeading'), pointForm: $('#pointForm'),
    checkEditor: $('#checkEditor'), ipHelp: $('#ipHelp'), removePlan: $('#removePlan'),
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
  let saveTimer = null;
  let keyboardCursor = { x: 600, y: 400 };

  function state() { return previewState || history.present; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
  function slug(value) { return String(value || 'domestic-intelligence').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'domestic-intelligence'; }
  function flash(message) { el.toast.textContent = message; el.toast.classList.add('show'); clearTimeout(flash.timer); flash.timer = setTimeout(() => el.toast.classList.remove('show'), 2200); }
  function labelStatus(status) { return status === 'ready' ? 'Ready' : status === 'attention' ? 'Needs attention' : status === 'empty' ? 'No devices' : 'Not tested'; }
  function propertyLabel(current = state()) { return current.home.address || current.home.name; }

  async function loadInitialState() {
    let saved = await Store.loadState();
    if (!saved) {
      try {
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) saved = JSON.parse(legacy);
      } catch (_) { /* malformed legacy data falls through */ }
    }
    const normalised = { ...Core.normaliseState(saved), workspaceMode: 'view' };
    history = Core.createHistory(normalised, 80);
    selection.id = normalised.selected && normalised.selected.pointId || normalised.map.points[0] && normalised.map.points[0].id || null;
    el.gridSize.value = String(normalised.map.gridSize);
    floorRecord = await Store.loadFloorPlan();
    if (floorRecord) await prepareFloorPlan(floorRecord);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await Store.saveState(history.present); }
      catch (error) { showConnection(error.message); }
    }, 120);
  }

  function cancelScheduledSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  function replaceRuntimeState(next) {
    cancelScheduledSave();
    const normalised = Core.normaliseState(next);
    history = Core.createHistory(normalised, 80);
    previewState = null;
    selection = {
      type: normalised.selected?.wallId ? 'wall' : 'point',
      id: normalised.selected?.wallId || normalised.selected?.pointId || normalised.map.points[0]?.id || null
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
    replacePresent({ ...state(), workspaceMode });
  }

  function render() {
    const current = state();
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
    el.undo.disabled = !history.past.length;
    el.redo.disabled = !history.future.length;
    el.projectName.textContent = propertyLabel(current);
    renderSummary(); renderLayers(); renderMap(); renderInspector(); renderHandover();
  }

  function renderSummary() {
    const summary = Property.getPropertyReadiness(state());
    const percent = summary.totalChecks ? Math.round(summary.passedChecks / summary.totalChecks * 100) : 0;
    el.readiness.innerHTML = `<strong>${percent}% checked</strong><span>${labelStatus(summary.status)} · ${summary.passedChecks}/${summary.totalChecks} checks passed · ${summary.devices} devices</span>`;
  }

  function renderLayers() {
    const layers = state().map.layers;
    const labels = { floorplan: 'Floor plan', walls: 'Walls', devices: 'Devices', status: 'Status', labels: 'Labels' };
    el.layerControls.innerHTML = Object.keys(Core.DEFAULT_LAYERS).map(key => `<label class="layer-toggle"><input type="checkbox" data-layer="${key}" ${layers[key] ? 'checked' : ''}><span>${labels[key]}</span></label>`).join('');
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
      const hit = svgNode('line', { class: 'wall-hit', x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2, 'data-wall': wall.id, tabindex: current.workspaceMode === 'edit' ? 0 : -1, role: 'button', 'aria-label': `Wall ${index + 1}` });
      const line = svgNode('line', { class: `wall${selection.type === 'wall' && selection.id === wall.id ? ' selected' : ''}`, x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2, 'data-wall': wall.id, 'pointer-events': 'none' });
      el.wallLayer.append(hit, line);
      if (layers.labels) el.wallLayer.append(svgNode('text', { class: 'wall-label', x: (wall.x1 + wall.x2) / 2 + 8, y: (wall.y1 + wall.y2) / 2 - 8 }, `W${index + 1}`));
    });
    if (layers.devices) current.map.points.forEach(point => {
      const status = Core.deriveDeviceReadiness(point);
      const group = svgNode('g', { class: `device-point ${layers.status ? status : ''}${selection.type === 'point' && selection.id === point.id ? ' selected' : ''}`, transform: `translate(${point.x} ${point.y})`, 'data-point': point.id, tabindex: 0, role: 'button', 'aria-label': `${point.name}, ${labelStatus(status)}` });
      group.append(svgNode('circle', { class: 'pin-hit', r: 25 }), svgNode('circle', { class: 'pin-body', r: 25 }), svgNode('circle', { class: 'pin-core', r: 8 }));
      if (layers.labels) group.append(svgNode('text', { x: 34, y: 6 }, point.name));
      el.pointLayer.append(group);
    });
    const selectedWall = selection.type === 'wall' && current.map.walls.find(wall => wall.id === selection.id);
    if (selectedWall && current.workspaceMode === 'edit' && layers.walls) {
      el.handleLayer.append(svgNode('circle', { class: 'handle-hit', cx: selectedWall.x1, cy: selectedWall.y1, r: 15, 'data-handle': 'start', 'data-wall': selectedWall.id, tabindex: 0, role: 'button', 'aria-label': 'Move wall start' }), svgNode('circle', { class: 'handle', cx: selectedWall.x1, cy: selectedWall.y1, r: 15 }));
      el.handleLayer.append(svgNode('circle', { class: 'handle-hit', cx: selectedWall.x2, cy: selectedWall.y2, r: 15, 'data-handle': 'end', 'data-wall': selectedWall.id, tabindex: 0, role: 'button', 'aria-label': 'Move wall end' }), svgNode('circle', { class: 'handle', cx: selectedWall.x2, cy: selectedWall.y2, r: 15 }));
    }
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
    el.planInspector.hidden = !hasPlan;
    el.pointInspector.hidden = !point;
    el.wallInspector.hidden = !wall;
    el.inspectorEmpty.hidden = Boolean(point || wall || hasPlan);
    if (wall) el.wallName.textContent = `Wall ${current.map.walls.indexOf(wall) + 1}`;
    if (point) {
      el.pointHeading.textContent = point.name;
      const form = el.pointForm.elements;
      form.name.value = point.name;
      form.room.innerHTML = current.rooms.map(room => `<option value="${escapeHtml(room.id)}">${escapeHtml(room.name)}</option>`).join('');
      form.room.value = point.roomId || current.rooms[0].id;
      if ([...form.category.options].some(option => option.value === point.category)) form.category.value = point.category; else form.category.value = 'Other';
      form.brand.value = point.brand; form.model.value = point.model; form.serial.value = point.serialNumber; form.ip.value = point.ipAddress; form.notes.value = point.notes;
      el.checkEditor.innerHTML = point.checks.map((check, index) => `<div class="check-editor-row"><span>${escapeHtml(check.name)}</span><select data-check-index="${index}" aria-label="${escapeHtml(check.name)} status"><option value="pending" ${check.status === 'pending' ? 'selected' : ''}>Not tested</option><option value="pass" ${check.status === 'pass' ? 'selected' : ''}>Passed</option><option value="fix" ${check.status === 'fix' ? 'selected' : ''}>Needs fix</option></select></div>`).join('') || '<p class="muted compact">No acceptance checks recorded.</p>';
    }
    if (hasPlan) {
      const transform = current.map.floorplan.transform;
      el.planScale.value = transform.scale; el.planRotation.value = transform.rotation; el.planOpacity.value = transform.opacity;
      el.planX.value = transform.x; el.planY.value = transform.y;
    }
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
    selection = { type, id }; wallStart = null; editorTool = 'select'; render();
    if (focusTarget) focusSpatial(type, id, focusTarget.endpoint);
  }

  function addPointAt(current, position) {
    const roomId = current.rooms[0].id;
    const next = Core.addPoint(current, { roomId, ...position, name: 'New device', category: 'Other', checks: [{ name: 'Operation', status: 'pending' }, { name: 'State feedback', status: 'pending' }] });
    const id = next.map.points.at(-1).id; selection = { type: 'point', id }; commit(next, 'Device point added.');
  }

  function addWallAt(current, position) {
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
        next = Core.resizeWall(state(), id, endpoint, { x: (start ? wall.x1 : wall.x2) + delta.x, y: (start ? wall.y1 : wall.y2) + delta.y }, event.shiftKey ? { grid: false, endpoints: false } : {});
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
    if (pointNode) {
      select('point', pointNode.dataset.point);
      if (current.workspaceMode === 'edit') drag = { type: 'point', id: pointNode.dataset.point, start: position, origin: history.present, pointerId: event.pointerId };
    } else if (wallNode && current.workspaceMode === 'edit') {
      select('wall', wallNode.dataset.wall);
      drag = { type: handleNode ? 'handle' : 'wall', endpoint: handleNode && handleNode.dataset.handle, id: wallNode.dataset.wall, start: position, origin: history.present, pointerId: event.pointerId };
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
      if (drag.type === 'point') previewState = Core.movePoint(drag.origin, drag.id, position, { snap: true });
      if (drag.type === 'wall') previewState = Core.moveWall(drag.origin, drag.id, { x: position.x - drag.start.x, y: position.y - drag.start.y });
      if (drag.type === 'handle') previewState = Core.resizeWall(drag.origin, drag.id, drag.endpoint, position);
      renderMap();
    } catch (_) { /* ignore invalid zero-length preview */ }
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
    context.clearRect(0, 0, canvas.width, canvas.height);
    const current = state();
    if (!planSource || !current.map.floorplan || !current.map.layers.floorplan) return;
    const transform = current.map.floorplan.transform;
    const fit = Math.min(canvas.width * 0.94 / planSource.width, canvas.height * 0.94 / planSource.height);
    const width = planSource.width * fit * transform.scale / 100;
    const height = planSource.height * fit * transform.scale / 100;
    context.save(); context.globalAlpha = transform.opacity / 100;
    context.translate(canvas.width / 2 + transform.x, canvas.height / 2 + transform.y);
    context.rotate(transform.rotation * Math.PI / 180);
    context.drawImage(planSource, -width / 2, -height / 2, width, height); context.restore();
  }

  function updatePlanTransform() {
    const current = state(); if (!current.map.floorplan) return;
    const transform = { x: Number(el.planX.value) || 0, y: Number(el.planY.value) || 0, scale: Number(el.planScale.value), rotation: Number(el.planRotation.value), opacity: Number(el.planOpacity.value) };
    commit({ ...current, map: { ...current.map, floorplan: { ...current.map.floorplan, transform } } });
  }

  function showConnection(message) { el.connection.textContent = message; el.connection.hidden = !message; }
  function applyTheme(value) {
    const theme = ['system', 'light', 'dark'].includes(value) ? value : 'system';
    document.documentElement.dataset.theme = theme; el.theme.value = theme;
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    el.themeColor.content = dark ? '#10231d' : '#f3f7f5';
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
  }

  function bindEvents() {
    document.querySelectorAll('.mode-tab').forEach(button => button.addEventListener('click', () => updateView(button.dataset.view)));
    document.querySelectorAll('[data-editor-mode]').forEach(button => button.addEventListener('click', () => updateWorkspaceMode(button.dataset.editorMode)));
    document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', event => { editorTool = button.dataset.tool; wallStart = null; renderMap(); if (!event.detail) el.stage.focus(); }));
    el.undo.addEventListener('click', () => { history = Core.undoHistory(history); previewState = null; scheduleSave(); render(); flash('Undid the last map change.'); });
    el.redo.addEventListener('click', () => { history = Core.redoHistory(history); previewState = null; scheduleSave(); render(); flash('Redid the map change.'); });
    el.layerControls.addEventListener('change', event => {
      const input = event.target.closest('[data-layer]'); if (!input) return;
      if (!input.checked && ((input.dataset.layer === 'devices' && selection.type === 'point') || (input.dataset.layer === 'walls' && selection.type === 'wall'))) selection = { type: null, id: null };
      commit(Core.setLayerVisibility(state(), input.dataset.layer, input.checked), `${input.parentElement.innerText.trim()} layer ${input.checked ? 'shown' : 'hidden'}.`);
    });
    [el.showAll, el.showAllInline].forEach(button => button.addEventListener('click', () => commit(Core.showAllLayers(state()), 'All layers shown.')));
    el.gridSize.addEventListener('change', () => commit({ ...state(), map: { ...state().map, gridSize: Number(el.gridSize.value) } }, 'Grid updated.'));
    el.uploadPlan.addEventListener('click', () => el.planInput.click());
    el.svg.addEventListener('pointerdown', onPointerDown); el.svg.addEventListener('pointermove', onPointerMove); el.svg.addEventListener('pointerup', onPointerUp); el.svg.addEventListener('pointercancel', onPointerCancel); el.svg.addEventListener('lostpointercapture', onPointerCancel);
    el.svg.addEventListener('keydown', onMapKeyDown); el.stage.addEventListener('keydown', onStageKeyDown);
    el.pointForm.addEventListener('submit', event => {
      event.preventDefault(); const point = state().map.points.find(item => item.id === selection.id); if (!point) return;
      const data = new FormData(el.pointForm);
      const room = state().rooms.find(item => item.id === data.get('room')) || state().rooms.find(item => item.id === point.roomId) || state().rooms[0];
      const ipAddress = String(data.get('ip') || '').trim();
      if (!Core.isValidNetworkAddress(ipAddress)) { el.ipHelp.textContent = 'Enter a valid IPv4, IPv6 or hostname, or leave blank.'; el.pointForm.elements.ip.setAttribute('aria-invalid', 'true'); return; }
      el.ipHelp.textContent = 'Optional. Installer export only.'; el.pointForm.elements.ip.removeAttribute('aria-invalid');
      const checks = point.checks.map((check, index) => ({ ...check, status: el.checkEditor.querySelector(`[data-check-index="${index}"]`).value }));
      try { commit(Core.updatePoint(state(), point.id, { name: String(data.get('name')).trim(), roomId: room.id, category: data.get('category'), brand: data.get('brand'), model: data.get('model'), serialNumber: data.get('serial'), ipAddress, notes: data.get('notes'), checks }), 'Device details saved.'); }
      catch (error) { flash(error.message); }
    });
    el.removePoint.addEventListener('click', () => { if (!selection.id || !confirm('Remove this device point? You can still use Undo immediately afterwards.')) return; commit(Core.removePoint(state(), selection.id), 'Device point removed.'); selection = { type: null, id: null }; render(); });
    el.removeWall.addEventListener('click', () => { if (!selection.id) return; commit(Core.removeWall(state(), selection.id), 'Wall removed.'); selection = { type: null, id: null }; render(); });
    el.planInput.addEventListener('change', async () => {
      const file = el.planInput.files[0]; const validation = Store.validateFloorPlan(file);
      if (!validation.ok) { flash(validation.error); el.planInput.value = ''; return; }
      try {
        const metadata = { name: file.name, transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 60 } };
        const decoded = await decodeFloorPlan({ name: file.name, type: validation.type, blob: file });
        const saved = await Store.saveFloorPlan(file, metadata);
        floorRecord = await Store.loadFloorPlan(); planSource = decoded;
        commit({ ...state(), map: { ...state().map, floorplan: { name: file.name, type: validation.type, transform: metadata.transform } } }, saved.warning || 'Floor plan stored locally.');
      } catch (error) { flash(error.message); }
      el.planInput.value = '';
    });
    [el.planScale, el.planRotation, el.planOpacity, el.planX, el.planY].forEach(input => input.addEventListener('change', updatePlanTransform));
    [el.planScale, el.planRotation, el.planOpacity].forEach(input => input.addEventListener('input', () => {
      const current = history.present; if (!current.map.floorplan) return;
      const key = input === el.planScale ? 'scale' : input === el.planRotation ? 'rotation' : 'opacity';
      previewState = { ...current, map: { ...current.map, floorplan: { ...current.map.floorplan, transform: { ...current.map.floorplan.transform, [key]: Number(input.value) } } } };
      renderPlanCanvas();
    }));
    el.removePlan.addEventListener('click', async () => {
      if (!confirm('Remove the locally stored floor-plan background?')) return;
      try { await Store.removeFloorPlan(); floorRecord = null; planSource = null; commit({ ...state(), map: { ...state().map, floorplan: null } }, 'Floor plan removed.'); }
      catch (error) { flash(`Floor plan was not removed: ${error.message}`); }
    });
    el.exportPdf.addEventListener('click', () => { Exporters.downloadBlob(Exporters.createHomeownerPdf(exportShape()), `${slug(propertyLabel())}-handover.pdf`); flash('Homeowner PDF downloaded.'); });
    el.exportCsv.addEventListener('click', () => { Exporters.downloadBlob(Exporters.createInstallerCsvBlob(exportShape()), `${slug(propertyLabel())}-installer.csv`); flash('Installer CSV downloaded.'); });
    el.exportJson.addEventListener('click', () => { Exporters.downloadBlob(Exporters.createInstallerJsonBlob(exportShape()), `${slug(propertyLabel())}-installer.json`); flash('Installer JSON downloaded.'); });
    el.theme.addEventListener('change', () => applyTheme(el.theme.value));
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (el.theme.value === 'system') applyTheme('system'); });
    el.reset.addEventListener('click', async () => {
      if (!confirm('Reset all local v0.2 changes, imported plans and device details?')) return;
      try { await Store.clearAll(); floorRecord = null; planSource = null; history = Core.createHistory(Core.createInitialState(), 80); selection = { type: 'point', id: history.present.map.points[0].id }; render(); scheduleSave(); flash('Synthetic demo restored.'); }
      catch (error) { flash(`Reset could not be completed: ${error.message}`); }
    });
    window.addEventListener('online', () => { showConnection(''); flash('Back online. Local changes are preserved.'); });
    window.addEventListener('offline', () => showConnection('Offline mode — the cached editor remains available and changes stay on this browser.'));
  }

  async function init() {
    let theme = 'system'; try { theme = localStorage.getItem(THEME_KEY) || 'system'; } catch (_) {}
    applyTheme(theme); await loadInitialState(); bindEvents(); render();
    window.DIAppBridge = Object.freeze({
      getState: () => clone(history.present),
      cancelScheduledSave,
      replaceRuntimeState
    });
    window.dispatchEvent(new CustomEvent('di:app-state-ready'));
    if (!navigator.onLine) showConnection('Offline mode — the cached editor remains available and changes stay on this browser.');
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => showConnection('Offline installation is unavailable in this browser; the editor still works online.'));
  }

  init().catch(error => { console.error(error); document.body.innerHTML = `<main class="fatal"><h1>Domestic Intelligence could not start</h1><p>${escapeHtml(error.message)}</p><button onclick="location.reload()">Try again</button></main>`; });
})();
