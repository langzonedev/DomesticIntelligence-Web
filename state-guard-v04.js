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
        .mobile-map-controls-toggle{display:none;width:calc(100% - 20px);min-height:46px;margin:8px 10px 6px;padding:8px 12px;border:1px solid var(--di-border,var(--border,#36554c));border-radius:14px;background:color-mix(in srgb,var(--di-surface,var(--surface,#fff)) 94%,transparent);color:var(--di-text,inherit);font:inherit;text-align:left;align-items:center;justify-content:space-between;gap:12px;box-shadow:0 8px 24px rgb(5 3 12 / 16%)}
        body.mobile-section-plan .mobile-map-controls-toggle{display:flex}
        .mobile-map-controls-toggle strong{display:block;font-size:.94rem;line-height:1.15}
        .mobile-map-controls-toggle small{display:block;margin-top:2px;color:var(--di-muted,var(--muted,#91a79f));font-size:.72rem;font-weight:650}
        .mobile-map-controls-toggle .mobile-map-controls-chevron{font-size:1.2rem;color:var(--di-muted,var(--muted,#91a79f));transition:transform .18s ease}
        body.mobile-map-controls-open .mobile-map-controls-toggle .mobile-map-controls-chevron{transform:rotate(180deg)}
        body.mobile-section-plan.mobile-map-controls-collapsed .mobile-plan-floors{display:none!important}
        body.mobile-section-plan.mobile-map-controls-collapsed .workspace-controls .editor-mode-bar{display:none!important}
        body.mobile-section-plan.mobile-map-controls-collapsed .workspace-controls .atlas-commandbar{display:none!important}
        body.mobile-section-plan:not(.mobile-map-controls-collapsed) .mobile-plan-floors{padding-block:4px!important;margin-block:0!important}
        body.mobile-section-plan:not(.mobile-map-controls-collapsed) .floor-choice{min-height:40px!important;padding-block:6px!important}
        body.mobile-section-plan:not(.mobile-map-controls-collapsed) .editor-mode-bar{margin-block:0 4px!important;padding-block:4px!important}
        body.mobile-section-plan:not(.mobile-map-controls-collapsed) .editor-mode-bar .segmented button{min-height:42px!important;padding-block:6px!important}
        body.mobile-section-plan:not(.mobile-map-controls-collapsed) .atlas-commandbar{padding-block:4px!important;margin-block:0 4px!important}
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

  window.addEventListener('di:app-state-ready', installCompactMobileMapControls, { once: true });
})();