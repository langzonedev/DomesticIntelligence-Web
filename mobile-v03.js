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
  const Property = window.DIPropertyModel;
  if (!originalCore || !originalStore || !Property) return;

  let addressOverride = null;
  let editSession = null;
  let activeFloorId = 'ground';
  let bypassEditCapture = false;
  let planInspectorHome = null;

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function isMobile() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  let wasMobileViewport = isMobile();

  function floorIdFor(state) {
    return String(state?.home?.activeFloorId || activeFloorId || 'ground');
  }

  function portraitMap(map) {
    return Property.portraitMap(map);
  }

  function blankMap(template) {
    return Property.blankMap(template);
  }

  function ensureHomeMetadata(state, options = {}) {
    const next = Property.normalisePropertyState(state, { loadActiveFloor: Boolean(options.loadActiveMap) });
    if (addressOverride) next.home.address = addressOverride;
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
      return enhanceState(value);
    }
  });

  const enhancedStore = {
    ...originalStore,
    async loadState() {
      if (editSession?.active && editSession.draftState) return clone(editSession.draftState);
      const state = await originalStore.loadState();
      if (!state) return null;
      const enhanced = ensureHomeMetadata(state, { loadActiveMap: true });
      addressOverride = enhanced.home.address;
      activeFloorId = floorIdFor(enhanced);
      return enhanced;
    },
    async saveState(state) {
      const enhanced = ensureHomeMetadata(state, { loadActiveMap: false });
      if (addressOverride) enhanced.home.address = addressOverride;
      activeFloorId = floorIdFor(enhanced);
      if (editSession?.active) {
        editSession.draftState = clone(enhanced);
        return { storage: 'memory', staged: true };
      }
      return originalStore.saveState(enhanced);
    },
    async saveFloorPlan(file, metadata = {}) {
      const validation = originalStore.validateFloorPlan(file);
      if (!validation.ok) throw new Error(validation.error);
      if (editSession?.active) {
        editSession.stagedPlan = {
          action: 'save',
          file,
          metadata: clone(metadata),
          record: { ...clone(metadata), name: metadata.name || file.name || 'Floor plan', type: validation.type, size: validation.size, blob: file }
        };
        return { storage: 'memory', staged: true, metadata: editSession.stagedPlan.record };
      }
      return originalStore.saveFloorPlan(file, metadata, activeFloorId);
    },
    async loadFloorPlan() {
      if (editSession?.active && editSession.stagedPlan) {
        return editSession.stagedPlan.action === 'remove' ? null : editSession.stagedPlan.record;
      }
      const scoped = await originalStore.loadFloorPlan(activeFloorId, { migrateLegacy: false });
      if (scoped) return scoped;
      const legacy = await originalStore.loadFloorPlan();
      if (!legacy) return null;
      const rawState = editSession?.draftState || await originalStore.loadState().catch(() => null);
      const ownerFloorId = Property.chooseLegacyFloorPlanOwner(rawState || window.DIEditorCore.createInitialState(), legacy);
      const migrated = await originalStore.migrateLegacyFloorPlan(ownerFloorId);
      return ownerFloorId === activeFloorId ? migrated : originalStore.loadFloorPlan(activeFloorId, { migrateLegacy: false });
    },
    async removeFloorPlan() {
      if (editSession?.active) {
        editSession.stagedPlan = { action: 'remove' };
        return { storage: 'memory', staged: true };
      }
      return originalStore.removeFloorPlan(activeFloorId);
    },
    async clearAll() {
      addressOverride = null;
      editSession = null;
      const state = await originalStore.loadState().catch(() => null);
      const floorIds = state?.home?.floors?.map(floor => floor?.id).filter(Boolean) || [];
      return originalStore.clearAll(floorIds);
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
      button.tabIndex = selected ? 0 : -1;
    });
  }

  function enhanceSearchableSelect(select) {
    select.dataset.inlineEnhanced = 'true';
    select.classList.add('inline-select-source');
    select.setAttribute('aria-hidden', 'true');
    select.tabIndex = -1;

    const picker = document.createElement('div');
    picker.className = 'searchable-choice-picker';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'searchable-choice-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const panel = document.createElement('div');
    panel.className = 'searchable-choice-panel';
    panel.hidden = true;
    const searchLabel = document.createElement('label');
    searchLabel.className = 'searchable-choice-search';
    searchLabel.textContent = `Search ${labelForSelect(select).toLowerCase()} `;
    const search = document.createElement('input');
    search.type = 'search';
    search.autocomplete = 'off';
    const list = document.createElement('div');
    list.className = 'searchable-choice-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', labelForSelect(select));
    searchLabel.append(search);
    panel.append(searchLabel, list);
    picker.append(trigger, panel);

    function sync() {
      trigger.textContent = select.selectedOptions[0]?.textContent || 'Choose';
      const options = [...list.querySelectorAll('[role="option"]:not(:disabled)')];
      options.forEach(option => {
        const selected = option.dataset.value === select.value;
        option.setAttribute('aria-selected', String(selected));
        option.tabIndex = selected ? 0 : -1;
      });
      if (options.length && !options.some(option => option.tabIndex === 0)) options[0].tabIndex = 0;
    }
    function closePicker({ restoreFocus = true } = {}) {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus) trigger.focus();
    }
    function optionButtons() {
      return [...list.querySelectorAll('[role="option"]:not(:disabled)')];
    }
    function moveOptionFocus(current, key) {
      const options = optionButtons();
      if (!options.length) return false;
      const index = Math.max(0, options.indexOf(current));
      let next = null;
      if (key === 'ArrowDown') next = options[(index + 1) % options.length];
      if (key === 'ArrowUp') next = options[(index - 1 + options.length) % options.length];
      if (key === 'Home') next = options[0];
      if (key === 'End') next = options.at(-1);
      if (!next) return false;
      options.forEach(option => { option.tabIndex = option === next ? 0 : -1; });
      next.focus();
      return true;
    }
    function renderOptions() {
      const query = search.value.trim().toLowerCase();
      list.replaceChildren();
      [...select.options].filter(option => !query || option.textContent.toLowerCase().includes(query)).forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'searchable-choice-option';
        button.dataset.value = option.value;
        button.setAttribute('role', 'option');
        button.textContent = option.textContent;
        button.disabled = option.disabled;
        button.addEventListener('click', () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          closePicker();
        });
        button.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            button.click();
            return;
          }
          if (moveOptionFocus(button, event.key)) event.preventDefault();
        });
        list.append(button);
      });
      sync();
    }
    trigger.addEventListener('click', () => {
      const opening = panel.hidden;
      panel.hidden = !opening;
      trigger.setAttribute('aria-expanded', String(opening));
      if (opening) { search.value = ''; renderOptions(); search.focus(); }
    });
    trigger.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      if (panel.hidden) trigger.click();
      const options = optionButtons();
      const target = options.find(option => option.getAttribute('aria-selected') === 'true') || (event.key === 'ArrowUp' ? options.at(-1) : options[0]);
      if (target) { options.forEach(option => { option.tabIndex = option === target ? 0 : -1; }); target.focus(); }
    });
    search.addEventListener('input', renderOptions);
    search.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
      const options = optionButtons();
      const target = event.key === 'ArrowUp' || event.key === 'End' ? options.at(-1) : options[0];
      if (!target) return;
      event.preventDefault();
      options.forEach(option => { option.tabIndex = option === target ? 0 : -1; });
      target.focus();
    });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); closePicker();
    });
    select.addEventListener('change', sync);
    select.insertAdjacentElement('afterend', picker);
    renderOptions();
  }

  function enhanceSelect(select) {
    if (!select || select.dataset.inlineEnhanced === 'true' || select.id === 'themeSelect') return;
    if (select.multiple || !select.options.length) return;
    if (select.options.length > 6) {
      enhanceSearchableSelect(select);
      return;
    }
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
      button.addEventListener('keydown', event => {
        const buttons = [...group.querySelectorAll('[role="radio"]:not(:disabled)')];
        const index = buttons.indexOf(button);
        let next = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = buttons[(index + 1) % buttons.length];
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = buttons[(index - 1 + buttons.length) % buttons.length];
        if (event.key === 'Home') next = buttons[0];
        if (event.key === 'End') next = buttons.at(-1);
        if (!next) return;
        event.preventDefault(); next.click(); next.focus();
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

  async function restoreFloorRecord(record, floorId) {
    if (!record) {
      await originalStore.removeFloorPlan(floorId);
      return;
    }
    let file = record.blob;
    if (!file && record.dataUrl) {
      const blob = await fetch(record.dataUrl).then(response => response.blob());
      file = new File([blob], record.name || 'Floor plan', { type: record.type || blob.type });
    }
    if (file) {
      await originalStore.saveFloorPlan(file, { name: record.name, transform: record.transform || null }, floorId);
    }
  }

  async function beginEditSession() {
    const runtimeState = window.DIAppBridge?.getState?.();
    const state = runtimeState || await enhancedStore.loadState() || window.DIEditorCore.createInitialState();
    activeFloorId = floorIdFor(state);
    const plan = await enhancedStore.loadFloorPlan();
    editSession = {
      active: true,
      floorId: activeFloorId,
      stateSnapshot: clone(state),
      floorSnapshot: plan || null,
      draftState: clone(state),
      stagedPlan: null
    };
    window.DIAppBridge?.cancelScheduledSave?.();
    return editSession;
  }

  async function commitEditSession() {
    if (!editSession?.active) return;
    const session = editSession;
    const draft = ensureHomeMetadata(window.DIAppBridge?.getState?.() || session.draftState, { loadActiveMap: false });
    draft.workspaceMode = 'view';
    window.DIAppBridge?.cancelScheduledSave?.();
    try {
      if (session.stagedPlan?.action === 'save') {
        await originalStore.saveFloorPlan(session.stagedPlan.file, session.stagedPlan.metadata, session.floorId);
      } else if (session.stagedPlan?.action === 'remove') {
        await originalStore.removeFloorPlan(session.floorId);
      }
      await originalStore.saveState(draft);
      editSession = null;
      window.DIAppBridge?.replaceRuntimeState?.(draft);
    } catch (error) {
      try {
        await restoreFloorRecord(session.floorSnapshot, session.floorId);
        await originalStore.saveState(session.stateSnapshot);
      } catch (rollbackError) {
        console.error('Could not restore the pre-edit snapshot', rollbackError);
      }
      throw error;
    }
  }

  async function cancelEditSession() {
    if (!editSession?.active) return;
    const session = editSession;
    window.DIAppBridge?.cancelScheduledSave?.();
    try {
      await originalStore.saveState(session.stateSnapshot);
      await restoreFloorRecord(session.floorSnapshot, session.floorId);
      editSession = null;
      location.reload();
    } catch (error) {
      console.error('Could not cancel floor-plan edit session', error);
      alert('The edit session could not be rolled back safely. Reload the app before making further changes.');
      throw error;
    }
  }

  window.DIMobileEditSession = Object.freeze({
    isActive: () => Boolean(editSession?.active),
    cancelFromHistory: () => cancelEditSession(),
    cancel: () => cancelEditSession(),
    save: () => commitEditSession()
  });

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

    bar.querySelector('#mobileEditSave').addEventListener('click', async () => {
      const button = bar.querySelector('#mobileEditSave');
      button.disabled = true;
      button.textContent = 'Saving…';
      try {
        await commitEditSession();
        history.replaceState({ mobileSection: 'plan' }, '', '#plan');
        setMobileEditMode(false);
        document.querySelector('#mapStage')?.focus();
      } catch (error) {
        console.error('Could not save floor-plan edit session', error);
        alert(`The edit session was not saved: ${error.message}`);
      } finally {
        button.disabled = false;
        button.textContent = 'Save';
      }
    });

    bar.querySelector('#mobileEditCancel').addEventListener('click', async () => {
      if (!editSession?.active) {
        const viewButton = document.querySelector('[data-editor-mode="view"]');
        if (viewButton) viewButton.click();
        setMobileEditMode(false);
        return;
      }
      try {
        await cancelEditSession();
      } catch (error) {
        // cancelEditSession already surfaced the rollback failure.
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
        if (window.DIMobileDetail?.isOpen?.()) window.DIMobileDetail.close();
        else {
          document.body.classList.remove('mobile-point-detail', 'mobile-new-device-detail');
          document.querySelector('#mapStage')?.focus();
        }
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
    section.replaceChildren();
    const heading = document.createElement('div');
    heading.className = 'floor-control-heading';
    const title = document.createElement('strong');
    title.textContent = 'Storey';
    const addButton = document.createElement('button');
    addButton.id = 'addFloorButton';
    addButton.type = 'button';
    addButton.className = 'quiet-action';
    addButton.textContent = '+ Add storey';
    heading.append(title, addButton);
    const group = document.createElement('div');
    group.className = 'floor-choice-group';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Current storey');
    floors.forEach(floor => {
      const selected = floor.id === state.home.activeFloorId;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `floor-choice${selected ? ' selected' : ''}`;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.dataset.floorId = floor.id;
      button.textContent = floor.name;
      group.append(button);
    });
    section.append(heading, group);

    section.querySelectorAll('[data-floor-id]').forEach(button => {
      button.addEventListener('click', async () => {
      if (button.dataset.floorId === state.home.activeFloorId) return;
      const fresh = await enhancedStore.loadState() || state;
      const switched = Property.activateFloor(fresh, button.dataset.floorId);
      await originalStore.saveState(switched);
      location.reload();
      });
      button.addEventListener('keydown', event => {
        const buttons = [...group.querySelectorAll('[role="radio"]')];
        const index = buttons.indexOf(button);
        let next = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = buttons[(index + 1) % buttons.length];
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = buttons[(index - 1 + buttons.length) % buttons.length];
        if (event.key === 'Home') next = buttons[0];
        if (event.key === 'End') next = buttons.at(-1);
        if (!next) return;
        event.preventDefault();
        next.focus();
        next.click();
      });
    });

    section.querySelector('#addFloorButton')?.addEventListener('click', async () => {
      const fresh = await enhancedStore.loadState() || state;
      const number = fresh.home.floors.length;
      const id = `level-${Date.now().toString(36)}`;
      const floor = { id, name: `Level ${number}`, map: blankMap(fresh.map) };
      fresh.home.floors.push(floor);
      const switched = Property.activateFloor(fresh, id);
      await originalStore.saveState(switched);
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
    const projectName = document.querySelector('#projectName');
    if (projectName) projectName.textContent = address;

    const display = document.createElement('p');
    display.id = 'projectAddressDisplay';
    display.className = 'project-address-display';
    display.textContent = address;

    const wrapper = document.createElement('form');
    wrapper.className = 'address-editor';
    wrapper.innerHTML = `<label for="residenceAddress">Residence address</label><div class="address-editor-row"><input id="residenceAddress" name="address" maxlength="160" autocomplete="street-address" value="${String(address).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"><button class="quiet-action" type="submit">Save address</button></div>`;
    heading.append(display, wrapper);
    window.dispatchEvent(new CustomEvent('di:address-editor-ready'));

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
        window.DIAppBridge?.replaceRuntimeState?.(current);
        display.textContent = value;
        if (projectName) projectName.textContent = value;
        window.dispatchEvent(new CustomEvent('di:app-state-ready'));
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
      beginEditSession().then(() => {
        setMobileEditMode(true);
        history.pushState({ mobileSection: 'plan', overlay: 'edit' }, '', '#plan-edit');
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
    const mobileNow = isMobile();
    if (wasMobileViewport && !mobileNow && editSession?.active) {
      wasMobileViewport = mobileNow;
      syncCanvasDimensions();
      void cancelEditSession();
      return;
    }
    wasMobileViewport = mobileNow;
    if (!mobileNow) {
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
