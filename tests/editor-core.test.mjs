import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const core = require("../editor-core.js");

test("factory creates independent, valid schema v3 synthetic states", () => {
  const first = core.createInitialState();
  const second = core.createInitialState();
  assert.equal(first.schemaVersion, 3);
  assert.equal(core.validateState(first), true);
  first.map.layers.walls = false;
  assert.equal(second.map.layers.walls, true);
});

test("malformed state safely restores the baseline", () => {
  for (const malformed of [null, {}, { schemaVersion: 2 }, { schemaVersion: 99 }, { rooms: "bad" }]) {
    const recovered = core.normaliseState(malformed);
    assert.equal(core.validateState(recovered), true);
    assert.equal(recovered.schemaVersion, 3);
  }
});

test("schema v3 validation rejects unsafe modes, selections and floor-plan transforms", () => {
  const mutations = [
    state => { state.view = "bogus"; },
    state => { state.workspaceMode = "bogus"; },
    state => { state.selected = null; },
    state => { state.selected.pointId = "missing-point"; },
    state => { state.map.floorplan = { name: "Plan", type: "image/png", transform: null }; },
    state => { state.map.floorplan = { name: "Plan", type: "image/png", transform: { x: 0, y: 0, scale: Number.NaN, rotation: 0, opacity: 60 } }; }
  ];
  for (const mutate of mutations) {
    const malformed = core.createInitialState();
    mutate(malformed);
    assert.equal(core.validateState(malformed), false);
    assert.equal(core.validateState(core.normaliseState(malformed)), true);
  }
});

test("v1 room devices migrate to spatial points and preserve checks", () => {
  const v1 = {
    mode: "handover",
    selectedRoom: "room-a",
    selectedDevice: "device-a",
    rooms: [{ id: "room-a", name: "Room A", devices: [{
      id: "device-a", name: "Demo switch", type: "Lighting", model: "Model A",
      checks: [{ name: "Response", status: "pass" }],
    }] }],
  };
  const migrated = core.normaliseState(v1);
  assert.equal(core.validateState(migrated), true);
  assert.equal(migrated.view, "handover");
  assert.equal(migrated.map.points[0].category, "Lighting");
  assert.equal(migrated.map.points[0].checks[0].status, "pass");
  assert.equal(migrated.selected.pointId, "device-a");
});

test("readiness is derived rather than stored", () => {
  let state = core.createInitialState();
  assert.equal(core.deriveHomeReadiness(state), "pending");
  state = {
    ...state,
    map: { ...state.map, points: state.map.points.map((point) => ({
      ...point, checks: point.checks.map((check) => ({ ...check, status: "pass" })),
    })) },
  };
  assert.equal(core.deriveHomeReadiness(state), "ready");
  const target = state.map.points[0];
  state = core.updatePoint(state, target.id, { checks: [{ name: "Power", status: "fix" }] });
  assert.equal(core.deriveDeviceReadiness(state.map.points[0]), "attention");
  assert.equal(core.deriveRoomReadiness(state, target.roomId), "attention");
  assert.equal(core.deriveHomeReadiness(state), "attention");
});

test("readiness summary counts checks and devices", () => {
  const state = core.createInitialState();
  const summary = core.getReadinessSummary(state);
  assert.equal(summary.devices, state.map.points.length);
  assert.ok(summary.totalChecks > summary.passedChecks);
  assert.equal(summary.status, "pending");
});

test("an empty room is non-blocking and is reported explicitly", () => {
  let state = core.createInitialState();
  state = core.removePoint(state, "point-entry-lock");
  state = {
    ...state,
    map: { ...state.map, points: state.map.points.map(point => ({ ...point, checks: point.checks.map(check => ({ ...check, status: "pass" })) })) }
  };
  assert.equal(core.deriveRoomReadiness(state, "entry"), "empty");
  assert.equal(core.deriveHomeReadiness(state), "ready");
  const summary = core.getReadinessSummary(state);
  assert.equal(summary.passedChecks, summary.totalChecks);
});

test("history snapshots do not share later mutations and support undo/redo", () => {
  const initial = core.createInitialState();
  let history = core.createHistory(initial, 2);
  const changed = core.toggleLayer(initial, "walls");
  history = core.commitHistory(history, changed);
  changed.map.layers.devices = false;
  assert.equal(history.present.map.layers.devices, true);
  history = core.undoHistory(history);
  assert.equal(history.present.map.layers.walls, true);
  history = core.redoHistory(history);
  assert.equal(history.present.map.layers.walls, false);
});

test("new commits clear redo and history respects its bound", () => {
  let history = core.createHistory(core.createInitialState(), 2);
  history = core.commitHistory(history, core.toggleLayer(history.present, "walls"));
  history = core.commitHistory(history, core.toggleLayer(history.present, "labels"));
  history = core.commitHistory(history, core.toggleLayer(history.present, "status"));
  assert.equal(history.past.length, 2);
  history = core.undoHistory(history);
  assert.equal(history.future.length, 1);
  history = core.commitHistory(history, core.showAllLayers(history.present));
  assert.equal(history.future.length, 0);
});

