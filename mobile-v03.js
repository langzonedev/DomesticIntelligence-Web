(function () {
  'use strict';

  const MOBILE_QUERY = '(max-width: 760px)';
  const PORTRAIT_WIDTH = 800;
  const PORTRAIT_HEIGHT = 1200;
  const DEFAULT_ADDRESS = '12 Willow Street, Adelaide SA 5000';
  const THEME_KEY = 'domestic-intelligence-theme-v2';
  const EXTRA_CATEGORIES = ['CCTV', 'Appliance', 'Security', 'Networking', 'Audio / Video', 'Energy', 'EV charging', 'Smoke / CO', 'Water / Leak', 'Irrigation', 'Garage / Gate'];

  const originalCore = window.DIEditorCore;
  const originalStore = window.DIStorage;
  if (!originalCore || !originalStore) return;

  let addressOverride = null;
  let editSnapshot = null;
  let floorSnapshot = null;
  let bypassEditCapture = false;
  let planInspectorHome = null;

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function isMobile() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function portraitMap(map) {
    if (!map) return map;
    const next = clone(map);
    if (next.orientation === 'portrait-v03' || Number(next.height) > Number(next.width)) {
      next.orientation = 'portrait-v03';
      next.width = Number(next.width) || PORTRAIT_WIDTH;
      next.height = Number(next.height) || PORTRAIT_HEIGHT;
      return next;
    }

    const sourceWidth = Number(next.width) || 1200;
    const sourceHeight = Number(next.height) || 800;
    const sx = PORTRAIT_WIDTH / sourceWidth;
    const sy = PORTRAIT_HEIGHT / sourceHeight;
    next.width = PORTRAIT_WIDTH;
    next.height = PORTRAIT_HEIGHT;
    next.orientation = 'portrait-v03';
    next.walls = (next.walls || []).map(wall => ({
      ...wall,
      x1: Number(wall.x1) * sx,
      y1: Number(wall.y1) * sy,
      x2: Number(wall.x2) * sx,
      y2: Number(wall.y2) * sy
    }));
    next.points = (next.points || []).map(point => ({
      ...point,
      x: Number(point.x) * sx,
      y: Number(point.y) * sy
    }));
    if (next.floorplan && next.floorplan.transform) {
      next.floorplan.transform = {
        ...next.floorplan.transform,
        x: Number(next.floorplan.transform.x || 0) * sx,
        y: Number(next.floorplan.transform.y || 0) * sy
      };
    }
    return next;
  }

  function blankMap(template) {
    const source = portraitMap(template || {});
    return {
      width: PORTRAIT_WIDTH,
      height: PORTRAIT_HEIGHT,
      orientation: 'portrait-v03',
      gridSize: Number(source.gridSize) || 20,
      snapDistance: Number(source.snapDistance) || 14,
      layers: { floorplan: true, walls: true, devices: true, status: true, labels: true },
      floorplan: null,
      walls: [],
      points: []
    };
  }

  function ensureHomeMetadata(state, options = {}) {
    const next = clone(state);
    next.map = portraitMap(next.map);
    if (!next.home) next.home = {};
    next.home.address = String(addressOverride || next.home.address || DEFAULT_ADDRESS).trim();

    if (!Array.isArray(next.home.floors) || !next.home.floors.length) {
      next.home.floors = [{ id: 'ground', name: 'Ground floor', map: clone(next.map) }];
      next.home.activeFloorId = 'ground';
    } else {
      next.home.floors = next.home.floors.map((floor, index) => ({
        id: String(floor.id || `floor-${index}`),
        name: String(floor.name || `Level ${index}`),
        map: portraitMap(floor.map || (index === 0 ? next.map : blankMap(next.map)))
      }));
      if (!next.home.floors.some(floor => floor.id === next.home.activeFloorId)) next.home.activeFloorId = next.home.floors[0].id;
    }

    const active = next.home.floors.find(floor => floor.id === next.home.activeFloorId) || next.home.floors[0];
    if (options.loadActiveMap) next.map = clone(active.map);
    else active.map = clone(next.map);
    return next;
  }

  function enhanceState(state) {
    return ensureHomeMetadata(state, { loadActiveMap: false });
  }

  window.DIEditorCore = Object.freeze({
    ...originalCore,
    createInitialState() {
      return enhanceState(originalCore.createInitialState());
    },
    normaliseState(value) {
      return enhanceState(originalCore.normaliseState(value));
    }
  });

  const enhancedStore = {
    ...originalStore,
    async loadState() {
      const state = await originalStore.loadState();
      if (!state) return null;
      const enhanced = ensureHomeMetadata(originalCore.normaliseState(state), { loadActiveMap: true });
      addressOverride = enhanced.home.address;
      return enhanced;
    },
    async saveState(state) {
      const enhanced = ensureHomeMetadata(originalCore.normaliseState(state), { loadActiveMap: false });
      if (addressOverride) enhanced.home.address = addressOverride;
      return originalStore.saveState(enhanced);
    },
    async clearAll() {
      addressOverride = null;
      return originalStore.clearAll();
    }
  };
  window.DIStorage = Object.freeze(enhancedStore);

  try { localStorage.setItem(THEME_KEY, 'system'); } catch (_) {}
  document.documentElement.dataset.theme = 'system';

  function syncThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = matchMedia('(prefers-color-scheme: dark)').matches ? '#10231d' : '#f3f7f5';
    document.documentElement.dataset.theme = 'system';
  }

  function syncCanvasDimensions() {
    const svg = document.querySelector('#mapSvg');
    const canvas = document.querySelector('#planCanvas');
    if (svg) svg.setAttribute('viewBox', `0 0 ${PORTRAIT_WIDTH} ${PORTRAIT_HEIGHT}`);
    if (canvas) {
      if (canvas.width !== PORTRAIT_WIDTH) canvas.width = PORTRAIT_WIDTH;
      if (canvas.height !== PORTRAIT_HEIGHT) canvas.height = PORTRAIT_HEIGHT;
    }
  }

  function extendCategories() {
    const category = document.querySelector('#pointForm select[name="category"]');
    if (!category) return;
    const known = new Set([...category.options].map(option => option.value));
    EXTRA_CATEGORIES.forEach(value => {
      if (known.has(value)) return;
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      category.append(option);
    });
  }

  function labelForSelect(select) {
    if (select.getAttribute('aria-label')) return select.getAttribute('aria-label');
    const label = select.closest('label');
    if (label) {
      const text = [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).filter(Boolean).join(' ');
      if (text) return text;
    }
    return select.name || select.id || 'Choose an option';
  }

  function syncInlineChoice(select) {
    const group = select.nextElementSibling;
    if (!group || !group.classList.contains('inline-choice-group')) return;
    group.querySelectorAll('[role="radio"]').forEach(button => {
      const selected = button.dataset.value === select.value;
      button.setAttribute('aria-checked', String(selected));
      button.classList.toggle('selected', selected);
    });
  }

  function enhanceSelect(select) {
    if (!select || select.dataset.inlineEnhanced === 'true' || select.id === 'themeSelect') return;
    if (select.multiple || !select.options.length) return;
    select.dataset.inlineEnhanced = 'true';
    select.classList.add('inline-select-source');
    select.setAttribute('aria-hidden', 'true');
    select.tabIndex = -1;

    const group = document.createElement('div');
    group.className = 'inline-choice-group';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', labelForSelect(select));

    [...select.options].forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inline-choice';
      button.dataset.value = option.value;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(option.value === select.value));
      button.textContent = option.textContent;
      button.disabled = option.disabled;
      button.addEventListener('click', () => {
        select.value = option.value;
        syncInlineChoice(select);
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      group.append(button);
    });
    select.insertAdjacentElement('afterend', group);
    syncInlineChoice(select);
    select.addEventListener('change', () => syncInlineChoice(select));
  }

  function enhanceAllSelects(root = document) {
    root.querySelectorAll?.('select').forEach(enhanceSelect);
  }

  async function restoreFloorSnapshot() {
    if (!floorSnapshot) {
      await originalStore.removeFloorPlan();
      return;
    }
    let file = floorSnapshot.blob;
    if (!file && floorSnapshot.dataUrl) {
      const blob = await fetch(floorSnapshot.dataUrl).then(response => response.blob());
      file = new File([blob], floorSnapshot.name || 'Floor plan', { type: floorSnapshot.type || blob.type });
    }
    if (file) {
      await originalStore.saveFloorPlan(file, {
        name: floorSnapshot.name,
        transform: floorSnapshot.transform || null
      });
    }
  }

  function closeReferenceEditor() {
    document.body.classList.remove('mobile-reference-open');
    const inspector = document.querySelector('#planInspector');
    if (inspector && planInspectorHome && inspector.parentElement !== planInspectorHome.parent) {
      planInspectorHome.parent.insertBefore(inspector, planInspectorHome.before || null);
    }
  }

  function openReferenceEditor() {
    if (!isMobile()) return;
    const inspector = document.querySelector('#planInspector');
    const sheet = document.querySelector('#mobileReferenceSheet');
    if (!inspector || !sheet) return;
    if (!planInspectorHome) planInspectorHome = { parent: inspector.parentElement, before: inspector.nextSibling };
    const content = sheet.querySelector('.mobile-reference-content');
    content.replaceChildren();
    content.append(inspector);
    const empty = sheet.querySelector('.mobile-reference-empty');
    empty.hidden = !inspector.hidden;
    document.body.classList.add('mobile-reference-open');
  }

  function setMobileEditMode(active) {
    document.body.classList.toggle('mobile-floor-edit', Boolean(active && isMobile()));
    const bar = document.querySelector('#mobileEditSessionBar');
    if (bar) bar.hidden = !active || !isMobile();
    if (!active) closeReferenceEditor();
  }

  function ensureMobileEditBar() {
    const mapCard = document.querySelector('.map-card');
    if (!mapCard || document.querySelector('#mobileEditSessionBar')) return;
    const bar = document.createElement('div');
    bar.id = 'mobileEditSessionBar';
    bar.className = 'mobile-edit-session-bar';
    bar.hidden = true;
    bar.innerHTML = '<div><strong>Edit floor plan</strong><small>Changes are not final until Save.</small></div><span class="mobile-edit-actions"><button id="mobileReferenceButton" type="button" class="quiet-action">Reference plan</button><button id="mobileEditCancel" type="button" class="quiet-action">Cancel</button><button id="mobileEditSave" type="button" class="primary-action">Save</button></span>';
    mapCard.prepend(bar);

    const sheet = document.createElement('section');
    sheet.id = 'mobileReferenceSheet';
    sheet.className = 'mobile-reference-sheet';
    sheet.innerHTML = '<div class="mobile-reference-heading"><div><strong>Reference plan</strong><small>Scale, rotate, fade or position the imported background.</small></div><button id="mobileReferenceClose" type="button" class="quiet-action">Done</button></div><div class="mobile-reference-empty"><p>No reference plan is loaded for this prototype.</p><button id="mobileReferenceUpload" type="button" class="primary-action">Upload reference plan</button></div><div class="mobile-reference-content"></div>';
    document.body.append(sheet);

    bar.querySelector('#mobileReferenceButton').addEventListener('click', openReferenceEditor);
    sheet.querySelector('#mobileReferenceClose').addEventListener('click', closeReferenceEditor);
    sheet.querySelector('#mobileReferenceUpload').addEventListener('click', () => document.querySelector('#uploadPlanButton')?.click());

    bar.querySelector('#mobileEditSave').addEventListener('click', () => {
      editSnapshot = null;
      floorSnapshot = null;
      const viewButton = document.querySelector('[data-editor-mode="view"]');
      if (viewButton) viewButton.click();
      setMobileEditMode(false);
      document.querySelector('#mapStage')?.focus();
    });

    bar.querySelector('#mobileEditCancel').addEventListener('click', async () => {
      if (!editSnapshot) {
        const viewButton = document.querySelector('[data-editor-mode="view"]');
        if (viewButton) viewButton.click();
        setMobileEditMode(false);
        return;
      }
      try {
        const restored = clone(editSnapshot);
        restored.workspaceMode = 'view';
        await originalStore.saveState(restored);
        await restoreFloorSnapshot();
        location.reload();
      } catch (error) {
        console.error('Could not cancel floor-plan edit session', error);
        alert('The edit session could not be rolled back safely. Reload the app before making further changes.');
      }
    });
  }

  function ensurePointCloseButton() {
    const inspector = document.querySelector('.inspector-card');
    if (!inspector || document.querySelector('#mobilePointClose')) return;
    const button = document.createElement('button');
    button.id = 'mobilePointClose';
    button.type = 'button';
    button.className = 'mobile-point-close quiet-action';
    button.textContent = '← Floor plan';
    button.addEventListener('click', () => {
      document.body.classList.remove('mobile-point-detail');
      document.querySelector('#mapStage')?.focus();
    });
    inspector.prepend(button);
  }

  function ensureDeviceSaveReturn() {
    const form = document.querySelector('#pointForm');
    if (!form || form.dataset.returnBound === 'true') return;
    form.dataset.returnBound = 'true';
    form.addEventListener('submit', () => {
      setTimeout(() => {
        const toast = document.querySelector('#toast');
        if (!isMobile() || !toast || toast.textContent !== 'Device details saved.') return;
        document.body.classList.remove('mobile-point-detail');
        document.querySelector('#mapStage')?.focus();
      }, 0);
    });
  }

  function ensureFloorControls() {
    const heading = document.querySelector('.project-heading > div:first-child');
    if (!heading || document.querySelector('#floorControls')) return;
    const section = document.createElement('section');
    section.id = 'floorControls';
    section.className = 'floor-controls';
    section.setAttribute('aria-label', 'House storeys');
    heading.append(section);
    renderFloorControls();
  }

  async function renderFloorControls() {
    const section = document.querySelector('#floorControls');
    if (!section) return;
    let state;
    try { state = await enhancedStore.loadState(); } catch (_) { return; }
    if (!state) state = window.DIEditorCore.createInitialState();
    const floors = state.home.floors || [];
    section.innerHTML = `<div class="floor-control-heading"><strong>Storey</strong><button id="addFloorButton" type="button" class="quiet-action">+ Add storey</button></div><div class="floor-choice-group" role="radiogroup" aria-label="Current storey">${floors.map(floor => `<button type="button" class="floor-choice${floor.id === state.home.activeFloorId ? ' selected' : ''}" role="radio" aria-checked="${floor.id === state.home.activeFloorId}" data-floor-id="${floor.id}">${floor.name}</button>`).join('')}</div>`;

    section.querySelectorAll('[data-floor-id]').forEach(button => button.addEventListener('click', async () => {
      if (button.dataset.floorId === state.home.activeFloorId) return;
      const fresh = await enhancedStore.loadState() || state;
      fresh.home.activeFloorId = button.dataset.floorId;
      const target = fresh.home.floors.find(floor => floor.id === button.dataset.floorId);
      if (target) fresh.map = clone(target.map);
      await originalStore.saveState(fresh);
      location.reload();
    }));

    section.querySelector('#addFloorButton')?.addEventListener('click', async () => {
      const fresh = await enhancedStore.loadState() || state;
      const number = fresh.home.floors.length;
      const id = `level-${Date.now().toString(36)}`;
      const floor = { id, name: `Level ${number}`, map: blankMap(fresh.map) };
      fresh.home.floors.push(floor);
      fresh.home.activeFloorId = id;
      fresh.map = clone(floor.map);
      await originalStore.saveState(fresh);
      location.reload();
    });
  }

  async function ensureAddressEditor() {
    const heading = document.querySelector('.project-heading > div:first-child');
    if (!heading || document.querySelector('#residenceAddress')) return;
    let state = null;
    try { state = await enhancedStore.loadState(); } catch (_) {}
    const address = state?.home?.address || DEFAULT_ADDRESS;
    addressOverride = address;

    const display = document.createElement('p');
    display.id = 'projectAddressDisplay';
    display.className = 'project-address-display';
    display.textContent = address;

    const wrapper = document.createElement('form');
    wrapper.className = 'address-editor';
    wrapper.innerHTML = `<label for="residenceAddress">Residence address</label><div class="address-editor-row"><input id="residenceAddress" name="address" maxlength="160" autocomplete="street-address" value="${String(address).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"><button class="quiet-action" type="submit">Save address</button></div>`;
    heading.append(display, wrapper);

    wrapper.addEventListener('submit', async event => {
      event.preventDefault();
      const value = wrapper.elements.address.value.trim();
      if (!value) {
        wrapper.elements.address.focus();
        return;
      }
      addressOverride = value;
      try {
        const current = await enhancedStore.loadState() || window.DIEditorCore.createInitialState();
        current.home = { ...current.home, address: value };
        await enhancedStore.saveState(current);
        display.textContent = value;
        wrapper.querySelector('button').textContent = 'Saved';
        setTimeout(() => { const button = wrapper.querySelector('button'); if (button) button.textContent = 'Save address'; }, 1400);
      } catch (error) {
        console.error('Could not save residence address', error);
      }
    });
  }

  document.addEventListener('click', event => {
    const editButton = event.target.closest('[data-editor-mode="edit"]');
    if (editButton && isMobile() && !bypassEditCapture) {
      event.preventDefault();
      event.stopImmediatePropagation();
      Promise.all([enhancedStore.loadState(), originalStore.loadFloorPlan()]).then(([state, plan]) => {
        editSnapshot = clone(state || window.DIEditorCore.createInitialState());
        floorSnapshot = plan || null;
        setMobileEditMode(true);
        bypassEditCapture = true;
        editButton.click();
        bypassEditCapture = false;
      }).catch(error => console.error('Could not start transactional mobile edit session', error));
      return;
    }

    const point = event.target.closest('[data-point]');
    const viewMode = document.querySelector('[data-editor-mode="view"]')?.classList.contains('active');
    if (point && isMobile() && viewMode) setTimeout(() => document.body.classList.add('mobile-point-detail'), 0);
  }, true);

  window.addEventListener('popstate', () => {
    if (document.body.classList.contains('mobile-reference-open')) {
      closeReferenceEditor();
      return;
    }
    if (document.body.classList.contains('mobile-point-detail')) document.body.classList.remove('mobile-point-detail');
  });

  window.addEventListener('resize', () => {
    if (!isMobile()) {
      document.body.classList.remove('mobile-floor-edit', 'mobile-point-detail', 'mobile-reference-open');
      closeReferenceEditor();
    }
    syncCanvasDimensions();
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeColor);

  extendCategories();

  window.addEventListener('load', () => {
    syncThemeColor();
    syncCanvasDimensions();
    ensureMobileEditBar();
    ensurePointCloseButton();
    ensureDeviceSaveReturn();
    ensureAddressEditor();
    ensureFloorControls();
    enhanceAllSelects();

    const observer = new MutationObserver(mutations => {
      syncCanvasDimensions();
      mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        if (node.matches('select')) enhanceSelect(node);
        enhanceAllSelects(node);
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();