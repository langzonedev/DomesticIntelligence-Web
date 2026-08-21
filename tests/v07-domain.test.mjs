import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

const require = createRequire(import.meta.url);
const core = require('../editor-core.js');
const property = require('../property-model.js');

function v06Fixture() {
  const state = core.createInitialState();
  state.schemaVersion = 2;
  delete state.map.viewport;
  delete state.map.calibration;
  state.map.points = state.map.points.map((point, index) => {
    const legacy = {
      id: point.id, roomId: point.roomId, x: point.x, y: point.y, name: point.name, category: point.category,
      manufacturer: point.brand, model: point.model, serialNumber: point.serialNumber,
      ipAddress: point.networkAddress, notes: point.installerNotes, checks: point.checks
    };
    if (index === 0) legacy.privateKey = 'must-not-survive';
    return legacy;
  });
  state.home.floors = [
    { id: 'ground', name: 'Ground', map: structuredClone(state.map) },
    { id: 'level-1', name: 'Level 1', map: { ...structuredClone(state.map), points: [] } }
  ];
  state.home.activeFloorId = 'ground';
  state.integration = { nested: { accessToken: 'must-not-survive' } };
  return state;
}

test('v0.6 to v0.7 migration is explicit, privacy-safe and idempotent', () => {
  const migrated = core.migrateV6ToV7(v06Fixture());
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.map.viewport, { x: 0, y: 0, zoom: 1 });
  assert.equal(migrated.map.calibration, null);
  assert.equal(migrated.map.points[0].brand, 'Synthetic Lighting Co.');
  assert.equal(migrated.map.points[0].networkAddress, migrated.map.points[0].ipAddress);
  assert.equal(migrated.map.points[0].installerNotes, migrated.map.points[0].notes);
  assert.equal(core.hasCredentialLikeKeys(migrated), false);
  assert.deepEqual(core.migrateV6ToV7(migrated), migrated);
  assert.deepEqual(migrated.home.floors[1].map.viewport, { x: 0, y: 0, zoom: 1 });
  assert.equal(core.validateState(core.normaliseState(v06Fixture())), true);
});

test('property recovery uses the sanitised migration source without discarding a valid storey', () => {
  const legacy = v06Fixture();
  legacy.home.wifiPassword = 'hunter2';
  legacy.home.activeFloorId = 'level-1';
  legacy.home.floors[1].apiToken = 'tok';
  legacy.home.floors[1].map.points = [{ ...legacy.map.points[0], id: 'level-device', password: 'strip-me' }];
  const coreMigrated = core.normaliseState(legacy);
  const recovered = property.normalisePropertyState(legacy, { loadActiveFloor: true });
  assert.equal(coreMigrated.home.floors[1].map.points.length, 1);
  assert.equal(recovered.home.floors[1].map.points.length, 1);
  assert.equal(recovered.map.points[0].id, 'level-device');
  assert.equal(recovered.home.wifiPassword, undefined);
  assert.equal(recovered.home.floors[1].apiToken, undefined);
  assert.equal(core.hasCredentialLikeKeys(recovered), false);
  assert.equal(core.validateState(recovered), true);
});

