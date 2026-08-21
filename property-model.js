(function initialiseDIPropertyModel(root, factory) {
  const api = factory(root.DIEditorCore);
  root.DIPropertyModel = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPropertyModel(Core) {
  'use strict';

  const PORTRAIT_WIDTH = 800;
  const PORTRAIT_HEIGHT = 1200;
  const DEFAULT_ADDRESS = '12 Willow Street, Adelaide SA 5000';
  const DEFAULT_LAYERS = Object.freeze({ floorplan: true, walls: true, devices: true, status: true, labels: true });

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function text(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function requireCore() {
    if (!Core || typeof Core.createInitialState !== 'function' || typeof Core.validateState !== 'function') {
      throw new Error('DIPropertyModel requires DIEditorCore.');
    }
    return Core;
  }

  function portraitMap(map) {
    const next = clone(map || {});
    const sourceWidth = Math.max(1, finite(next.width, 1200));
    const sourceHeight = Math.max(1, finite(next.height, 800));
    if (next.orientation === 'portrait-v03' || sourceHeight > sourceWidth) {
      next.orientation = 'portrait-v03';
      next.width = sourceWidth;
      next.height = sourceHeight;
      return next;
    }
    const sx = PORTRAIT_WIDTH / sourceWidth;
    const sy = PORTRAIT_HEIGHT / sourceHeight;
    next.width = PORTRAIT_WIDTH;
    next.height = PORTRAIT_HEIGHT;
    next.orientation = 'portrait-v03';
    next.walls = (Array.isArray(next.walls) ? next.walls : []).map(wall => ({
      ...wall,
      x1: finite(wall && wall.x1, 0) * sx,
      y1: finite(wall && wall.y1, 0) * sy,
      x2: finite(wall && wall.x2, 0) * sx,
      y2: finite(wall && wall.y2, 0) * sy
    }));
    next.points = (Array.isArray(next.points) ? next.points : []).map(point => ({
      ...point,
      x: finite(point && point.x, 0) * sx,
      y: finite(point && point.y, 0) * sy
    }));
    if (next.floorplan && next.floorplan.transform) {
      next.floorplan.transform = {
        ...next.floorplan.transform,
        x: finite(next.floorplan.transform.x, 0) * sx,
        y: finite(next.floorplan.transform.y, 0) * sy
      };
    }
    return next;
  }

  function blankMap(template) {
    const source = portraitMap(template || {});
    return {
      width: PORTRAIT_WIDTH,
      height: PORTRAIT_HEIGHT,
      orientation: 'portrait-v03',
      gridSize: Math.max(1, finite(source.gridSize, 20)),
      snapDistance: Math.max(0, finite(source.snapDistance, 14)),
      layers: { ...DEFAULT_LAYERS },
      floorplan: null,
      walls: [],
      points: []
    };
  }

  function safeSelection(map, rooms, selected = {}) {
    const roomIds = new Set(rooms.map(room => room.id));
    const pointId = map.points.some(point => point.id === selected.pointId)
      ? selected.pointId
      : (map.points[0] && map.points[0].id) || null;
    const point = map.points.find(item => item.id === pointId);
    return {
      roomId: point && roomIds.has(point.roomId)
        ? point.roomId
        : (roomIds.has(selected.roomId) ? selected.roomId : (rooms[0] && rooms[0].id) || null),
      wallId: map.walls.some(wall => wall.id === selected.wallId) ? selected.wallId : null,
      pointId
    };
  }

  function validMap(map, rooms, home) {
    try {
      const base = requireCore().createInitialState();
      const selected = safeSelection(map, rooms, {});
      return requireCore().validateState({
        ...base,
        home: { ...base.home, ...home, name: text(home && home.name, base.home.name) },
        rooms,
        selected,
        map
      });
    } catch (_) {
      return false;
    }
  }

  function safeMap(candidate, fallback, rooms, home) {
    try {
      const mapped = portraitMap(candidate);
      if (validMap(mapped, rooms, home)) return mapped;
    } catch (_) {
      // Recover only this map below.
    }
    try {
      const mappedFallback = portraitMap(fallback);
      if (validMap(mappedFallback, rooms, home)) return mappedFallback;
    } catch (_) {
      // The deterministic empty map remains available.
    }
    return blankMap(fallback);
  }

  function floorIdCandidate(value, index) {
    const raw = text(value).toLowerCase();
    const slug = raw.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    if (slug) return slug;
    return index === 0 ? 'ground' : `level-${index}`;
  }

  function uniqueFloorId(value, index, used) {
    const base = floorIdCandidate(value, index);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) candidate = `${base}-${suffix++}`;
    used.add(candidate);
    return candidate;
  }

  function normalisePropertyState(value, options = {}) {
    const core = requireCore();
    const source = value && typeof value === 'object' ? clone(value) : core.createInitialState();
    const coreState = core.normaliseState(source);
    const rooms = coreState.rooms;
    const sourceHome = source.home && typeof source.home === 'object' ? source.home : {};
    const home = {
      ...coreState.home,
      ...sourceHome,
      name: text(sourceHome.name, coreState.home.name),
      address: text(sourceHome.address, text(options.defaultAddress, DEFAULT_ADDRESS))
    };
    const topMap = safeMap(source.map, coreState.map, rooms, home);
    const suppliedFloors = Array.isArray(sourceHome.floors) && sourceHome.floors.length
      ? sourceHome.floors
      : [{ id: 'ground', name: 'Ground floor', map: topMap }];
    const used = new Set();
    const idByIndex = [];
    const rawIds = [];
    const floors = suppliedFloors.map((floor, index) => {
      const sourceFloor = floor && typeof floor === 'object' ? floor : {};
      rawIds[index] = text(sourceFloor.id);
      const id = uniqueFloorId(sourceFloor.id, index, used);
      idByIndex[index] = id;
      const fallback = index === 0 ? topMap : blankMap(topMap);
      return {
        ...sourceFloor,
        id,
        name: text(sourceFloor.name, index === 0 ? 'Ground floor' : `Level ${index}`),
        map: safeMap(sourceFloor.map, fallback, rooms, home)
      };
    });
    const requestedActive = text(sourceHome.activeFloorId);
    const activeIndex = Math.max(0, rawIds.findIndex(id => id === requestedActive));
    const activeFloorId = idByIndex[activeIndex] || floors[0].id;
    const active = floors.find(floor => floor.id === activeFloorId) || floors[0];

    if (options.loadActiveFloor) {
      coreState.map = clone(active.map);
    } else {
      active.map = clone(topMap);
      coreState.map = clone(topMap);
    }
    coreState.home = { ...home, floors, activeFloorId: active.id };
    coreState.selected = safeSelection(coreState.map, rooms, source.selected || coreState.selected);
    return coreState;
  }

  function getActiveFloor(state) {
    const floors = state && state.home && Array.isArray(state.home.floors) ? state.home.floors : [];
    return floors.find(floor => floor && floor.id === state.home.activeFloorId) || floors[0] || null;
  }

  function chooseLegacyFloorPlanOwner(state, legacyRecord = {}) {
    const normalised = normalisePropertyState(state, { loadActiveFloor: true });
    const floors = normalised.home.floors;
    const withMetadata = floors.filter(floor => floor.map && floor.map.floorplan);
    const legacyName = text(legacyRecord.name);
    const legacyType = text(legacyRecord.type);
    const exact = withMetadata.filter(floor => {
      const metadata = floor.map.floorplan;
      return (!legacyName || text(metadata.name) === legacyName) && (!legacyType || text(metadata.type) === legacyType);
    });
    if (exact.length === 1) return exact[0].id;
    if (withMetadata.length === 1) return withMetadata[0].id;
    const ground = floors.find(floor => floor.id === 'ground') || floors.find(floor => /^ground(?:\s+floor)?$/i.test(floor.name));
    return (ground || floors[0]).id;
  }

  function syncActiveFloor(state) {
    return normalisePropertyState(state, { loadActiveFloor: false });
  }

  function activateFloor(state, floorId) {
    const synced = syncActiveFloor(state);
    const id = text(floorId);
    const target = synced.home.floors.find(floor => floor.id === id);
    if (!target) throw new Error(`Unknown floor: ${id || floorId}`);
    synced.home.activeFloorId = target.id;
    synced.map = clone(target.map);
    synced.selected = safeSelection(synced.map, synced.rooms, synced.selected);
    return synced;
  }

  function getPropertyDevices(state) {
    const synced = syncActiveFloor(state);
    const roomNames = new Map(synced.rooms.map(room => [room.id, room.name]));
    return synced.home.floors.flatMap(floor => (floor.map.points || []).map(point => ({
      ...clone(point),
      floorId: floor.id,
      floorName: floor.name,
      roomName: roomNames.get(point.roomId) || 'Unassigned'
    })));
  }

  function getPropertyReadiness(state) {
    const devices = getPropertyDevices(state);
    const statuses = devices.map(point => requireCore().deriveDeviceReadiness(point));
    const checks = devices.flatMap(point => Array.isArray(point.checks) ? point.checks : []);
    return {
      status: statuses.includes('attention') ? 'attention' : (!statuses.length || statuses.includes('pending') ? 'pending' : 'ready'),
      devices: devices.length,
      readyDevices: statuses.filter(status => status === 'ready').length,
      totalChecks: checks.length,
      passedChecks: checks.filter(check => check.status === 'pass').length,
      attentionChecks: checks.filter(check => check.status === 'fix').length
    };
  }

  function toExportShape(state) {
    const synced = syncActiveFloor(state);
    const roomIds = new Set(synced.rooms.map(room => room.id));
    const rooms = synced.home.floors.flatMap(floor => {
      const exportRooms = synced.rooms.map(room => ({
        id: `${floor.id}:${room.id}`,
        floorId: floor.id,
        floorName: floor.name,
        roomId: room.id,
        name: `${floor.name} - ${room.name}`,
        devices: (floor.map.points || []).filter(point => point.roomId === room.id).map(point => ({
          ...clone(point),
          type: point.category,
          floorId: floor.id,
          floorName: floor.name
        }))
      }));
      const unassigned = (floor.map.points || []).filter(point => !point.roomId || !roomIds.has(point.roomId));
      if (unassigned.length) exportRooms.push({
        id: `${floor.id}:unassigned`,
        floorId: floor.id,
        floorName: floor.name,
        roomId: null,
        name: `${floor.name} - Unassigned`,
        devices: unassigned.map(point => ({ ...clone(point), type: point.category, floorId: floor.id, floorName: floor.name }))
      });
      return exportRooms;
    });
    return {
      projectName: text(synced.home.address, synced.home.name),
      address: synced.home.address,
      rooms
    };
  }

  return Object.freeze({
    PORTRAIT_WIDTH,
    PORTRAIT_HEIGHT,
    DEFAULT_ADDRESS,
    portraitMap,
    blankMap,
    normalisePropertyState,
    syncActiveFloor,
    activateFloor,
    getActiveFloor,
    chooseLegacyFloorPlanOwner,
    getPropertyDevices,
    getPropertyReadiness,
    toExportShape
  });
});
