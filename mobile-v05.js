(function () {
  'use strict';

  const MOBILE_QUERY = '(max-width: 760px), (max-height: 500px) and (max-width: 950px), (orientation: landscape) and (pointer: coarse) and (max-width: 950px)';
  const $ = selector => document.querySelector(selector);
  const icons = {
    plan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/></svg>',
    devices: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="3"/><circle cx="12" cy="16" r="1.3"/><path d="M9 7h6M9 10h6"/></svg>',
    handover: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>'
  };

  let currentSection = 'plan';
  let floorOrigin = null;
  let addressOrigin = null;
  let overlaysBound = false;
  let detailHistoryOpen = false;
  let referenceHistoryOpen = false;
  let detailContext = null;

  function isMobile() { return matchMedia(MOBILE_QUERY).matches; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function sectionFromHash() {
    const hash = location.hash.slice(1);
    if (['plan', 'devices', 'handover', 'more'].includes(hash)) return hash;
    if (hash.startsWith('plan-')) return 'plan';
    return currentSection || 'plan';
  }

  async function getState() {
    try {
      return await window.DIStorage?.loadState() || window.DIAppBridge?.getState?.() || window.DIEditorCore?.createInitialState?.() || null;
    } catch (_) {
      return window.DIAppBridge?.getState?.() || window.DIEditorCore?.createInitialState?.() || null;
    }
  }

  function clearSectionClasses() {
    document.body.classList.remove('mobile-section-home', 'mobile-section-plan', 'mobile-section-devices', 'mobile-section-handover', 'mobile-section-more');
  }

  function syncVisibility() {
    const devices = $('#mobileDevicesView');
    const more = $('#mobileMoreView');
    if (devices) devices.hidden = currentSection !== 'devices';
    if (more) more.hidden = currentSection !== 'more';
  }

  function route(section, options = {}) {
    if (!isMobile()) return;
    if (!['plan', 'devices', 'handover', 'more'].includes(section)) section = 'plan';
    currentSection = section;
    clearSectionClasses();
    document.body.classList.add(`mobile-section-${section}`);

    if (section === 'handover') $('[data-view="handover"]')?.click();
    else $('[data-view="commission"]')?.click();

    document.querySelectorAll('.mobile-bottom-nav [data-mobile-section]').forEach(button => {
      const active = button.dataset.mobileSection === section;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });

    const title = $('.mobile-top-appbar-title');
    if (title) title.textContent = section === 'plan' ? 'Floor plan' : section === 'devices' ? 'Devices' : section === 'handover' ? 'Handover' : 'More';

    syncVisibility();
    refreshAppBar();
    if (section === 'devices') refreshDevicesView();
    if (section === 'more') refreshMoreView();

    if (!options.fromHistory) {
      const hash = `#${section}`;
      if (location.hash !== hash) history.pushState({ mobileSection: section }, '', hash);
      else history.replaceState({ mobileSection: section }, '', hash);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  async function refreshAppBar() {
    const state = await getState();
    const subtitle = $('.mobile-top-appbar-subtitle');
    if (subtitle) subtitle.textContent = state?.home?.address || 'Address not set';
  }

  function rehomeAddressEditor() {
    const host = $('#mobileAddressHost');
    const editor = $('.address-editor');
    if (!host || !editor) return false;
    if (!addressOrigin && editor.parentElement !== host) {
      addressOrigin = { parent: editor.parentElement, before: editor.nextSibling };
    }
    if (editor.parentElement !== host) host.append(editor);
    return true;
  }

  function refreshShellState() {
    refreshAppBar();
    refreshDevicesView();
    refreshMoreView();
    rehomeAddressEditor();
  }

  function buildTopBar() {
    if ($('.mobile-top-appbar')) return;
    const bar = document.createElement('header');
    bar.className = 'mobile-top-appbar';
    bar.innerHTML = '<div class="mobile-top-appbar-brand"><img src="brand-mark.svg" alt=""><div class="mobile-top-appbar-text"><div class="mobile-top-appbar-title">Floor plan</div><div class="mobile-top-appbar-subtitle">Domestic Intelligence</div></div></div>';
    document.body.prepend(bar);
  }

  function buildBottomNav() {
    if ($('.mobile-bottom-nav')) return;
    const nav = document.createElement('nav');
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Primary navigation');
    nav.innerHTML = [
      ['plan', 'Plan'], ['devices', 'Devices'], ['handover', 'Handover'], ['more', 'More']
    ].map(([key, label]) => `<button type="button" data-mobile-section="${key}" aria-label="${label}"><span class="mobile-nav-icon">${icons[key]}</span><span class="mobile-nav-label">${label}</span></button>`).join('');
    nav.addEventListener('click', event => {
      const button = event.target.closest('[data-mobile-section]');
      if (button) route(button.dataset.mobileSection);
    });
    document.body.append(nav);
  }

  function moveFloorControlsToPlan() {
    const controls = $('#floorControls');
    const modeBar = $('.editor-mode-bar');
    if (!controls || !modeBar) return;
    if (!floorOrigin) floorOrigin = { parent: controls.parentElement, before: controls.nextSibling };
    controls.classList.add('mobile-plan-floors');
    modeBar.parentElement.insertBefore(controls, modeBar);
  }

  function readinessLabel(point) {
    try {
      const status = window.DIEditorCore?.deriveDeviceReadiness(point);
      return status === 'ready' ? 'Ready' : status === 'attention' ? 'Needs attention' : 'Not tested';
    } catch (_) { return 'Not tested'; }
  }

  function buildDevicesView() {
    if ($('#mobileDevicesView')) return;
    const view = document.createElement('section');
    view.id = 'mobileDevicesView';
    view.className = 'mobile-devices-view';
    view.hidden = true;
    $('#top')?.append(view);
    view.addEventListener('click', event => {
      const button = event.target.closest('[data-open-device]');
      if (button) openDevice(button.dataset.openDevice, button.dataset.floorId);
    });
  }

  async function refreshDevicesView() {
    const view = $('#mobileDevicesView');
    const state = await getState();
    if (!view || !state) return;
    const floors = state.home?.floors?.length ? state.home.floors : [{ id: 'ground', name: 'Ground floor', map: state.map }];
    const groups = floors.map(floor => {
      const points = floor.map?.points || [];
      const floorName = escapeHtml(floor.name || 'Storey');
      const rows = points.map(point => `<button type="button" class="mobile-device-row" data-open-device="${escapeHtml(point.id)}" data-floor-id="${escapeHtml(floor.id)}"><span class="mobile-device-primary"><strong>${escapeHtml(point.name || 'Unnamed device')}</strong><small>${escapeHtml(point.category || 'Device')} · ${escapeHtml(readinessLabel(point))}</small></span><span class="mobile-device-chevron" aria-hidden="true">›</span></button>`).join('');
      return `<section class="mobile-device-group"><div class="mobile-device-group-heading"><h2>${floorName}</h2><span>${points.length} ${points.length === 1 ? 'device' : 'devices'}</span></div>${points.length ? `<div class="mobile-device-list">${rows}</div>` : '<p class="mobile-empty-copy">No devices recorded on this storey.</p>'}</section>`;
    }).join('');
    const total = floors.reduce((sum, floor) => sum + (floor.map?.points?.length || 0), 0);
    view.innerHTML = `<div class="mobile-page-heading"><p class="eyebrow">Property devices</p><h1>${total} ${total === 1 ? 'device' : 'devices'}</h1><p>Choose a device to inspect or update its commissioning details.</p></div>${groups}`;
  }

  async function openDevice(deviceId, floorId) {
    const state = await getState();
    if (!state) return;
    if (floorId && state.home?.activeFloorId !== floorId) {
      const floor = state.home?.floors?.find(item => item.id === floorId);
      if (floor) {
        const switched = window.DIPropertyModel?.activateFloor ? window.DIPropertyModel.activateFloor(state, floorId) : { ...state, map: clone(floor.map), home: { ...state.home, activeFloorId: floorId } };
        const point = switched.map.points?.find(item => item.id === deviceId);
        if (point) switched.selected = { roomId: point.roomId || switched.rooms?.[0]?.id || null, wallId: null, pointId: deviceId };
        await window.DIStorage.saveState(switched);
        try { sessionStorage.setItem('di-open-device-after-load', deviceId); } catch (_) {}
        location.hash = '#plan';
        location.reload();
        return;
      }
    }
    route('plan');
    setTimeout(() => document.querySelector(`[data-point="${CSS.escape(deviceId)}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true })), 60);
  }

  function buildMoreView() {
    let view = $('#mobileMoreView');
    if (!view) {
      view = document.createElement('section');
      view.id = 'mobileMoreView';
      view.className = 'mobile-more-view';
      view.hidden = true;
      view.innerHTML = '<section class="mobile-more-card"><p class="eyebrow">Property</p><h2>Property settings</h2><div id="mobileAddressHost"></div></section><section class="mobile-more-card"><p class="eyebrow">Preferences</p><h2>App settings</h2><div class="mobile-settings-row"><div class="mobile-settings-copy"><strong>Appearance</strong><small>Follows your device light or dark theme automatically.</small></div><span aria-hidden="true">◐</span></div><div class="mobile-settings-row"><div class="mobile-settings-copy"><strong>Profile & sharing</strong><small>Account and trade access controls will live here as shared-property services are introduced.</small></div><span aria-hidden="true">›</span></div></section><section class="mobile-more-card"><p class="eyebrow">About</p><h2>Domestic Intelligence</h2><div id="mobileAboutHost"></div><div class="mobile-settings-row"><div class="mobile-settings-copy"><strong>Local data</strong><small>Reset this browser’s synthetic prototype data and imported plans.</small></div><button type="button" class="quiet-action" id="mobileResetDemo">Reset</button></div></section>';
      $('#top')?.append(view);
      const prototype = $('.app-shell>.prototype-note');
      if (prototype) view.querySelector('#mobileAboutHost').append(prototype.cloneNode(true));
      view.querySelector('#mobileResetDemo')?.addEventListener('click', () => $('#resetButton')?.click());
    }
    if (rehomeAddressEditor()) {
      const editor = $('.address-editor');
      if (editor && editor.dataset.mobileAddressSyncBound !== 'true') {
        editor.dataset.mobileAddressSyncBound = 'true';
        editor.addEventListener('submit', () => setTimeout(refreshAppBar, 20));
      }
    }
  }

  async function refreshMoreView() {
    const state = await getState();
    const input = $('#residenceAddress');
    if (input && state?.home?.address && document.activeElement !== input) input.value = state.home.address;
  }

  function enableImmediateNewDeviceDetails() {
    const svg = $('#mapSvg');
    if (!svg || svg.dataset.newDeviceFlow === 'true') return;
    svg.dataset.newDeviceFlow = 'true';
    svg.addEventListener('pointerdown', () => {
      if (!isMobile() || !document.body.classList.contains('mobile-floor-edit')) return;
      if (!document.querySelector('[data-tool="point"]')?.classList.contains('active')) return;
      const before = new Set([...document.querySelectorAll('#pointLayer [data-point]')].map(node => node.dataset.point));
      setTimeout(() => {
        const added = [...document.querySelectorAll('#pointLayer [data-point]')].find(node => !before.has(node.dataset.point));
        if (!added) return;
        window.DIMobileDetail.open({ newDevice: true, returnFocus: added, focusSelector: '#pointForm input[name="name"]' });
        detailHistoryOpen = true;
        history.pushState({ mobileSection: 'plan', overlay: 'new-device' }, '', '#plan-new-device');
      }, 40);
    }, true);
  }

  function installMobileDetailApi() {
    if (window.DIMobileDetail) return;
    const inspector = $('.inspector-card');
    if (!inspector) return;

    const backgroundSelectors = [
      '.mobile-top-appbar', '.mobile-bottom-nav', '#floorControls', '.editor-mode-bar',
      '.atlas-commandbar', '.map-card', '.project-heading', '#mobileDevicesView', '#mobileMoreView', '#handoverView'
    ];

    function releaseDetail(options = {}) {
      if (!detailContext) {
        document.body.classList.remove('mobile-point-detail', 'mobile-new-device-detail');
        return;
      }
      const context = detailContext;
      detailContext = null;
      document.body.classList.remove('mobile-point-detail', 'mobile-new-device-detail');
      inspector.removeAttribute('role');
      inspector.removeAttribute('aria-modal');
      inspector.removeAttribute('aria-labelledby');
      context.background.forEach(({ element, wasInert }) => {
        if (wasInert) element.setAttribute('inert', '');
        else element.removeAttribute('inert');
      });
      if (options.restoreFocus !== false) {
        const target = context.returnFocus?.isConnected ? context.returnFocus : $('#mapStage');
        requestAnimationFrame(() => target?.focus());
      }
    }

    window.DIMobileDetail = Object.freeze({
      open(options = {}) {
        if (!isMobile()) return false;
        if (detailContext) releaseDetail({ restoreFocus: false });
        const returnFocus = options.returnFocus || document.activeElement;
        const background = [...new Set(backgroundSelectors.map(selector => $(selector)).filter(Boolean))]
          .map(element => ({ element, wasInert: element.hasAttribute('inert') }));
        background.forEach(({ element }) => element.setAttribute('inert', ''));
        detailContext = { returnFocus, background };
        document.body.classList.add('mobile-point-detail');
        document.body.classList.toggle('mobile-new-device-detail', Boolean(options.newDevice));
        inspector.setAttribute('role', 'dialog');
        inspector.setAttribute('aria-modal', 'true');
        inspector.setAttribute('aria-labelledby', 'pointHeading');
        const focusTarget = $(options.focusSelector || '#mobilePointClose') || $('#pointForm input[name="name"]');
        requestAnimationFrame(() => focusTarget?.focus());
        return true;
      },
      close(options = {}) {
        releaseDetail(options);
        detailHistoryOpen = false;
      },
      isOpen() { return Boolean(detailContext); }
    });

    document.addEventListener('keydown', event => {
      if (!detailContext) return;
      if (event.key === 'Tab') {
        const focusable = [...inspector.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
          .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
        if (!focusable.length) { event.preventDefault(); inspector.focus(); return; }
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !inspector.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !inspector.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
        return;
      }
      if (event.key !== 'Escape') return;
      event.preventDefault();
      window.DIMobileDetail.close();
      if (location.hash === '#plan-device' || location.hash === '#plan-new-device') history.back();
    });

    new MutationObserver(() => {
      if (detailContext && !document.body.classList.contains('mobile-point-detail')) {
        releaseDetail({ restoreFocus: true });
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function attachOverlayHistory() {
    if (overlaysBound) return;
    overlaysBound = true;
    document.addEventListener('click', event => {
      if (!isMobile()) return;
      if (event.target.closest('#mobilePointClose')) {
        window.DIMobileDetail?.close();
        if (location.hash === '#plan-device' || location.hash === '#plan-new-device') history.back();
        return;
      }
      if (event.target.closest('[data-point]') && document.body.classList.contains('mobile-section-plan') && !document.body.classList.contains('mobile-floor-edit')) {
        setTimeout(() => {
          if (!document.body.classList.contains('mobile-point-detail')) return;
          window.DIMobileDetail?.open({ returnFocus: event.target.closest('[data-point]') });
          detailHistoryOpen = true;
          history.pushState({ mobileSection: 'plan', overlay: 'point' }, '', '#plan-device');
        }, 0);
      }
      if (event.target.closest('#mobileReferenceButton')) {
        setTimeout(() => {
          if (document.body.classList.contains('mobile-reference-open')) {
            referenceHistoryOpen = true;
            history.pushState({ mobileSection: 'plan', overlay: 'reference' }, '', '#plan-reference');
          }
        }, 0);
      }
    });
  }

  function initialiseRoute() {
    const initial = sectionFromHash();
    history.replaceState({ mobileSection: initial }, '', `#${initial}`);
    route(initial, { fromHistory: true });
  }

  function ensureMobileShell(options = {}) {
    if (!isMobile()) return;
    buildTopBar();
    buildBottomNav();
    moveFloorControlsToPlan();
    buildDevicesView();
    buildMoreView();
    installMobileDetailApi();
    enableImmediateNewDeviceDetails();
    attachOverlayHistory();
    if (options.initial) initialiseRoute();
    else route(sectionFromHash(), { fromHistory: true });
    refreshShellState();
  }

  function openDeferredDevice() {
    let id = null;
    try { id = sessionStorage.getItem('di-open-device-after-load'); sessionStorage.removeItem('di-open-device-after-load'); } catch (_) {}
    if (!id) return;
    route('plan', { fromHistory: true });
    setTimeout(() => document.querySelector(`[data-point="${CSS.escape(id)}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true })), 120);
  }

  window.addEventListener('popstate', event => {
    if (!isMobile()) return;
    if (detailHistoryOpen) {
      detailHistoryOpen = false;
      window.DIMobileDetail?.close({ restoreFocus: true });
      return;
    }
    if (referenceHistoryOpen) {
      referenceHistoryOpen = false;
      return;
    }
    if (document.body.classList.contains('mobile-floor-edit')) {
      if (typeof window.DIMobileEditSession?.cancelFromHistory === 'function') {
        window.DIMobileEditSession.cancelFromHistory();
      } else {
        currentSection = 'plan';
        history.replaceState({ mobileSection: 'plan', editSession: true }, '', '#plan');
      }
      return;
    }
    window.DIMobileDetail?.close({ restoreFocus: false });
    const section = event.state?.mobileSection || (['plan', 'devices', 'handover', 'more'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'plan');
    route(section, { fromHistory: true });
  });

  window.addEventListener('resize', () => {
    if (isMobile()) {
      ensureMobileShell();
      return;
    }
    window.DIMobileDetail?.close({ restoreFocus: false });
    clearSectionClasses();
    if (floorOrigin && $('#floorControls')) floorOrigin.parent.insertBefore($('#floorControls'), floorOrigin.before || null);
    if (addressOrigin && $('.address-editor')) addressOrigin.parent.insertBefore($('.address-editor'), addressOrigin.before || null);
  });

  window.addEventListener('load', () => {
    if (!isMobile()) return;
    ensureMobileShell({ initial: true });
    [50, 200, 600].forEach(delay => setTimeout(refreshShellState, delay));
    openDeferredDevice();
  });

  window.addEventListener('di:app-state-ready', refreshShellState);
  window.addEventListener('di:address-editor-ready', () => {
    buildMoreView();
    rehomeAddressEditor();
    refreshAppBar();
  });
})();
