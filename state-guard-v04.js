(function () {
  'use strict';

  const Store = window.DIStorage;
  if (!Store) return;

  const ROOM_LIBRARY = Object.freeze([
    ['kitchen','Kitchen'],['living','Living room'],['bedroom','Main bedroom'],['entry','Front entry'],
    ['room-dining','Dining room'],['room-family','Family room'],['room-lounge','Lounge'],['room-pantry','Pantry'],
    ['room-butlers-pantry',"Butler's pantry"],['room-bedroom','Bedroom'],['room-guest-bedroom','Guest bedroom'],['room-nursery','Nursery'],
    ['room-study','Study / Home office'],['room-bathroom','Bathroom'],['room-ensuite','Ensuite'],['room-powder','Powder room'],
    ['room-wc','Toilet / WC'],['room-laundry','Laundry'],['room-mudroom','Mudroom'],['room-hallway','Hallway'],
    ['room-stairwell','Stairwell'],['room-landing','Landing'],['room-walk-in-robe','Walk-in robe'],['room-built-in-robe','Built-in robe'],
    ['room-theatre','Theatre / Media room'],['room-games','Games / Rumpus room'],['room-gym','Gym'],['room-sunroom','Sunroom'],
    ['room-conservatory','Conservatory'],['room-garage','Garage'],['room-carport','Carport'],['room-workshop','Workshop'],
    ['room-store','Store room'],['room-utility','Plant / Utility room'],['room-network','Server / Network cupboard'],['room-attic','Roof space / Attic'],
    ['room-basement','Basement / Cellar'],['room-balcony','Balcony'],['room-verandah','Verandah / Porch'],['room-alfresco','Patio / Alfresco'],
    ['room-deck','Deck'],['room-courtyard','Courtyard'],['room-pool','Pool area'],['room-shed','Shed'],['room-other','Other']
  ]);

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function ensureRoomLibrary(rooms) {
    const next = Array.isArray(rooms) ? rooms.slice() : [];
    const knownIds = new Set(next.map(room => room?.id).filter(Boolean));
    const knownNames = new Set(next.map(room => String(room?.name || '').trim().toLowerCase()).filter(Boolean));
    ROOM_LIBRARY.forEach(([id, name]) => {
      if (knownIds.has(id) || knownNames.has(name.toLowerCase())) return;
      next.push({ id, name });
      knownIds.add(id);
      knownNames.add(name.toLowerCase());
    });
    return next;
  }

  function sanitize(state) {
    if (!state || typeof state !== 'object' || !state.map) return state;
    const next = clone(state);
    next.rooms = ensureRoomLibrary(next.rooms);
    const rooms = next.rooms;
    const walls = Array.isArray(next.map.walls) ? next.map.walls : [];
    const points = Array.isArray(next.map.points) ? next.map.points : [];
    if (!next.selected || typeof next.selected !== 'object') next.selected = { roomId: null, wallId: null, pointId: null };

    if (!walls.some(wall => wall.id === next.selected.wallId)) next.selected.wallId = null;
    if (!points.some(point => point.id === next.selected.pointId)) next.selected.pointId = points[0]?.id || null;

    const selectedPoint = points.find(point => point.id === next.selected.pointId);
    if (selectedPoint?.roomId && rooms.some(room => room.id === selectedPoint.roomId)) next.selected.roomId = selectedPoint.roomId;
    else if (!rooms.some(room => room.id === next.selected.roomId)) next.selected.roomId = rooms[0]?.id || null;

    return next;
  }

  window.DIStorage = Object.freeze({
    ...Store,
    async loadState() {
      return sanitize(await Store.loadState());
    },
    async saveState(state) {
      return Store.saveState(sanitize(state));
    }
  });

  function installCompactMobileMapControls() {
    if (document.querySelector('#mobileMapControlsToggle')) return;
    const floorControls = document.querySelector('.mobile-plan-floors');
    const commission = document.querySelector('#commissionView');
    if (!floorControls || !commission) return;

    const style = document.createElement('style');
    style.id = 'di-mobile-map-controls-style';
    style.textContent = `
      @media (max-width:760px){
        body.mobile-section-plan .mobile-top-appbar{display:none!important}
        body.mobile-section-plan{padding-top:env(safe-area-inset-top)!important}
        .mobile-map-controls-toggle{display:none;width:calc(100% - 16px);min-height:44px;margin:6px 8px 4px;padding:7px 11px;border:1px solid var(--di-border,var(--border,#36554c));border-radius:14px;background:color-mix(in srgb,var(--di-surface,var(--surface,#fff)) 94%,transparent);color:var(--di-text,inherit);font:inherit;text-align:left;align-items:center;justify-content:space-between;gap:12px;box-shadow:0 8px 24px rgb(5 3 12 / 16%)}
        body.mobile-section-plan .mobile-map-controls-toggle{display:flex}
        .mobile-map-controls-toggle strong{display:block;font-size:.94rem;line-height:1.15}
        .mobile-map-controls-toggle small{display:block;margin-top:1px;color:var(--di-muted,var(--muted,#91a79f));font-size:.7rem;font-weight:650}
        .mobile-map-controls-toggle .mobile-map-controls-chevron{font-size:1.2rem;color:var(--di-muted,var(--muted,#91a79f));transition:transform .18s ease}
        body.mobile-map-controls-open .mobile-map-controls-toggle .mobile-map-controls-chevron{transform:rotate(180deg)}
        body.mobile-section-plan.mobile-map-controls-collapsed .mobile-plan-floors{display:none!important}
        body.mobile-section-plan.mobile-map-controls-collapsed .workspace-controls .editor-mode-bar{display:none!important}
        body.mobile-section-plan.mobile-map-controls-collapsed .workspace-controls .atlas-commandbar{display:none!important}
        body.mobile-section-plan:not(.mobile-map-controls-collapsed) .mobile-plan-floors{padding-block:3px!important;margin-block:0!important}
        body.mobile-section-plan:not(.mobile-map-controls-collapsed) .floor-choice{min-height:40px!important;padding-block:6px!important}
        body.mobile-section-plan:not(.mobile-map-controls-collapsed) .editor-mode-bar{margin-block:0 3px!important;padding-block:3px!important}
        body.mobile-section-plan:not(.mobile-map-controls-collapsed) .editor-mode-bar .segmented button{min-height:42px!important;padding-block:6px!important}
        body.mobile-section-plan:not(.mobile-map-controls-collapsed) .atlas-commandbar{padding-block:3px!important;margin-block:0 3px!important}
        body.mobile-section-plan:not(.mobile-map-controls-collapsed) .atlas-commandbar button{min-height:42px!important}
      }
    `;
    document.head.append(style);

    const button = document.createElement('button');
    button.id = 'mobileMapControlsToggle';
    button.type = 'button';
    button.className = 'mobile-map-controls-toggle';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'floorControls');
    button.innerHTML = '<span><strong id="mobileMapControlsLabel">Ground floor · View</strong><small>Map controls</small></span><span class="mobile-map-controls-chevron" aria-hidden="true">⌄</span>';
    floorControls.insertAdjacentElement('beforebegin', button);

    let previousMode = null;
    let open = false;
    const apply = state => {
      const mode = state?.workspaceMode === 'edit' ? 'Edit map' : 'View';
      const floor = state?.home?.floors?.find(item => item.id === state.home.activeFloorId)?.name || 'Current floor';
      const label = document.querySelector('#mobileMapControlsLabel');
      if (label) label.textContent = `${floor} · ${mode}`;
      if (mode === 'Edit map') open = true;
      else if (previousMode === 'Edit map') open = false;
      previousMode = mode;
      document.body.classList.toggle('mobile-map-controls-open', open);
      document.body.classList.toggle('mobile-map-controls-collapsed', !open);
      button.setAttribute('aria-expanded', String(open));
    };

    button.addEventListener('click', () => {
      open = !open;
      document.body.classList.toggle('mobile-map-controls-open', open);
      document.body.classList.toggle('mobile-map-controls-collapsed', !open);
      button.setAttribute('aria-expanded', String(open));
    });

    window.addEventListener('di:render', event => apply(event.detail?.state || window.DIAppBridge?.getState?.()));
    apply(window.DIAppBridge?.getState?.());
  }

  function installConsistentRoomPicker() {
    const select = document.querySelector('#pointForm select[name="room"]');
    if (!select || select.dataset.diRoomPicker === 'true') return;

    const existing = select.nextElementSibling;
    if (existing?.classList.contains('inline-choice-group') || existing?.classList.contains('searchable-choice-picker')) existing.remove();
    select.dataset.inlineEnhanced = 'true';
    select.dataset.diRoomPicker = 'true';
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
    searchLabel.textContent = 'Search room ';
    const search = document.createElement('input');
    search.type = 'search';
    search.autocomplete = 'off';
    const list = document.createElement('div');
    list.className = 'searchable-choice-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Room');
    searchLabel.append(search);
    panel.append(searchLabel, list);
    picker.append(trigger, panel);
    select.insertAdjacentElement('afterend', picker);

    const syncTrigger = () => {
      trigger.textContent = select.selectedOptions[0]?.textContent || 'Choose room';
    };
    const renderOptions = () => {
      const query = search.value.trim().toLowerCase();
      list.replaceChildren();
      [...select.options].filter(option => !query || option.textContent.toLowerCase().includes(query)).forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'searchable-choice-option';
        button.dataset.value = option.value;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(option.value === select.value));
        button.textContent = option.textContent;
        button.disabled = option.disabled;
        button.addEventListener('click', () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          panel.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
          syncTrigger();
          trigger.focus();
        });
        list.append(button);
      });
    };

    trigger.addEventListener('click', () => {
      const opening = panel.hidden;
      panel.hidden = !opening;
      trigger.setAttribute('aria-expanded', String(opening));
      if (opening) {
        search.value = '';
        renderOptions();
        search.focus();
      }
    });
    search.addEventListener('input', renderOptions);
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    });
    select.addEventListener('change', syncTrigger);
    window.addEventListener('di:render', () => {
      syncTrigger();
      if (!panel.hidden) renderOptions();
    });
    syncTrigger();
  }

  function installDeviceSaveAndClose() {
    const form = document.querySelector('#pointForm');
    if (!form || form.dataset.diSaveCloseBound === 'true') return;
    form.dataset.diSaveCloseBound = 'true';
    form.addEventListener('submit', () => {
      setTimeout(() => {
        if (!matchMedia('(max-width: 760px), (max-height: 500px) and (max-width: 950px), (orientation: landscape) and (pointer: coarse) and (max-width: 950px)').matches) return;
        if (form.querySelector('[aria-invalid="true"]')) return;
        if (!window.DIMobileDetail?.isOpen?.()) return;
        window.DIMobileDetail.close({ restoreFocus: true });
        const summary = document.querySelector('#mobileDeviceSummary');
        if (summary) summary.hidden = true;
        if (location.hash === '#plan-device' || location.hash === '#plan-new-device') history.back();
        else history.replaceState({ mobileSection: 'plan' }, '', '#plan');
      }, 0);
    });
  }

  function installMobileObjectDelete() {
    const editBar = document.querySelector('#mobileEditSessionBar .mobile-edit-actions');
    if (!editBar || document.querySelector('#mobileDeleteObject')) return;

    const button = document.createElement('button');
    button.id = 'mobileDeleteObject';
    button.type = 'button';
    button.className = 'quiet-action danger-text';
    button.textContent = 'Delete';
    button.hidden = true;
    editBar.insertBefore(button, document.querySelector('#mobileEditCancel'));

    const sync = (state, selection) => {
      const editing = state?.workspaceMode === 'edit' && document.body.classList.contains('mobile-floor-edit');
      const removable = editing && selection?.id && (selection.type === 'wall' || selection.type === 'point');
      button.hidden = !removable;
      button.disabled = !removable;
      if (removable) {
        button.setAttribute('aria-label', selection.type === 'wall' ? 'Delete selected wall' : 'Delete selected device');
        button.title = selection.type === 'wall' ? 'Delete selected wall' : 'Delete selected device';
      }
    };

    button.addEventListener('click', () => {
      const bridge = window.DIAppBridge;
      const state = bridge?.getState?.();
      const selection = bridge?.getSelection?.();
      if (!state || state.workspaceMode !== 'edit' || !selection?.id) return;

      if (selection.type === 'wall') {
        if (state.map.layerLocks?.walls) {
          bridge.notify?.('Unlock the Walls layer before removing a wall.');
          return;
        }
        if (!confirm('Remove this wall? Cancel the edit session to restore it, or Save to keep the deletion.')) return;
        bridge.commitState?.(window.DIEditorCore.removeWall(state, selection.id), 'Wall removed.');
      } else if (selection.type === 'point') {
        if (state.map.layerLocks?.devices) {
          bridge.notify?.('Unlock the Devices layer before removing a device.');
          return;
        }
        if (!confirm('Remove this device? Cancel the edit session to restore it, or Save to keep the deletion.')) return;
        bridge.commitState?.(window.DIEditorCore.removePoint(state, selection.id), 'Device removed.');
      } else return;

      bridge.selectSpatial?.(null, null, {});
      sync(bridge.getState?.(), bridge.getSelection?.());
      document.querySelector('#mapStage')?.focus();
    });

    window.addEventListener('di:render', event => sync(event.detail?.state || window.DIAppBridge?.getState?.(), event.detail?.selection || window.DIAppBridge?.getSelection?.()));
    sync(window.DIAppBridge?.getState?.(), window.DIAppBridge?.getSelection?.());
  }

  window.addEventListener('di:app-state-ready', () => {
    installCompactMobileMapControls();
    setTimeout(installConsistentRoomPicker, 0);
    setTimeout(installDeviceSaveAndClose, 0);
    setTimeout(installMobileObjectDelete, 0);
  }, { once: true });
})();