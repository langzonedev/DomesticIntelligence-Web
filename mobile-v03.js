(function () {
  'use strict';

  const MOBILE_QUERY = '(max-width: 760px)';
  const PORTRAIT_WIDTH = 800;
  const PORTRAIT_HEIGHT = 1200;
  const DEFAULT_ADDRESS = '12 Willow Street, Adelaide SA 5000';
  const THEME_KEY = 'domestic-intelligence-theme-v2';

  const originalCore = window.DIEditorCore;
  const originalStore = window.DIStorage;
  if (!originalCore || !originalStore) return;

  let addressOverride = null;
  let editSnapshot = null;
  let floorSnapshot = null;
  let bypassEditCapture = false;

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function isMobile() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function ensurePortrait(state) {
    if (!state || !state.map) return state;
    const next = clone(state);
    const map = next.map;
    if (map.orientation === 'portrait-v03' || Number(map.height) > Number(map.width)) {
      map.orientation = 'portrait-v03';
      return next;
    }

    const sourceWidth = Number(map.width) || 1200;
    const sourceHeight = Number(map.height) || 800;
    const sx = PORTRAIT_WIDTH / sourceWidth;
    const sy = PORTRAIT_HEIGHT / sourceHeight;

    map.width = PORTRAIT_WIDTH;
    map.height = PORTRAIT_HEIGHT;
    map.orientation = 'portrait-v03';
    map.walls = (map.walls || []).map(wall => ({
      ...wall,
      x1: Number(wall.x1) * sx,
      y1: Number(wall.y1) * sy,
      x2: Number(wall.x2) * sx,
      y2: Number(wall.y2) * sy
    }));
    map.points = (map.points || []).map(point => ({
      ...point,
      x: Number(point.x) * sx,
      y: Number(point.y) * sy
    }));
    if (map.floorplan && map.floorplan.transform) {
      map.floorplan.transform = {
        ...map.floorplan.transform,
        x: Number(map.floorplan.transform.x || 0) * sx,
        y: Number(map.floorplan.transform.y || 0) * sy
      };
    }
    return next;
  }

  function enhanceState(state) {
    const next = ensurePortrait(state);
    if (!next.home) next.home = {};
    next.home.address = String(addressOverride || next.home.address || DEFAULT_ADDRESS).trim();
    return next;
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
      const enhanced = enhanceState(state);
      addressOverride = enhanced.home.address;
      return enhanced;
    },
    async saveState(state) {
      const enhanced = enhanceState(state);
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

  function setMobileEditMode(active) {
    document.body.classList.toggle('mobile-floor-edit', Boolean(active && isMobile()));
    const bar = document.querySelector('#mobileEditSessionBar');
    if (bar) bar.hidden = !active || !isMobile();
  }

  function ensureMobileEditBar() {
    const mapCard = document.querySelector('.map-card');
    if (!mapCard || document.querySelector('#mobileEditSessionBar')) return;
    const bar = document.createElement('div');
    bar.id = 'mobileEditSessionBar';
    bar.className = 'mobile-edit-session-bar';
    bar.hidden = true;
    bar.innerHTML = '<strong>Edit floor plan</strong><span class="mobile-edit-actions"><button id="mobileEditCancel" type="button" class="quiet-action">Cancel</button><button id="mobileEditSave" type="button" class="primary-action">Save</button></span>';
    mapCard.prepend(bar);

    bar.querySelector('#mobileEditSave').addEventListener('click', () => {
      editSnapshot = null;
      floorSnapshot = null;
      const viewButton = document.querySelector('[data-editor-mode="view"]');
      if (viewButton) viewButton.click();
      setMobileEditMode(false);
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
    button.textContent = 'Back to floor plan';
    button.addEventListener('click', () => {
      document.body.classList.remove('mobile-point-detail');
      const selected = document.querySelector('.device-point.selected');
      selected?.focus();
    });
    inspector.prepend(button);
  }

  async function ensureAddressEditor() {
    const heading = document.querySelector('.project-heading > div:first-child');
    if (!heading || document.querySelector('#residenceAddress')) return;
    let state = null;
    try { state = await enhancedStore.loadState(); } catch (_) {}
    const address = state?.home?.address || DEFAULT_ADDRESS;
    addressOverride = address;

    const wrapper = document.createElement('form');
    wrapper.className = 'address-editor';
    wrapper.innerHTML = `<label for="residenceAddress">Residence address</label><div class="address-editor-row"><input id="residenceAddress" name="address" maxlength="160" autocomplete="street-address" value="${String(address).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"><button class="quiet-action" type="submit">Save address</button></div>`;
    heading.append(wrapper);

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
      }).catch(error => {
        console.error('Could not start transactional mobile edit session', error);
      });
      return;
    }

    const point = event.target.closest('[data-point]');
    const viewMode = document.querySelector('[data-editor-mode="view"]')?.classList.contains('active');
    if (point && isMobile() && viewMode) {
      setTimeout(() => document.body.classList.add('mobile-point-detail'), 0);
    }
  }, true);

  window.addEventListener('popstate', () => {
    if (document.body.classList.contains('mobile-point-detail')) {
      document.body.classList.remove('mobile-point-detail');
    }
  });

  window.addEventListener('resize', () => {
    if (!isMobile()) {
      document.body.classList.remove('mobile-floor-edit', 'mobile-point-detail');
    }
    syncCanvasDimensions();
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeColor);

  window.addEventListener('load', () => {
    syncThemeColor();
    syncCanvasDimensions();
    ensureMobileEditBar();
    ensurePointCloseButton();
    ensureAddressEditor();
    const observer = new MutationObserver(syncCanvasDimensions);
    const stage = document.querySelector('#mapStage');
    if (stage) observer.observe(stage, { childList: true, subtree: true });
  });
})();