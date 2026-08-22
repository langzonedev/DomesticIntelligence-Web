(function () {
  'use strict';

  const Core = window.DIEditorCore;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const $ = selector => document.querySelector(selector);
  const stage = $('#mapStage');
  const svg = $('#mapSvg');
  const canvas = $('#planCanvas');
  if (!Core || !stage || !svg || !canvas) return;

  let tool = 'select';
  let viewport = { x: 0, y: 0, zoom: 1 };
  let pan = null;
  let viewportTimer = null;
  let viewportMessage = null;
  let calibrationPoints = [];
  let calibrationActive = false;
  let summaryReturnFocus = null;
  let summarySwipeStartY = null;
  const touches = new Map();
  let pinch = null;
  let layersReturnFocus = null;
  const layerLabels = {
    floorplan: 'Reference plan', walls: 'Walls / structure', openings: 'Doors / windows',
    roomLabels: 'Room labels', devices: 'Devices', status: 'Commissioning status',
    deviceLabels: 'Device labels', labels: 'Device labels', network: 'Network groupings'
  };

  const bridge = () => window.DIAppBridge;
  const currentState = () => bridge()?.getState();
  const requireEditMode = action => bridge()?.requireEditMode?.(action) ?? currentState()?.workspaceMode === 'edit';
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const round = value => Math.round(value * 100) / 100;

  function applyViewport(next = viewport) {
    viewport = { x: Number(next.x) || 0, y: Number(next.y) || 0, zoom: clamp(Number(next.zoom) || 1, .1, 8) };
    const transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
    canvas.style.transform = transform;
    svg.style.transform = transform;
    const state = currentState();
    if (state?.map) {
      const gridX = state.map.gridSize / state.map.width * stage.clientWidth * viewport.zoom;
      const gridY = state.map.gridSize / state.map.height * stage.clientHeight * viewport.zoom;
      stage.style.backgroundSize = `${Math.max(4, gridX)}px ${Math.max(4, gridY)}px`;
      stage.style.backgroundPosition = `${viewport.x}px ${viewport.y}px`;
    }
    $('#zoomLevel').textContent = `${Math.round(viewport.zoom * 100)}%`;
  }

  function persistViewport(message) {
    clearTimeout(viewportTimer);
    viewportMessage = message;
    viewportTimer = setTimeout(() => {
      const pendingMessage = viewportMessage;
      viewportTimer = null;
      viewportMessage = null;
      const state = currentState();
      if (!state) return;
      bridge().commitState(Core.setMapViewport(state, viewport), pendingMessage);
    }, 120);
  }

  function cancelPendingViewport() {
    clearTimeout(viewportTimer);
    viewportTimer = null;
    viewportMessage = null;
  }

  function flushPendingViewport() {
    if (viewportTimer == null) return false;
    clearTimeout(viewportTimer);
    const pendingMessage = viewportMessage;
    viewportTimer = null;
    viewportMessage = null;
    const state = currentState();
    if (!state || !bridge()) return false;
    bridge().commitState(Core.setMapViewport(state, viewport), pendingMessage);
    return true;
  }

  function zoomAt(nextZoom, clientX, clientY, message) {
    const rect = stage.getBoundingClientRect();
    const oldZoom = viewport.zoom;
    const zoom = clamp(nextZoom, .1, 8);
    const anchorX = clientX == null ? rect.width / 2 : clientX - rect.left;
    const anchorY = clientY == null ? rect.height / 2 : clientY - rect.top;
    viewport = {
      x: anchorX - (anchorX - viewport.x) * zoom / oldZoom,
      y: anchorY - (anchorY - viewport.y) * zoom / oldZoom,
      zoom
    };
    applyViewport();
    persistViewport(message);
  }

  function resetViewport(message = 'View reset.') {
    applyViewport({ x: 0, y: 0, zoom: 1 });
    persistViewport(message);
  }

  function setTool(next) {
    tool = next === 'pan' ? 'pan' : 'select';
    stage.classList.toggle('atlas-pan', tool === 'pan');
    document.querySelectorAll('[data-atlas-tool]').forEach(button => {
      const active = button.dataset.atlasTool === tool;
      button.setAttribute('aria-pressed', String(active));
    });
    bridge()?.notify(tool === 'pan' ? 'Pan tool active. Drag the map; pinch or use the wheel to zoom.' : 'Select tool active. Choose a device or wall.');
  }

  function pointFromClient(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const state = currentState();
    return {
      x: clamp((clientX - rect.left) / rect.width * state.map.width, 0, state.map.width),
      y: clamp((clientY - rect.top) / rect.height * state.map.height, 0, state.map.height)
    };
  }

  function pointerDown(event) {
    if (calibrationActive) {
      if (event.button != null && event.button !== 0) return;
      event.preventDefault(); event.stopImmediatePropagation();
      calibrationPoints.push(pointFromClient(event.clientX, event.clientY));
      if (calibrationPoints.length >= 2) calibrationActive = false;
      renderCalibration(currentState());
      return;
    }
    const spatial = event.target.closest('[data-point],[data-wall]');
    const state = currentState();
    const shouldPan = tool === 'pan' || (!spatial && state?.workspaceMode === 'view' && event.pointerType !== 'touch');
    if (!shouldPan || event.button !== 0) return;
    pan = { id: event.pointerId, startX: event.clientX, startY: event.clientY, origin: { ...viewport } };
    stage.classList.add('atlas-panning');
    stage.setPointerCapture?.(event.pointerId);
    event.preventDefault(); event.stopImmediatePropagation();
  }

  function pointerMove(event) {
    if (!pan || pan.id !== event.pointerId) return;
    applyViewport({ ...pan.origin, x: pan.origin.x + event.clientX - pan.startX, y: pan.origin.y + event.clientY - pan.startY });
    event.preventDefault(); event.stopImmediatePropagation();
  }

  function pointerEnd(event) {
    if (!pan || pan.id !== event.pointerId) return;
    pan = null; stage.classList.remove('atlas-panning');
    try { stage.releasePointerCapture?.(event.pointerId); } catch (_) {}
    persistViewport('Storey view saved.');
    event.preventDefault(); event.stopImmediatePropagation();
  }

  function touchStart(event) {
    [...event.changedTouches].forEach(touch => touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY }));
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: viewport.zoom, midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      event.preventDefault();
    }
  }

  function touchMove(event) {
    [...event.changedTouches].forEach(touch => touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY }));
    if (!pinch || touches.size !== 2) return;
    const [a, b] = [...touches.values()];
    const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    zoomAt(pinch.zoom * distance / pinch.distance, pinch.midpoint.x, pinch.midpoint.y);
    event.preventDefault();
  }

  function touchEnd(event) {
    [...event.changedTouches].forEach(touch => touches.delete(touch.identifier));
    if (touches.size < 2 && pinch) { pinch = null; persistViewport('Storey view saved.'); }
  }

  function renderInventory(state, selection) {
    const host = $('#spatialInventory');
    if (!host) return;
    host.replaceChildren();
    const add = (type, id, label, meta) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'inventory-item'; button.setAttribute('role', 'listitem');
      button.setAttribute('aria-current', String(selection?.type === type && selection?.id === id));
      const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); icon.textContent = type === 'point' ? '◆' : '╱';
      const text = document.createElement('span');
      const strong = document.createElement('strong'); strong.textContent = label;
      const small = document.createElement('small'); small.textContent = meta;
      text.append(strong, document.createElement('br'), small); button.append(icon, text);
      button.addEventListener('click', () => bridge().selectSpatial(type, id, {}));
      host.append(button);
    };
    state.map.points.forEach(point => add('point', point.id, point.name, `${point.category} · ${Core.deriveDeviceReadiness(point)}`));
    state.map.walls.forEach((wall, index) => add('wall', wall.id, `Wall ${index + 1}`, wallLengthLabel(state, wall)));
    if (!host.children.length) { const empty = document.createElement('p'); empty.className = 'muted compact'; empty.textContent = 'No spatial objects on this storey.'; host.append(empty); }
  }

  function wallLengthLabel(state, wall) {
    const pixels = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    try { return `${round(Core.pixelsToCalibratedUnits(state.map, pixels))} ${state.map.calibration.unit}`; }
    catch (_) { return `${round(pixels)} map units`; }
  }

  function renderWallTools(state, selection) {
    const wall = selection?.type === 'wall' && state.map.walls.find(item => item.id === selection.id);
    if (!wall) return;
    const values = { wallX1: wall.x1, wallY1: wall.y1, wallX2: wall.x2, wallY2: wall.y2 };
    Object.entries(values).forEach(([id, value]) => { const input = $(`#${id}`); if (input && document.activeElement !== input) input.value = round(value); });
    const metrics = $('#wallMetrics'); if (metrics) metrics.textContent = `Length ${wallLengthLabel(state, wall)}`;
  }

  function renderCalibration(state) {
    const status = $('#calibrationStatus'); const apply = $('#applyCalibration');
    stage.classList.toggle('calibrating', calibrationActive);
    if (calibrationActive) status.textContent = calibrationPoints.length ? 'First point chosen. Choose the second point.' : 'Choose the first point on the reference plan.';
    else if (calibrationPoints.length === 2) status.textContent = 'Two points chosen. Enter the known distance.';
    else if (state?.map.calibration) status.textContent = `Calibrated: ${round(state.map.calibration.pixelsPerUnit)} map units per ${state.map.calibration.unit}.`;
    else status.textContent = 'Not calibrated.';
    if (apply) apply.disabled = state?.workspaceMode !== 'edit' || calibrationPoints.length !== 2;
  }

  function renderLayerLocks(state) {
    const locks = state.map.layerLocks || {};
    document.querySelectorAll('#layerControls .layer-toggle').forEach(row => {
      const input = row.querySelector('[data-layer]'); if (!input) return;
      let button = row.querySelector('.layer-lock-button');
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'icon-action layer-lock-button';
        button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); toggleLayerLock(input.dataset.layer); });
        row.append(button);
      }
      const locked = Boolean(locks[input.dataset.layer]);
      button.textContent = locked ? '▣' : '□'; button.setAttribute('aria-label', `${locked ? 'Unlock' : 'Lock'} ${row.querySelector('span')?.textContent || input.dataset.layer} layer`); button.setAttribute('aria-pressed', String(locked));
    });
    const planLocked = $('#planLocked');
    if (planLocked) planLocked.checked = Boolean(locks.floorplan);
    const editing = state.workspaceMode === 'edit';
    ['planScale','planRotation','planOpacity','planX','planY'].forEach(id => { const input = $(`#${id}`); if (input) input.disabled = !editing || Boolean(locks.floorplan); });
    const controls = { applyWallCoordinates: !editing || Boolean(locks.walls), startCalibration: !editing || Boolean(locks.floorplan), fitReference: !editing || Boolean(locks.floorplan) };
    Object.entries(controls).forEach(([id, disabled]) => { const control = $(`#${id}`); if (control) control.disabled = disabled; });
    renderLayerSheet(state);
  }

  function renderLayerSheet(state) {
    const host = $('#atlasLayerSheetList');
    if (!host) return;
    const active = document.activeElement;
    const focusTarget = host.contains(active)
      ? active.dataset.sheetLayer ? { attribute: 'data-sheet-layer', value: active.dataset.sheetLayer }
        : active.dataset.sheetLock ? { attribute: 'data-sheet-lock', value: active.dataset.sheetLock }
          : null
      : null;
    const dialog = host.closest('dialog');
    const dialogScrollTop = dialog?.scrollTop;
    const hostScrollTop = host.scrollTop;
    const layers = state.map.layers || {};
    const locks = state.map.layerLocks || {};
    const layerKeys = Object.keys(Core.DEFAULT_LAYERS);
    const existingRows = [...host.querySelectorAll('.atlas-sheet-layer-row')];
    const canUpdateInPlace = existingRows.length === layerKeys.length && existingRows.every((row, index) =>
      row.querySelector('[data-sheet-layer]')?.dataset.sheetLayer === layerKeys[index] && row.querySelector('[data-sheet-lock]')?.dataset.sheetLock === layerKeys[index]);
    if (canUpdateInPlace) {
      existingRows.forEach((row, index) => {
        const layer = layerKeys[index]; const checkbox = row.querySelector('[data-sheet-layer]'); const lock = row.querySelector('[data-sheet-lock]');
        checkbox.checked = Boolean(layers[layer]);
        lock.textContent = locks[layer] ? '▣' : '□'; lock.setAttribute('aria-pressed', String(Boolean(locks[layer])));
        lock.setAttribute('aria-label', `${locks[layer] ? 'Unlock' : 'Lock'} ${layerLabels[layer] || layer} layer`);
      });
      return;
    }
    host.replaceChildren();
    layerKeys.forEach((layer, index) => {
      const row = document.createElement('div'); row.className = 'atlas-sheet-layer-row';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = `atlas-sheet-layer-${index}`;
      checkbox.dataset.sheetLayer = layer; checkbox.checked = Boolean(layers[layer]);
      const label = document.createElement('label'); label.htmlFor = checkbox.id; label.textContent = layerLabels[layer] || layer;
      const lock = document.createElement('button'); lock.type = 'button'; lock.className = 'icon-action'; lock.dataset.sheetLock = layer;
      lock.textContent = locks[layer] ? '▣' : '□'; lock.setAttribute('aria-pressed', String(Boolean(locks[layer])));
      lock.setAttribute('aria-label', `${locks[layer] ? 'Unlock' : 'Lock'} ${layerLabels[layer] || layer} layer`);
      row.append(checkbox, label, lock); host.append(row);
    });
    if (focusTarget) {
      const escaped = window.CSS?.escape ? CSS.escape(focusTarget.value) : focusTarget.value.replace(/["\\]/g, '\\$&');
      host.querySelector(`[${focusTarget.attribute}="${escaped}"]`)?.focus({ preventScroll: true });
      host.scrollTop = hostScrollTop;
      if (dialog && dialogScrollTop != null) dialog.scrollTop = dialogScrollTop;
    }
  }

  function toggleLayerLock(layer, explicit) {
    const state = currentState(); if (!state) return;
    const locks = { ...(state.map.layerLocks || {}) };
    locks[layer] = explicit == null ? !locks[layer] : Boolean(explicit);
    bridge().commitState({ ...state, map: { ...state.map, layerLocks: locks } }, `${layer} layer ${locks[layer] ? 'locked' : 'unlocked'}.`);
  }

  function openLayerSheet(trigger) {
    const dialog = $('#atlasLayersDialog');
    if (!dialog) return;
    layersReturnFocus = trigger || document.activeElement;
    renderLayerSheet(currentState());
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    requestAnimationFrame(() => dialog.querySelector('input, button')?.focus());
  }

  function closeLayerSheet() {
    const dialog = $('#atlasLayersDialog');
    if (!dialog?.open) return;
    if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
  }

  function syncResponsiveMode() {
    const shortLandscape = matchMedia('(max-height: 500px) and (max-width: 950px), (orientation: landscape) and (pointer: coarse) and (max-width: 950px)').matches;
    document.body.classList.toggle('atlas-short-landscape', shortLandscape);
    if (shortLandscape && !document.body.matches('.mobile-section-plan,.mobile-section-devices,.mobile-section-handover,.mobile-section-more')) routeShortLandscape('plan');
  }

  function routeShortLandscape(section) {
    if (!document.body.classList.contains('atlas-short-landscape')) return;
    const devices = $('#mobileDevicesView'); const more = $('#mobileMoreView');
    if (section === 'devices' && !devices || section === 'more' && !more) {
      bridge()?.notify('This view is available after opening the app in portrait. The floor plan remains ready here.');
      section = 'plan';
    }
    document.body.classList.remove('mobile-section-home', 'mobile-section-plan', 'mobile-section-devices', 'mobile-section-handover', 'mobile-section-more');
    document.body.classList.add(`mobile-section-${section}`);
    if (devices) devices.hidden = section !== 'devices';
    if (more) more.hidden = section !== 'more';
    document.querySelector(section === 'handover' ? '[data-view="handover"]' : '[data-view="commission"]')?.click();
    document.querySelectorAll('.mobile-bottom-nav [data-mobile-section]').forEach(button => {
      const active = button.dataset.mobileSection === section;
      button.classList.toggle('active', active); button.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }

  function setDeviceSummaryExpanded(expanded) {
    const sheet = $('#mobileDeviceSummary');
    if (!sheet) return;
    sheet.dataset.expanded = String(Boolean(expanded));
    const grabber = sheet.querySelector('.summary-grabber');
    if (grabber) {
      grabber.setAttribute('aria-expanded', String(Boolean(expanded)));
      grabber.setAttribute('aria-label', expanded ? 'Collapse device details' : 'Expand device details');
    }
  }

  function formatSummaryDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { day:'numeric', month:'short', year:'numeric' }).format(date);
  }

  function addQuickRecordSection(host, title, entries) {
    const useful = entries.filter(([, value]) => value != null && String(value).trim());
    if (!useful.length) return;
    const section = document.createElement('section'); section.className = 'device-quick-section';
    const heading = document.createElement('h3'); heading.textContent = title; section.append(heading);
    useful.forEach(([label, value]) => {
      const row = document.createElement('div'); row.className = 'device-quick-row';
      const key = document.createElement('span'); key.textContent = label;
      const detail = document.createElement('strong'); detail.textContent = value;
      row.append(key, detail); section.append(row);
    });
    host.append(section);
  }

  function renderDeviceQuickRecord(point) {
    const host = $('#mobileDeviceQuickRecord'); if (!host) return;
    host.replaceChildren();
    const state = currentState();
    const roomName = state?.rooms?.find(room => room.id === point.roomId)?.name || point.room || '';
    const readiness = Core.deriveDeviceReadiness(point);

    addQuickRecordSection(host, 'Identity', [
      ['Name', point.name],
      ['Category', point.category],
      ['Room', roomName],
      ['Brand', point.brand],
      ['Model', point.model],
      ['Serial number', point.serialNumber],
      ['Asset / installer ref', point.assetReference],
      ['Readiness', readiness === 'ready' ? 'Ready' : readiness === 'attention' ? 'Needs attention' : 'Not tested']
    ]);

    addQuickRecordSection(host, 'Connectivity', [
      ['Protocol', point.protocol],
      ['Network / VLAN', point.networkLabel],
      ['Network address', point.networkAddress],
      ['MAC address', point.macAddress],
      ['Hub / controller / switch', point.controllerReference],
      ['Port reference', point.portReference]
    ]);

    addQuickRecordSection(host, 'Installation', [
      ['Installation date', formatSummaryDate(point.installationDate)],
      ['Warranty date', formatSummaryDate(point.warrantyDate)],
      ['Installer / business', point.installerBusiness],
      ['Circuit / board reference', point.circuitReference],
      ['Firmware / version', point.firmwareVersion],
      ['Physical location notes', point.physicalLocationNotes]
    ]);

    const checks = Array.isArray(point.checks) ? point.checks.map((check, index) => {
      const label = check?.label || check?.name || `Check ${index + 1}`;
      const status = check?.status === 'pass' ? 'Pass' : check?.status === 'fix' ? 'Needs attention' : check?.status || 'Pending';
      return [label, status];
    }) : [];
    addQuickRecordSection(host, 'Commissioning checks', checks);

    addQuickRecordSection(host, 'Lifecycle & notes', [
      ['Last tested', formatSummaryDate(point.lastTestedDate)],
      ['Issues / actions', point.issuesActions],
      ['Maintenance notes', point.maintenanceNotes],
      ['Homeowner notes', point.homeownerNotes]
    ]);

    const knownKeys = new Set([
      'id','x','y','roomId','name','category','brand','model','serialNumber','assetReference','protocol','networkAddress','macAddress','networkLabel',
      'controllerReference','portReference','installationDate','warrantyDate','installerBusiness','circuitReference','firmwareVersion','physicalLocationNotes',
      'lastTestedDate','checks','issuesActions','maintenanceNotes','homeownerNotes','installerNotes','room','floorId','floorName','roomName','type'
    ]);
    const extraEntries = Object.entries(point)
      .filter(([key, value]) => !knownKeys.has(key) && value != null && typeof value !== 'object' && String(value).trim())
      .filter(([key]) => !/(password|passcode|pin|credential|secret|token|key)/i.test(key))
      .map(([key, value]) => [key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase()), value]);
    addQuickRecordSection(host, 'Other recorded details', extraEntries);

    if (!host.children.length) {
      const empty = document.createElement('p'); empty.className = 'muted compact'; empty.textContent = 'No additional device details have been recorded yet.'; host.append(empty);
    }
  }

  function ensureDeviceSummaryEnhancements() {
    const sheet = $('#mobileDeviceSummary'); if (!sheet) return;
    if (!$('#diDeviceQuickRecordStyles')) {
      const style = document.createElement('style'); style.id = 'diDeviceQuickRecordStyles';
      style.textContent = `
        @media (max-width:760px){
          .mobile-device-summary:not([hidden]){grid-template-rows:auto auto auto minmax(0,1fr) auto;max-height:calc(100dvh - 92px);overflow:hidden;transition:max-height .22s ease,bottom .22s ease}
          .mobile-device-summary .summary-grabber{position:relative;cursor:ns-resize;touch-action:none}
          .mobile-device-summary .summary-grabber::after{content:'';position:absolute;inset:-14px -28px;}
          .mobile-device-summary[data-expanded="false"] .mobile-device-quick-record{display:none}
          .mobile-device-summary[data-expanded="true"]{top:max(12px,env(safe-area-inset-top));bottom:calc(76px + env(safe-area-inset-bottom));max-height:none}
          .mobile-device-summary[data-expanded="true"] .mobile-device-quick-record{display:grid;gap:10px;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:2px 2px 12px;scrollbar-gutter:stable}
          .device-quick-section{display:grid;gap:0;border:1px solid var(--di-border);border-radius:12px;background:var(--di-subtle);overflow:hidden}
          .device-quick-section h3{margin:0;padding:10px 12px 7px;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--di-muted)}
          .device-quick-row{display:grid;grid-template-columns:minmax(92px,.85fr) minmax(0,1.35fr);gap:12px;padding:9px 12px;border-top:1px solid var(--di-border);align-items:start}
          .device-quick-row span{color:var(--di-muted);font-size:.82rem}
          .device-quick-row strong{min-width:0;overflow-wrap:anywhere;font-size:.88rem;font-weight:750;text-align:right}
          .mobile-device-summary[data-expanded="true"] #openDeviceRecord{position:sticky;bottom:0}
        }
      `;
      document.head.append(style);
    }
    let quick = $('#mobileDeviceQuickRecord');
    if (!quick) {
      quick = document.createElement('div'); quick.id = 'mobileDeviceQuickRecord'; quick.className = 'mobile-device-quick-record'; quick.setAttribute('aria-label', 'Device quick record');
      const open = $('#openDeviceRecord'); open?.before(quick);
    }
    const grabber = sheet.querySelector('.summary-grabber');
    if (grabber && !grabber.dataset.quickRecordBound) {
      grabber.dataset.quickRecordBound = 'true'; grabber.tabIndex = 0; grabber.setAttribute('role', 'button');
      grabber.addEventListener('pointerdown', event => {
        summarySwipeStartY = event.clientY;
        try { grabber.setPointerCapture?.(event.pointerId); } catch (_) {}
      });
      grabber.addEventListener('pointerup', event => {
        if (summarySwipeStartY == null) return;
        const delta = event.clientY - summarySwipeStartY; summarySwipeStartY = null;
        try { grabber.releasePointerCapture?.(event.pointerId); } catch (_) {}
        const expanded = sheet.dataset.expanded === 'true';
        if (delta < -20) setDeviceSummaryExpanded(true);
        else if (delta > 20) setDeviceSummaryExpanded(false);
        else setDeviceSummaryExpanded(!expanded);
      });
      grabber.addEventListener('pointercancel', () => { summarySwipeStartY = null; });
      grabber.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); setDeviceSummaryExpanded(sheet.dataset.expanded !== 'true');
      });
    }
  }

  function closeDeviceSummary({ restoreFocus = true } = {}) {
    const sheet = $('#mobileDeviceSummary'); if (!sheet || sheet.hidden) return;
    sheet.hidden = true; setDeviceSummaryExpanded(false);
    if (restoreFocus) requestAnimationFrame(() => (summaryReturnFocus?.isConnected ? summaryReturnFocus : stage).focus());
    summaryReturnFocus = null;
  }

  function openDeviceSummary(detail) {
    const state = currentState(); const point = state?.map.points.find(item => item.id === detail?.pointId); if (!point) return;
    ensureDeviceSummaryEnhancements();
    summaryReturnFocus = detail.returnFocus || document.activeElement;
    $('#mobileDeviceSummaryTitle').textContent = point.name;
    $('#mobileDeviceSummaryMeta').textContent = [point.category, point.protocol && point.protocol !== 'Other' ? point.protocol : '', [point.brand, point.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    const readiness = Core.deriveDeviceReadiness(point);
    $('#mobileDeviceSummaryStatus').textContent = readiness === 'ready' ? 'Ready' : readiness === 'attention' ? 'Needs attention' : 'Not tested';
    renderDeviceQuickRecord(point);
    const sheet = $('#mobileDeviceSummary'); sheet.dataset.pointId = point.id; setDeviceSummaryExpanded(false); sheet.hidden = false; $('#openDeviceRecord').focus();
  }

  function onRender(event) {
    const state = event.detail?.state || currentState(); if (!state) return;
    if (!pan && !pinch) applyViewport(state.map.viewport || { x: 0, y: 0, zoom: 1 });
    const floor = state.home?.floors?.find(item => item.id === state.home.activeFloorId);
    const visible = Object.values(state.map.layers || {}).filter(Boolean).length;
    if ($('#storeyContext')) $('#storeyContext').textContent = `${floor?.name || 'Current storey'} · ${visible} active layers`;
    renderInventory(state, event.detail?.selection || bridge()?.getSelection());
    renderWallTools(state, event.detail?.selection || bridge()?.getSelection());
    renderCalibration(state);
    renderLayerLocks(state);
  }

  function bind() {
    ensureDeviceSummaryEnhancements();
    document.querySelectorAll('[data-atlas-tool]').forEach(button => button.addEventListener('click', () => setTool(button.dataset.atlasTool)));
    $('#zoomIn')?.addEventListener('click', () => zoomAt(viewport.zoom * 1.2, null, null, 'View zoomed in.'));
    $('#zoomOut')?.addEventListener('click', () => zoomAt(viewport.zoom / 1.2, null, null, 'View zoomed out.'));
    $('#fitStorey')?.addEventListener('click', () => resetViewport('Storey fitted to the canvas.'));
    $('#resetView')?.addEventListener('click', () => resetViewport());
    document.querySelectorAll('.atlas-layers-trigger').forEach(button => button.addEventListener('click', () => openLayerSheet(button)));
    $('#atlasLayersClose')?.addEventListener('click', closeLayerSheet);
    $('#atlasLayersDialog')?.addEventListener('close', () => {
      requestAnimationFrame(() => (layersReturnFocus?.isConnected ? layersReturnFocus : stage).focus());
      layersReturnFocus = null;
    });
    $('#atlasLayerSheetList')?.addEventListener('change', event => {
      const input = event.target.closest('[data-sheet-layer]'); if (!input) return;
      const state = currentState();
      const next = Core.setLayerVisibility(state, input.dataset.sheetLayer, input.checked);
      bridge().commitState(next, `${layerLabels[input.dataset.sheetLayer] || input.dataset.sheetLayer} layer ${input.checked ? 'shown' : 'hidden'}.`);
      const selected = bridge()?.getSelection();
      if (!input.checked && ((input.dataset.sheetLayer === 'devices' && selected?.type === 'point') || (input.dataset.sheetLayer === 'walls' && selected?.type === 'wall'))) bridge().selectSpatial(null, null, {});
    });
    $('#atlasLayerSheetList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-sheet-lock]'); if (button) toggleLayerLock(button.dataset.sheetLock);
    });
    $('#atlasLayersShowAll')?.addEventListener('click', () => {
      const shown = Core.showAllLayers(currentState());
      bridge().commitState({ ...shown, map: { ...shown.map, layerLocks: Object.fromEntries(Object.keys(Core.DEFAULT_LAYERS).map(key => [key, false])) } }, 'All layers shown and unlocked.');
    });
    document.addEventListener('click', event => {
      if (!document.body.classList.contains('atlas-short-landscape')) return;
      const destination = event.target.closest('.mobile-bottom-nav [data-mobile-section]');
      if (!destination) return;
      event.preventDefault(); event.stopImmediatePropagation(); routeShortLandscape(destination.dataset.mobileSection);
    }, true);
    stage.addEventListener('wheel', event => { if (!(event.ctrlKey || Math.abs(event.deltaY) > Math.abs(event.deltaX))) return; event.preventDefault(); zoomAt(viewport.zoom * Math.exp(-event.deltaY * .0015), event.clientX, event.clientY); }, { passive: false });
    stage.addEventListener('pointerdown', pointerDown, true); stage.addEventListener('pointermove', pointerMove, true); stage.addEventListener('pointerup', pointerEnd, true); stage.addEventListener('pointercancel', pointerEnd, true);
    stage.addEventListener('touchstart', touchStart, { passive: false }); stage.addEventListener('touchmove', touchMove, { passive: false }); stage.addEventListener('touchend', touchEnd, { passive: false }); stage.addEventListener('touchcancel', touchEnd, { passive: false });
    stage.addEventListener('keydown', event => {
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomAt(viewport.zoom * 1.2, null, null, 'View zoomed in.'); }
      else if (event.key === '-') { event.preventDefault(); zoomAt(viewport.zoom / 1.2, null, null, 'View zoomed out.'); }
      else if (event.key === '0') { event.preventDefault(); resetViewport(); }
      else if (event.altKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); applyViewport({ ...viewport, x: viewport.x + (event.key === 'ArrowLeft' ? 24 : event.key === 'ArrowRight' ? -24 : 0), y: viewport.y + (event.key === 'ArrowUp' ? 24 : event.key === 'ArrowDown' ? -24 : 0) }); persistViewport('Storey view saved.'); }
    }, true);
    $('#applyWallCoordinates')?.addEventListener('click', () => {
      if (!requireEditMode('apply wall coordinates')) return;
      const state = currentState(); const selection = bridge()?.getSelection(); const wall = selection?.type === 'wall' && state.map.walls.find(item => item.id === selection.id); if (!wall) return;
      try {
        let next = Core.moveConnectedWallEndpoint(state, wall.id, 'start', { x: Number($('#wallX1').value), y: Number($('#wallY1').value) }, { grid: false, endpoints: false });
        next = Core.moveConnectedWallEndpoint(next, wall.id, 'end', { x: Number($('#wallX2').value), y: Number($('#wallY2').value) }, { grid: false, endpoints: false });
        bridge().commitState(next, 'Exact wall coordinates applied.');
      } catch (error) { bridge().notify(error.message); }
    });
    $('#startCalibration')?.addEventListener('click', () => { if (!requireEditMode('calibrate the reference plan')) return; calibrationPoints = []; calibrationActive = true; renderCalibration(currentState()); stage.focus(); });
    $('#applyCalibration')?.addEventListener('click', () => {
      if (!requireEditMode('apply reference calibration')) return;
      const distance = Number($('#calibrationDistance').value); if (!(distance > 0) || calibrationPoints.length !== 2) { bridge().notify('Enter a real distance greater than zero.'); return; }
      const pixels = Math.hypot(calibrationPoints[1].x - calibrationPoints[0].x, calibrationPoints[1].y - calibrationPoints[0].y);
      const chosenPoints = calibrationPoints.map(point => ({ ...point }));
      try {
        const calibrated = Core.calibrateMap(currentState(), pixels, distance, 'm');
        calibrationPoints = [];
        bridge().commitState(calibrated, 'Reference plan calibrated in metres.');
        $('#startCalibration')?.focus();
      } catch (error) {
        calibrationPoints = chosenPoints;
        renderCalibration(currentState());
        bridge().notify(error.message);
      }
    });
    $('#planLocked')?.addEventListener('change', event => toggleLayerLock('floorplan', event.target.checked));
    $('#fitReference')?.addEventListener('click', () => {
      if (!requireEditMode('fit the reference plan')) return;
      const state = currentState(); if (!state?.map.floorplan) { bridge().notify('Upload a reference plan first.'); return; }
      if (state.map.layerLocks?.floorplan) { bridge().notify('Unlock the Reference plan layer before fitting it.'); return; }
      const transform = { ...state.map.floorplan.transform, x: 0, y: 0, scale: 100 };
      bridge().commitState({ ...state, map: { ...state.map, floorplan: { ...state.map.floorplan, transform } } }, 'Reference fitted to the storey.');
    });
    window.addEventListener('di:render', onRender);
    window.addEventListener('di:mobile-point-summary', event => openDeviceSummary(event.detail));
    $('#closeDeviceSummary')?.addEventListener('click', () => closeDeviceSummary());
    $('#openDeviceRecord')?.addEventListener('click', () => {
      const pointId = $('#mobileDeviceSummary')?.dataset.pointId; const focus = summaryReturnFocus; closeDeviceSummary({ restoreFocus:false });
      if (pointId) bridge().selectSpatial('point', pointId);
      window.DIMobileDetail?.open({ returnFocus: focus || stage, focusSelector:'#mobilePointClose' });
      history.pushState({ mobileSection:'plan', overlay:'point' }, '', '#plan-device');
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#mobileDeviceSummary')?.hidden) { event.preventDefault(); closeDeviceSummary(); } });
    window.addEventListener('popstate', () => closeDeviceSummary({ restoreFocus:false }));
    window.addEventListener('resize', () => { syncResponsiveMode(); if (!pan && !pinch) applyViewport(currentState()?.map.viewport || viewport); });
    syncResponsiveMode();
    onRender({ detail: { state: currentState(), selection: bridge()?.getSelection() } });
  }

  window.DIAtlasViewport = Object.freeze({ cancelPending: cancelPendingViewport, flushPending: flushPendingViewport });

  if (bridge()) bind(); else window.addEventListener('di:app-state-ready', bind, { once: true });
})();