test("wall add snaps to grid and nearby endpoints", () => {
  let state = core.createInitialState();
  state = core.addWall(state, { id: "wall-grid", x1: 123, y1: 157, x2: 397, y2: 159 }, { endpoints: false });
  const gridWall = state.map.walls.at(-1);
  assert.deepEqual(gridWall, { id: "wall-grid", x1: 120, y1: 160, x2: 400, y2: 160 });
  state = core.addWall(state, { id: "wall-endpoint", x1: 85, y1: 84, x2: 246, y2: 88 });
  assert.deepEqual(state.map.walls.at(-1), { id: "wall-endpoint", x1: 80, y1: 80, x2: 240, y2: 80 });
});

test("zero-length and duplicate walls are rejected", () => {
  const state = core.createInitialState();
  assert.throws(() => core.addWall(state, { x1: 1, y1: 1, x2: 1, y2: 1 }, { grid: false }), /two different/);
  assert.throws(() => core.addWall(state, { id: "wall-top", x1: 1, y1: 1, x2: 2, y2: 2 }), /Duplicate/);
});

test("moving a wall preserves length while snapping and never mutates input", () => {
  const state = core.createInitialState();
  const original = state.map.walls.find((wall) => wall.id === "wall-top");
  const movedState = core.moveWall(state, "wall-top", { x: 43, y: 37 }, { endpoints: false });
  const moved = movedState.map.walls.find((wall) => wall.id === "wall-top");
  assert.equal(Math.hypot(moved.x2 - moved.x1, moved.y2 - moved.y1), Math.hypot(original.x2 - original.x1, original.y2 - original.y1));
  assert.equal(original.y1, 80);
  assert.equal(moved.y1, 120);
});

test("resizing snaps a selected endpoint and remove clears selection", () => {
  let state = core.createInitialState();
  state = { ...state, selected: { ...state.selected, wallId: "wall-top" } };
  state = core.resizeWall(state, "wall-top", "end", { x: 1111, y: 713 });
  const wall = state.map.walls.find((item) => item.id === "wall-top");
  assert.deepEqual({ x: wall.x2, y: wall.y2 }, { x: 1120, y: 720 });
  state = core.removeWall(state, "wall-top");
  assert.equal(state.map.walls.some((item) => item.id === "wall-top"), false);
  assert.equal(state.selected.wallId, null);
});

test("network address validation accepts optional IPv4, IPv6 and hostnames", () => {
  for (const address of ["", "192.0.2.1", "0.0.0.0", "2001:db8::1", "::1", "device.local", "localhost"]) {
    assert.equal(core.isValidNetworkAddress(address), true, address);
  }
  for (const address of ["256.1.1.1", "01.2.3.4", "2001:::1", "gggg::1", "not a host", "-bad.local"]) {
    assert.equal(core.isValidNetworkAddress(address), false, address);
  }
});

test("point add, update, move and remove preserve metadata safely", () => {
  let state = core.createInitialState();
  state = core.addPoint(state, {
    id: "point-new", roomId: "entry", x: 333, y: 222, name: "Entry camera",
    category: "Camera", brand: "Example", model: "C1", serialNumber: "DEMO-9",
    ipAddress: "camera.local", notes: "No credentials", checks: [{ name: "Image", status: "pending" }],
  });
  assert.equal(state.map.points.at(-1).serialNumber, "DEMO-9");
  const beforeMove = state;
  state = core.movePoint(state, "point-new", { x: 349, y: 251 }, { snap: true });
  assert.deepEqual({ x: state.map.points.at(-1).x, y: state.map.points.at(-1).y }, { x: 340, y: 260 });
  assert.equal(beforeMove.map.points.at(-1).x, 333);
  state = core.updatePoint(state, "point-new", { brand: "Updated", ipAddress: "2001:db8::99" });
  assert.equal(state.map.points.at(-1).brand, "Updated");
  state = { ...state, selected: { ...state.selected, pointId: "point-new" } };
  state = core.removePoint(state, "point-new");
  assert.equal(state.map.points.some((point) => point.id === "point-new"), false);
  assert.equal(state.selected.pointId, null);
});

test("bad point input is rejected without changing the source state", () => {
  const state = core.createInitialState();
  assert.throws(() => core.addPoint(state, { id: "bad", roomId: "missing", ipAddress: "192.168.1.1" }), /Unknown room/);
  assert.throws(() => core.updatePoint(state, state.map.points[0].id, { ipAddress: "999.1.1.1" }), /valid IPv4/);
  assert.equal(core.validateState(state), true);
});

test("layer toggles are immutable and show-all provides recovery", () => {
  const state = core.createInitialState();
  let hidden = core.setLayerVisibility(state, "floorplan", false);
  hidden = core.toggleLayer(hidden, "walls");
  assert.equal(state.map.layers.floorplan, true);
  assert.equal(hidden.map.layers.floorplan, false);
  assert.equal(hidden.map.layers.walls, false);
  const shown = core.showAllLayers(hidden);
  assert.deepEqual(shown.map.layers, { ...core.DEFAULT_LAYERS });
  assert.throws(() => core.toggleLayer(state, "secrets"), /Unknown layer/);
});

test("browser global export is installed alongside CommonJS export", () => {
  assert.equal(globalThis.DIEditorCore, core);
});
