(function () {
  'use strict';

  const MOBILE_QUERY = '(max-width: 760px)';
  const $ = selector => document.querySelector(selector);
  const icons = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    plan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/></svg>',
    handover: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>'
  };

  let currentSection = 'home';
  let floorOrigin = null;
  let addressOrigin = null;

  function isMobile() { return matchMedia(MOBILE_QUERY).matches; }

  async function getState() {
    try { return await window.DIStorage?.loadState(); }
    catch (_) { return null; }
  }

  function clearSectionClasses() {
    document.body.classList.remove('mobile-section-home', 'mobile-section-plan', 'mobile-section-handover', 'mobile-section-more');
  }

  function setSection(section, options = {}) {
    if (!isMobile()) return;
    if (!['home', 'plan', 'handover', 'more'].includes(section)) section = 'home';
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
    if (title) title.textContent = section === 'home' ? 'Home' : section === 'plan' ? 'Floor plan' : section === 'handover' ? 'Handover' : 'More';

    if (!options.fromHistory) {
      const hash = `#${section}`;
      if (location.hash !== hash) history.pushState({ mobileSection: section }, '', hash);
      else history.replaceState({ mobileSection: section }, '', hash);
    }

    if (section === 'home') refreshHomeCard();
    if (section === 'more') refreshMoreView();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function syncMoreVisibility() {
    const more = $('#mobileMoreView');
    if (more) more.hidden = currentSection !== 'more';
  }

  function route(section, options) {
    setSection(section, options);
    syncMoreVisibility();
  }

  function buildTopBar() {
    if ($('.mobile-top-appbar')) return;
    const bar = document.createElement('header');
    bar.className = 'mobile-top-appbar';
    bar.innerHTML = '<div class="mobile-top-appbar-brand"><img src="brand-mark.svg" alt=""><div class="mobile-top-appbar-text"><div class="mobile-top-appbar-title">Home</div><div class="mobile-top-appbar-subtitle">Domestic Intelligence</div></div></div><span class="mobile-app-icon" aria-hidden="true"></span>';
    document.body.prepend(bar);
  }

  function buildBottomNav() {
    if ($('.mobile-bottom-nav')) return;
    const nav = document.createElement('nav');
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Primary navigation');
    nav.innerHTML = [
      ['home', 'Home'], ['plan', 'Plan'], ['handover', 'Handover'], ['more', 'More']
    ].map(([key, label]) => `<button type="button" data-mobile-section="${key}" aria-label="${label}"><span class="mobile-nav-icon">${icons[key]}</span><span class="mobile-nav-label">${label}</span></button>`).join('');
    nav.addEventListener('click', event => {
      const button = event.target.closest('[data-mobile-section]');
      if (button) route(button.dataset.mobileSection);
    });
    document.body.append(nav);
  }

  function buildHomeCard() {
    if ($('.mobile-home-card')) return;
    const card = document.createElement('section');
    card.className = 'mobile-home-card';
    card.innerHTML = '<p class="eyebrow">Property</p><h2 id="mobileHomeName">Home</h2><p class="mobile-property-address" id="mobileHomeAddress"></p><p class="mobile-property-meta" id="mobileHomeMeta"></p><div class="mobile-settings-row"><div class="mobile-settings-copy"><strong>Floor plan</strong><small>View devices, walls and storeys</small></div><button type="button" class="primary-action" id="mobileOpenPlan">Open plan</button></div>';
    const main = $('#top');
    if (main) main.prepend(card);
    card.querySelector('#mobileOpenPlan').addEventListener('click', () => route('plan'));
  }

  async function refreshHomeCard() {
    const state = await getState();
    if (!state) return;
    const floors = state.home?.floors || [];
    const active = floors.find(floor => floor.id === state.home?.activeFloorId) || floors[0];
    const name = $('#mobileHomeName');
    const address = $('#mobileHomeAddress');
    const meta = $('#mobileHomeMeta');
    if (name) name.textContent = state.home?.name || 'Home';
    if (address) address.textContent = state.home?.address || 'Address not set';
    if (meta) meta.textContent = `${active?.name || 'Ground floor'} · ${floors.length || 1} ${floors.length === 1 ? 'storey' : 'storeys'} · ${state.map?.points?.length || 0} devices on this level`;
    const subtitle = $('.mobile-top-appbar-subtitle');
    if (subtitle && currentSection === 'home') subtitle.textContent = state.home?.address || 'Domestic Intelligence';
  }

  function moveFloorControlsToPlan() {
    const controls = $('#floorControls');
    const modeBar = $('.editor-mode-bar');
    if (!controls || !modeBar) return;
    if (!floorOrigin) floorOrigin = { parent: controls.parentElement, before: controls.nextSibling };
    controls.classList.add('mobile-plan-floors');
    modeBar.parentElement.insertBefore(controls, modeBar);
  }

  function buildMoreView() {
    if ($('#mobileMoreView')) return;
    const view = document.createElement('section');
    view.id = 'mobileMoreView';
    view.className = 'mobile-more-view';
    view.hidden = true;
    view.innerHTML = '<section class="mobile-more-card"><p class="eyebrow">Property</p><h2>Property settings</h2><div id="mobileAddressHost"></div></section><section class="mobile-more-card"><p class="eyebrow">Preferences</p><h2>App settings</h2><div class="mobile-settings-row"><div class="mobile-settings-copy"><strong>Appearance</strong><small>Follows your device light or dark theme automatically.</small></div><span aria-hidden="true">◐</span></div><div class="mobile-settings-row"><div class="mobile-settings-copy"><strong>Profile & sharing</strong><small>Account and trade access controls will live here as the shared-property service is introduced.</small></div><span aria-hidden="true">›</span></div></section><section class="mobile-more-card"><p class="eyebrow">About</p><h2>Domestic Intelligence</h2><div id="mobileAboutHost"></div><div class="mobile-settings-row"><div class="mobile-settings-copy"><strong>Local data</strong><small>Reset this browser’s synthetic prototype data and imported plans.</small></div><button type="button" class="quiet-action" id="mobileResetDemo">Reset</button></div></section>';
    $('#top')?.append(view);

    const editor = $('.address-editor');
    if (editor) {
      if (!addressOrigin) addressOrigin = { parent: editor.parentElement, before: editor.nextSibling };
      view.querySelector('#mobileAddressHost').append(editor);
    }
    const prototype = $('.app-shell>.prototype-note');
    if (prototype) view.querySelector('#mobileAboutHost').append(prototype.cloneNode(true));
    view.querySelector('#mobileResetDemo')?.addEventListener('click', () => $('#resetButton')?.click());
  }

  async function refreshMoreView() {
    const state = await getState();
    const input = $('#residenceAddress');
    if (input && state?.home?.address && document.activeElement !== input) input.value = state.home.address;
  }

  function attachOverlayHistory() {
    document.addEventListener('click', event => {
      if (!isMobile()) return;
      if (event.target.closest('[data-point]') && document.body.classList.contains('mobile-section-plan')) {
        setTimeout(() => {
          if (document.body.classList.contains('mobile-point-detail')) history.pushState({ mobileSection: 'plan', overlay: 'point' }, '', '#plan-device');
        }, 0);
      }
      if (event.target.closest('#mobileReferenceButton')) {
        setTimeout(() => {
          if (document.body.classList.contains('mobile-reference-open')) history.pushState({ mobileSection: 'plan', overlay: 'reference' }, '', '#plan-reference');
        }, 0);
      }
    });
  }

  function initialiseRoute() {
    const initial = ['home', 'plan', 'handover', 'more'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
    history.replaceState({ mobileSection: initial }, '', `#${initial}`);
    route(initial, { fromHistory: true });
  }

  window.addEventListener('popstate', event => {
    if (!isMobile()) return;
    const section = event.state?.mobileSection || (['home', 'plan', 'handover', 'more'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
    route(section, { fromHistory: true });
  });

  window.addEventListener('resize', () => {
    if (isMobile()) {
      moveFloorControlsToPlan();
      return;
    }
    clearSectionClasses();
    if (floorOrigin && $('#floorControls')) floorOrigin.parent.insertBefore($('#floorControls'), floorOrigin.before || null);
    if (addressOrigin && $('.address-editor')) addressOrigin.parent.insertBefore($('.address-editor'), addressOrigin.before || null);
  });

  window.addEventListener('load', () => {
    if (!isMobile()) return;
    buildTopBar();
    buildBottomNav();
    buildHomeCard();
    moveFloorControlsToPlan();
    buildMoreView();
    attachOverlayHistory();
    initialiseRoute();
    refreshHomeCard();
  });
})();