test('credential-labelled values are rejected on update, stripped on migration and avoid prose false positives', () => {
  const state = core.createInitialState();
  const id = state.map.points[0].id;
  assert.throws(() => core.updatePoint(state, id, { installerNotes: 'Wi-Fi password: hunter2' }), /Credential values/);
  assert.throws(() => core.updatePoint(state, id, { homeownerNotes: 'Door PIN code 2468' }), /Credential values/);
  for (const unsafe of ['Door PIN: 2468', 'PIN=2468', 'Door code 2468', 'Access code: 2468', 'Entry code 9753', 'Gate code: 2468', 'Garage code 8642', 'Alarm code=8642', 'Security code 1357', 'Lock code 1357', 'Keypad code: 9753', 'Passcode: 4567']) {
    assert.throws(() => core.updatePoint(state, id, { homeownerNotes: unsafe }), /Credential values/, unsafe);
  }
  assert.throws(() => core.updatePoint(state, id, { pin: '2468' }), /must not be stored/);
  assert.throws(() => core.updatePoint(state, id, { doorCode: '2468' }), /must not be stored/);
  assert.throws(() => core.updatePoint(state, id, { accessCode: '2468' }), /must not be stored/);
  for (const key of ['entryCode', 'gateCode', 'garageCode', 'alarmCode', 'securityCode', 'lockCode', 'keypadCode', 'passcode']) {
    assert.throws(() => core.updatePoint(state, id, { [key]: '2468' }), /must not be stored/, key);
  }
  assert.doesNotThrow(() => core.updatePoint(state, id, { installerNotes: 'Do not enter passwords, Wi-Fi keys, credentials or Matter fabric secrets.' }));
  assert.doesNotThrow(() => core.updatePoint(state, id, { installerNotes: 'Password is managed outside this application. API token: not stored.' }));
  assert.doesNotThrow(() => core.updatePoint(state, id, { physicalLocationNotes: 'PIN location marker beside the entry.' }));
  assert.doesNotThrow(() => core.updatePoint(state, id, { installerNotes: 'Door PIN: not stored.' }));
  assert.doesNotThrow(() => core.updatePoint(state, id, { physicalLocationNotes: 'Gate code location marker beside the keypad.' }));
  assert.doesNotThrow(() => core.updatePoint(state, id, { installerNotes: 'Alarm code: not stored.' }));
  const legacy = v06Fixture();
  legacy.map.points[0].notes = 'Door PIN: 2468';
  legacy.map.points[0].pin = '2468';
  legacy.map.points[0].gateCode = '2468';
  legacy.map.points[0].checks = [{ name: 'Setup code 12345678', status: 'pass' }, { name: 'Power and response', status: 'pass' }];
  const migrated = core.migrateV6ToV7(legacy);
  assert.equal(migrated.map.points[0].installerNotes, '');
  assert.equal(migrated.map.points[0].pin, undefined);
  assert.equal(migrated.map.points[0].gateCode, undefined);
  assert.deepEqual(migrated.map.points[0].checks, [{ name: 'Power and response', status: 'pass' }]);
  assert.equal(core.hasCredentialLikeValues(migrated), false);
});

test('rich device records validate aliases, protocols, dates, MAC and credentials', () => {
  let state = core.createInitialState();
  const id = state.map.points[0].id;
  state = core.updatePoint(state, id, {
    manufacturer: 'Acme', model: 'X1', serialNumber: 'SN-1', assetReference: 'ASSET-1', protocol: 'Ethernet',
    ipAddress: 'switch.local', macAddress: 'aa-bb-cc-dd-ee-ff', networkLabel: 'VLAN 20', controllerReference: 'Rack A',
    portReference: '12', installationDate: '2026-08-21', installerBusiness: 'Example Installer', circuitReference: 'C7',
    physicalLocationNotes: 'Cupboard', warrantyDate: '2028-08-21', firmwareVersion: '1.2.3', lastTestedDate: '2026-08-20',
    issuesActions: 'None', maintenanceNotes: 'Annual', homeownerNotes: 'Do not unplug', notes: 'Commissioned'
  });
  const point = state.map.points[0];
  assert.equal(point.brand, 'Acme');
  assert.equal(point.networkAddress, 'switch.local');
  assert.equal(point.macAddress, 'AA:BB:CC:DD:EE:FF');
  assert.equal(point.installerNotes, 'Commissioned');
  assert.equal(core.validateState(state), true);
  assert.throws(() => core.updatePoint(state, id, { protocol: 'Telnet' }), /supported protocol/);
  assert.throws(() => core.updatePoint(state, id, { macAddress: 'not-a-mac' }), /valid MAC/);
  assert.throws(() => core.updatePoint(state, id, { warrantyDate: '2026-02-30' }), /YYYY-MM-DD/);
  assert.throws(() => core.updatePoint(state, id, { integration: { password: 'secret' } }), /must not be stored/);
});

test('privacy-safe projections use positive allowlists', () => {
  const point = core.createInitialState().map.points[1];
  const homeowner = core.toPrivacySafeDevice(point, 'homeowner');
  assert.equal(homeowner.serialNumber, undefined);
  assert.equal(homeowner.networkAddress, undefined);
  assert.equal(homeowner.installerNotes, undefined);
  const installer = core.toPrivacySafeDevice(point, 'installer');
  assert.equal(installer.serialNumber, point.serialNumber);
  assert.equal(installer.networkAddress, point.networkAddress);
});

