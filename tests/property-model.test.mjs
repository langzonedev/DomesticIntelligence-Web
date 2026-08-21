import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const core = require('../editor-core.js');
const property = require('../property-model.js');

function ready(point, id = point.id) {
  return {
    ...point,
    id,
    checks: (point.checks || []).map(check => ({ ...check, status: 'pass' }))
  };
}

test('v0.2 state becomes an independent portrait ground floor without mutating input', () => {
  const legacy = core.createInitialState();
  const normalised = property.normalisePropertyState(legacy);
  assert.equal(normalised.home.activeFloorId, 'ground');
  assert.equal(normalised.home.floors.length, 1);
  assert.equal(normalised.home.address, property.DEFAULT_ADDRESS);
  assert.equal(normalised.map.width, 800);
  assert.equal(normalised.map.height, 1200);
  assert.deepEqual(normalised.home.floors[0].map, normalised.map);
  assert.equal(legacy.map.width, 1200);
});

test('duplicate and malformed floors recover locally with unique stable ids', () => {
  const base = property.normalisePropertyState(core.createInitialState());
  const goodMap = property.blankMap(base.map);
  goodMap.points.push(ready(base.map.points[0], 'level-device'));
  const input = {
    ...base,
    home: {
      ...base.home,
      activeFloorId: 'same',
      floors: [
        { id: 'same', name: 'Ground', map: base.map },
        null,
        { id: 'same', name: 'Level 2', map: goodMap }
      ]
    }
  };
  const result = property.normalisePropertyState(input, { loadActiveFloor: true });
  assert.deepEqual(result.home.floors.map(floor => floor.id), ['same', 'level-1', 'same-2']);
  assert.equal(result.home.floors[1].map.points.length, 0);
  assert.equal(result.home.floors[2].map.points[0].id, 'level-device');
  assert.equal(result.home.activeFloorId, 'same');
});

test('a malformed mirrored top map does not discard valid floor maps', () => {
  const base = property.normalisePropertyState(core.createInitialState());
  base.home.floors.push({ id: 'level-1', name: 'Level 1', map: property.blankMap(base.map) });
  base.map = null;
  const recovered = property.normalisePropertyState(base, { loadActiveFloor: true });
  assert.deepEqual(recovered.home.floors.map(floor => floor.id), ['ground', 'level-1']);
  assert.equal(recovered.home.floors[0].map.points.length, 5);
  assert.equal(recovered.home.floors[1].map.points.length, 0);
});

test('legacy plan ownership follows unique floor metadata and falls back to ground', () => {
  const base = property.normalisePropertyState(core.createInitialState());
  base.map.floorplan = { name: 'ground.png', type: 'image/png', transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 60 } };
  base.home.floors[0].map = structuredClone(base.map);
  base.home.floors.push({ id: 'level-1', name: 'Level 1', map: property.blankMap(base.map) });
  const activeUpper = property.activateFloor(base, 'level-1');
  assert.equal(property.chooseLegacyFloorPlanOwner(activeUpper, { name: 'ground.png', type: 'image/png' }), 'ground');
  activeUpper.home.floors[1].map.floorplan = { name: 'other.png', type: 'image/png', transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 60 } };
  assert.equal(property.chooseLegacyFloorPlanOwner(activeUpper, { name: 'unknown.png', type: 'image/png' }), 'ground');
});

test('sync and activate preserve the outgoing map and repair incoming selection', () => {
  let state = property.normalisePropertyState(core.createInitialState());
  const secondMap = property.blankMap(state.map);
  secondMap.points.push(ready(state.map.points[0], 'upstairs-device'));
  state.home.floors.push({ id: 'level-1', name: 'Level 1', map: secondMap });
  state.map.walls = [];
  const switched = property.activateFloor(state, 'level-1');
  assert.equal(switched.home.floors[0].map.walls.length, 0);
  assert.equal(switched.map.points[0].id, 'upstairs-device');
  assert.equal(switched.selected.pointId, 'upstairs-device');
  assert.equal(switched.home.activeFloorId, 'level-1');
});

test('whole-property selectors include every floor and use the address identity', () => {
  let state = property.normalisePropertyState(core.createInitialState());
  state.home.address = '44 Test Avenue, Adelaide SA 5000';
  state.map.points = [ready(state.map.points[0], 'ground-device')];
  state.home.floors[0].map = structuredClone(state.map);
  const upper = property.blankMap(state.map);
  upper.points.push(ready(state.home.floors[0].map.points[0], 'upper-device'));
  state.home.floors.push({ id: 'level-1', name: 'Level 1', map: upper });

  const devices = property.getPropertyDevices(state);
  assert.deepEqual(devices.map(device => device.floorId), ['ground', 'level-1']);
  assert.ok(devices.every(device => device.floorName && device.roomId && device.roomName));
  const summary = property.getPropertyReadiness(state);
  assert.equal(summary.status, 'ready');
  assert.equal(summary.devices, 2);
  assert.equal(summary.passedChecks, summary.totalChecks);
  const exported = property.toExportShape(state);
  assert.equal(exported.projectName, state.home.address);
  assert.equal(exported.rooms.flatMap(room => room.devices).length, 2);
  assert.ok(exported.rooms.some(room => room.floorId === 'level-1'));
});
