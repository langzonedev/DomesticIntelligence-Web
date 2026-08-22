import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const core = require('../editor-core.js');
const property = require('../property-model.js');
const mobileSource = await readFile(new URL('../mobile-v03.js', import.meta.url), 'utf8');

function loadMobileWrapper(initialState, legacyPlan = null) {
  let stateRecord = structuredClone(initialState);
  let legacy = legacyPlan;
  const scoped = new Map();
  const control = { migrationOwner: null };
  const originalStore = {
    validateFloorPlan: () => ({ ok: true, type: 'image/png', size: 1 }),
    loadState: async () => structuredClone(stateRecord),
    saveState: async state => { stateRecord = structuredClone(state); return { storage: 'memory' }; },
    clearAll: async () => {},
    saveFloorPlan: async () => ({ storage: 'memory' }),
    removeFloorPlan: async floorId => { scoped.delete(floorId); },
    loadFloorPlan: async (floorId, options = {}) => {
      if (floorId === undefined || floorId === null) return legacy;
      if (scoped.has(floorId)) return scoped.get(floorId);
      if (options.migrateLegacy === false || !legacy) return null;
      return originalStore.migrateLegacyFloorPlan(floorId);
    },
    migrateLegacyFloorPlan: async floorId => {
      control.migrationOwner = floorId;
      if (!legacy) return scoped.get(floorId) || null;
      const migrated = { ...legacy, floorId };
      scoped.set(floorId, migrated);
      legacy = null;
      return migrated;
    }
  };
  const matchMedia = () => ({ matches: true, addEventListener() {} });
  const window = {
    DIEditorCore: core,
    DIPropertyModel: property,
    DIStorage: originalStore,
    matchMedia,
    addEventListener() {},
    dispatchEvent() {}
  };
  const context = {
    window,
    document: {
      documentElement: { dataset: {} },
      querySelector: () => null,
      addEventListener() {},
      body: {}
    },
    localStorage: { setItem() {} },
    matchMedia,
    structuredClone,
    console,
    setTimeout,
    clearTimeout,
    Node: { TEXT_NODE: 3 },
    Element: class Element {},
    MutationObserver: class MutationObserver {},
    CustomEvent: class CustomEvent {},
    File: class File {}
  };
  vm.createContext(context);
  vm.runInContext(mobileSource, context, { filename: 'mobile-v03.js' });
  return { window, control, scoped };
}

test('mobile storage load lets PropertyModel recover floors before legacy core normalisation', async () => {
  const state = property.normalisePropertyState(core.createInitialState());
  state.home.floors.push({ id: 'level-1', name: 'Level 1', map: property.blankMap(state.map) });
  state.map = null;
  const runtime = loadMobileWrapper(state);

  const recovered = await runtime.window.DIStorage.loadState();
  assert.deepEqual(recovered.home.floors.map(floor => floor.id), ['ground', 'level-1']);
});

test('mobile legacy migration chooses the metadata owner rather than the active blank floor', async () => {
  let state = property.normalisePropertyState(core.createInitialState());
  state.map.floorplan = { name: 'ground.png', type: 'image/png', transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 60 } };
  state.home.floors[0].map = structuredClone(state.map);
  state.home.floors.push({ id: 'level-1', name: 'Level 1', map: property.blankMap(state.map) });
  state = property.activateFloor(state, 'level-1');
  const runtime = loadMobileWrapper(state, { name: 'ground.png', type: 'image/png', blob: {} });

  await runtime.window.DIStorage.loadState();
  const activePlan = await runtime.window.DIStorage.loadFloorPlan();
  assert.equal(activePlan, null);
  assert.equal(runtime.control.migrationOwner, 'ground');
  assert.equal(runtime.scoped.get('ground').name, 'ground.png');
});

test('beginEditSession resolves plans through the metadata-aware storage wrapper', () => {
  const beginSession = mobileSource.match(/async function beginEditSession\(\) \{[\s\S]*?return editSession;\r?\n  \}/)?.[0] || '';
  assert.match(beginSession, /await enhancedStore\.loadFloorPlan\(\)/);
  assert.doesNotMatch(beginSession, /originalStore\.loadFloorPlan/);
});