test('viewport is persisted independently in each storey map', () => {
  let state = property.normalisePropertyState(core.createInitialState());
  state = core.setMapViewport(state, { x: 40, y: -20, zoom: 1.5 });
  state = property.syncActiveFloor(state);
  state.home.floors.push({ id: 'level-1', name: 'Level 1', map: property.blankMap(state.map) });
  state = property.activateFloor(state, 'level-1');
  state = core.setMapViewport(state, { x: -80, y: 25, zoom: 2.25 });
  state = property.syncActiveFloor(state);
  state = property.activateFloor(state, 'ground');
  assert.deepEqual(state.map.viewport, { x: 40, y: -20, zoom: 1.5 });
  state = property.activateFloor(state, 'level-1');
  assert.deepEqual(state.map.viewport, { x: -80, y: 25, zoom: 2.25 });
});

test('connected endpoints move together without moving unrelated geometry', () => {
  let state = core.createInitialState();
  state.map.walls = [
    { id: 'a', x1: 0, y1: 0, x2: 100, y2: 100 },
    { id: 'b', x1: 100, y1: 100, x2: 200, y2: 100 },
    { id: 'c', x1: 300, y1: 300, x2: 400, y2: 300 }
  ];
  state.selected.wallId = null;
  const connected = core.findConnectedWallEndpoints(state, 'a', 'end');
  assert.deepEqual(connected, [{ wallId: 'a', endpoint: 'end' }, { wallId: 'b', endpoint: 'start' }]);
  const moved = core.moveConnectedWallEndpoint(state, 'a', 'end', { x: 157, y: 143 }, { endpoints: false });
  assert.deepEqual(moved.map.walls[0], { id: 'a', x1: 0, y1: 0, x2: 160, y2: 140 });
  assert.deepEqual(moved.map.walls[1], { id: 'b', x1: 160, y1: 140, x2: 200, y2: 100 });
  assert.deepEqual(moved.map.walls[2], state.map.walls[2]);
  assert.throws(() => core.moveConnectedWallEndpoint(state, 'a', 'end', { x: 0, y: 0 }, { grid: false }), /collapse/);
});

test('alignment guides and map calibration provide deterministic spatial helpers', () => {
  const state = core.createInitialState();
  const snapped = core.snapAlignedPoint(state, { x: 86, y: 149 }, { endpoints: false, threshold: 8 });
  assert.equal(snapped.x, 80);
  assert.equal(snapped.guides.x.value, 80);
  assert.equal(snapped.y, 140);
  const calibrated = core.calibrateMap(state, 200, 4, 'm');
  assert.equal(calibrated.map.calibration.pixelsPerUnit, 50);
  assert.equal(core.pixelsToCalibratedUnits(calibrated.map, 125), 2.5);
  assert.equal(core.calibratedUnitsToPixels(calibrated.map, 3), 150);
});

test('100 walls and 200 rich points remain valid and responsive', () => {
  const state = core.createInitialState();
  const template = state.map.points[0];
  state.map.walls = Array.from({ length: 100 }, (_, index) => ({
    id: `wall-perf-${index}`, x1: index * 5, y1: index * 4, x2: index * 5 + 40, y2: index * 4 + 20
  }));
  state.map.points = Array.from({ length: 200 }, (_, index) => ({
    ...structuredClone(template), id: `point-perf-${index}`, x: (index * 17) % 800, y: (index * 23) % 1200,
    serialNumber: `SN-${index}`, assetReference: `ASSET-${index}`
  }));
  state.selected = { roomId: 'kitchen', wallId: null, pointId: null };
  const start = performance.now();
  const normalised = core.normaliseState(state);
  core.getAlignmentGuides(normalised, { x: 410, y: 620 });
  const elapsed = performance.now() - start;
  assert.equal(normalised.map.walls.length, 100);
  assert.equal(normalised.map.points.length, 200);
  assert.equal(core.validateState(normalised), true);
  assert.ok(elapsed < 1000, `expected domain operations under 1000ms, got ${elapsed.toFixed(1)}ms`);
});
