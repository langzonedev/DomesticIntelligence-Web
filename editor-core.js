(function initialiseDIEditorCore(root, factory) {
  const api = factory();
  root.DIEditorCore = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createEditorCore() {
  "use strict";

  const SCHEMA_VERSION = 2;
  const CHECK_STATUSES = new Set(["pending", "pass", "fix"]);
  const DEFAULT_LAYERS = Object.freeze({
    floorplan: true,
    walls: true,
    devices: true,
    status: true,
    labels: true,
  });

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function text(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
  }

  function makeId(prefix) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function createInitialState() {
    const checks = (...names) => names.map((name) => ({ name, status: "pending" }));
    return {
      schemaVersion: SCHEMA_VERSION,
      workspaceMode: "view",
      view: "commission",
      home: { id: "home-demo", name: "Willow Street demonstration home" },
      selected: { roomId: "kitchen", wallId: null, pointId: "point-kitchen-light" },
      rooms: [
        { id: "kitchen", name: "Kitchen" },
        { id: "living", name: "Living room" },
        { id: "bedroom", name: "Main bedroom" },
        { id: "entry", name: "Front entry" },
      ],
      map: {
        width: 1200,
        height: 800,
        gridSize: 20,
        snapDistance: 14,
        layers: { ...DEFAULT_LAYERS },
        floorplan: null,
        walls: [
          { id: "wall-top", x1: 80, y1: 80, x2: 1120, y2: 80 },
          { id: "wall-right", x1: 1120, y1: 80, x2: 1120, y2: 720 },
          { id: "wall-bottom", x1: 1120, y1: 720, x2: 80, y2: 720 },
          { id: "wall-left", x1: 80, y1: 720, x2: 80, y2: 80 },
          { id: "wall-centre-v", x1: 660, y1: 80, x2: 660, y2: 720 },
          { id: "wall-centre-h", x1: 80, y1: 410, x2: 1120, y2: 410 },
        ],
        points: [
          {
            id: "point-kitchen-light", roomId: "kitchen", x: 315, y: 245,
            name: "Kitchen pendants", category: "Lighting", brand: "Synthetic Lighting Co.",
            model: "Matter Dimmer Demo", serialNumber: "DEMO-LGT-001", ipAddress: "",
            notes: "Synthetic demonstration device only.",
            checks: checks("Power and response", "Dimming", "Scene recall"),
          },
          {
            id: "point-kitchen-sensor", roomId: "kitchen", x: 520, y: 330,
            name: "Kitchen motion", category: "Sensor", brand: "Synthetic Sensor Co.",
            model: "Occupancy Demo", serialNumber: "DEMO-SNS-001", ipAddress: "192.0.2.21",
            notes: "Example TEST-NET address; not a real installation.",
            checks: checks("Occupancy", "Clear state"),
          },
          {
            id: "point-living-blind", roomId: "living", x: 890, y: 245,
            name: "Living room blind", category: "Blind", brand: "Synthetic Shading Co.",
            model: "Shade Motor Demo", serialNumber: "DEMO-SHD-001", ipAddress: "demo-blind.local",
            notes: "Synthetic demonstration device only.",
            checks: checks("Open", "Close", "Position"),
          },
          {
            id: "point-bedroom-thermostat", roomId: "bedroom", x: 350, y: 565,
            name: "Bedroom thermostat", category: "Climate", brand: "Synthetic Climate Co.",
            model: "Thermostat Demo", serialNumber: "DEMO-CLM-001", ipAddress: "2001:db8::25",
            notes: "Example documentation address; not a real installation.",
            checks: checks("Temperature", "Setpoint", "Mode"),
          },
          {
            id: "point-entry-lock", roomId: "entry", x: 880, y: 555,
            name: "Front door lock", category: "Access", brand: "Synthetic Access Co.",
            model: "Door Lock Demo", serialNumber: "DEMO-LCK-001", ipAddress: "",
            notes: "Synthetic demonstration device only.",
            checks: checks("Lock", "Unlock", "Door state"),
          },
        ],
      },
    };
  }

  function isCheck(check) {
    return Boolean(check && text(check.name) && CHECK_STATUSES.has(check.status));
  }

  function isWall(wall) {
    if (!wall || !text(wall.id)) return false;
    const values = [wall.x1, wall.y1, wall.x2, wall.y2];
    return values.every((value) => Number.isFinite(Number(value))) &&
      (Number(wall.x1) !== Number(wall.x2) || Number(wall.y1) !== Number(wall.y2));
  }

  function isPoint(point, roomIds) {
    return Boolean(point && text(point.id) && text(point.name) &&
      Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)) &&
      (!point.roomId || roomIds.has(point.roomId)) &&
      (!point.ipAddress || isValidNetworkAddress(point.ipAddress)) &&
      Array.isArray(point.checks) && point.checks.every(isCheck));
  }

  function validateState(state) {
    if (!state || state.schemaVersion !== SCHEMA_VERSION || !state.home || !text(state.home.name)) return false;
    if (!['view', 'edit'].includes(state.workspaceMode) || !['commission', 'handover'].includes(state.view)) return false;
    if (!state.selected || typeof state.selected !== 'object' || !['roomId', 'wallId', 'pointId'].every((key) => Object.prototype.hasOwnProperty.call(state.selected, key))) return false;
    if (!Array.isArray(state.rooms) || !state.rooms.length) return false;
    const roomIds = new Set();
    for (const room of state.rooms) {
      if (!room || !text(room.id) || !text(room.name) || roomIds.has(room.id)) return false;
      roomIds.add(room.id);
    }
    const map = state.map;
    if (!map || !Number.isFinite(Number(map.width)) || Number(map.width) <= 0 ||
      !Number.isFinite(Number(map.height)) || Number(map.height) <= 0 ||
      !Number.isFinite(Number(map.gridSize)) || Number(map.gridSize) <= 0 ||
      !Number.isFinite(Number(map.snapDistance)) || Number(map.snapDistance) < 0 ||
      !map.layers || Object.keys(DEFAULT_LAYERS).some((key) => typeof map.layers[key] !== "boolean") ||
      !Array.isArray(map.walls) || !Array.isArray(map.points)) return false;
    if (map.floorplan !== null) {
      const plan = map.floorplan, transform = plan && plan.transform;
      if (!plan || !text(plan.name) || !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(plan.type) || !transform) return false;
      const values = [transform.x, transform.y, transform.scale, transform.rotation, transform.opacity];
      if (!values.every((value) => Number.isFinite(Number(value))) || Number(transform.scale) < 25 || Number(transform.scale) > 250 || Number(transform.rotation) < -180 || Number(transform.rotation) > 180 || Number(transform.opacity) < 10 || Number(transform.opacity) > 100) return false;
    }
    const ids = new Set();
    for (const item of [...map.walls, ...map.points]) {
      if (ids.has(item && item.id)) return false;
      ids.add(item && item.id);
    }
    if (!map.walls.every(isWall) || !map.points.every((point) => isPoint(point, roomIds))) return false;
    const selected = state.selected;
    if (selected.roomId !== null && selected.roomId !== undefined && !roomIds.has(selected.roomId)) return false;
    if (selected.wallId !== null && selected.wallId !== undefined && !map.walls.some((wall) => wall.id === selected.wallId)) return false;
    if (selected.pointId !== null && selected.pointId !== undefined && !map.points.some((point) => point.id === selected.pointId)) return false;
    return true;
  }

  function normaliseChecks(checks) {
    if (!Array.isArray(checks)) return [];
    return checks
      .filter((check) => check && text(check.name))
      .map((check) => ({ name: text(check.name), status: CHECK_STATUSES.has(check.status) ? check.status : "pending" }));
  }

  function migrateV1(oldState) {
    if (!oldState || !Array.isArray(oldState.rooms) || !oldState.rooms.length) return createInitialState();
    const base = createInitialState();
    const rooms = oldState.rooms
      .filter((room) => room && text(room.id) && text(room.name))
      .map((room) => ({ id: text(room.id), name: text(room.name) }));
    if (!rooms.length) return base;
    const points = [];
    oldState.rooms.forEach((room, roomIndex) => {
      if (!room || !Array.isArray(room.devices)) return;
      room.devices.forEach((device, deviceIndex) => {
        if (!device || !text(device.id) || !text(device.name)) return;
        const column = roomIndex % 2;
        const row = Math.floor(roomIndex / 2);
        points.push({
          id: text(device.id),
          roomId: text(room.id),
          x: 260 + column * 560 + deviceIndex * 70,
          y: 210 + row * 340 + deviceIndex * 55,
          name: text(device.name),
          category: text(device.type, "Device"),
          brand: text(device.brand),
          model: text(device.model),
          serialNumber: text(device.serialNumber),
          ipAddress: isValidNetworkAddress(device.ipAddress) ? text(device.ipAddress) : "",
          notes: text(device.notes),
          checks: normaliseChecks(device.checks),
        });
      });
    });
    return {
      ...base,
      view: oldState.mode === "handover" ? "handover" : "commission",
      home: { ...base.home, name: text(oldState.homeName, base.home.name) },
      selected: {
        roomId: rooms.some((room) => room.id === oldState.selectedRoom) ? oldState.selectedRoom : rooms[0].id,
        wallId: null,
        pointId: points.some((point) => point.id === oldState.selectedDevice) ? oldState.selectedDevice : null,
      },
      rooms,
      map: { ...base.map, points },
    };
  }

  function normaliseState(value) {
    try {
      if (validateState(value)) return clone(value);
      if (value && (value.schemaVersion === 1 || (!value.schemaVersion && Array.isArray(value.rooms)))) {
        const migrated = migrateV1(value);
        return validateState(migrated) ? migrated : createInitialState();
      }
    } catch (_) {
      // Malformed browser data must never strand the editor on a blank screen.
    }
    return createInitialState();
  }

  function deriveDeviceReadiness(point) {
    const statuses = Array.isArray(point && point.checks) ? point.checks.map((check) => check.status) : [];
    if (statuses.includes("fix")) return "attention";
    if (!statuses.length || statuses.includes("pending") || statuses.some((status) => !CHECK_STATUSES.has(status))) return "pending";
    return "ready";
  }

  function deriveRoomReadiness(state, roomId) {
    const points = state && state.map && Array.isArray(state.map.points)
      ? state.map.points.filter((point) => point.roomId === roomId)
      : [];
    if (!points.length) return "empty";
    const statuses = points.map(deriveDeviceReadiness);
    if (statuses.includes("attention")) return "attention";
    if (statuses.includes("pending")) return "pending";
    return "ready";
  }

  function deriveHomeReadiness(state) {
    const roomStatuses = (Array.isArray(state && state.rooms)
      ? state.rooms.map((room) => deriveRoomReadiness(state, room.id))
      : []).filter((status) => status !== "empty");
    if (roomStatuses.includes("attention")) return "attention";
    if (!roomStatuses.length || roomStatuses.includes("pending")) return "pending";
    return "ready";
  }

  function getReadinessSummary(state) {
    const points = state && state.map && Array.isArray(state.map.points) ? state.map.points : [];
    const checks = points.flatMap((point) => Array.isArray(point.checks) ? point.checks : []);
    return {
      status: deriveHomeReadiness(state),
      devices: points.length,
      readyDevices: points.filter((point) => deriveDeviceReadiness(point) === "ready").length,
      totalChecks: checks.length,
      passedChecks: checks.filter((check) => check.status === "pass").length,
      attentionChecks: checks.filter((check) => check.status === "fix").length,
    };
  }

  function createHistory(initialState, limit = 50) {
    return { past: [], present: clone(normaliseState(initialState)), future: [], limit: Math.max(1, finite(limit, 50)) };
  }

  function commitHistory(history, nextState) {
    const current = history && history.present ? history : createHistory(nextState);
    const past = [...current.past, clone(current.present)].slice(-current.limit);
    return { past, present: clone(normaliseState(nextState)), future: [], limit: current.limit };
  }

  function undoHistory(history) {
    if (!history || !history.past || !history.past.length) return history;
    const previous = history.past[history.past.length - 1];
    return {
      past: history.past.slice(0, -1),
      present: clone(previous),
      future: [clone(history.present), ...history.future],
      limit: history.limit,
    };
  }

  function redoHistory(history) {
    if (!history || !history.future || !history.future.length) return history;
    const next = history.future[0];
    return {
      past: [...history.past, clone(history.present)].slice(-history.limit),
      present: clone(next),
      future: history.future.slice(1),
      limit: history.limit,
    };
  }

  function replaceMapCollection(state, key, collection) {
    return { ...state, map: { ...state.map, [key]: collection } };
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function snapPoint(state, point, options = {}) {
    const map = state.map;
    const snapDistance = Math.max(0, finite(options.snapDistance, map.snapDistance));
    const gridSize = Math.max(1, finite(options.gridSize, map.gridSize));
    const proposed = { x: finite(point.x), y: finite(point.y) };
    if (options.endpoints !== false) {
      const endpoints = map.walls
        .filter((wall) => wall.id !== options.excludeWallId)
        .flatMap((wall) => [{ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }]);
      let nearest = null;
      for (const endpoint of endpoints) {
        const gap = distance(proposed, endpoint);
        if (gap <= snapDistance && (!nearest || gap < nearest.gap)) nearest = { ...endpoint, gap };
      }
      if (nearest) return { x: nearest.x, y: nearest.y };
    }
    if (options.grid !== false) {
      return { x: Math.round(proposed.x / gridSize) * gridSize, y: Math.round(proposed.y / gridSize) * gridSize };
    }
    return proposed;
  }

  function wallOrThrow(state, wallId) {
    const wall = state.map.walls.find((item) => item.id === wallId);
    if (!wall) throw new Error(`Unknown wall: ${wallId}`);
    return wall;
  }

  function addWall(inputState, wall, options = {}) {
    const state = normaliseState(inputState);
    const id = text(wall && wall.id) || makeId("wall");
    if (state.map.walls.some((item) => item.id === id) || state.map.points.some((item) => item.id === id)) {
      throw new Error(`Duplicate spatial id: ${id}`);
    }
    const start = snapPoint(state, { x: wall && wall.x1, y: wall && wall.y1 }, options);
    const end = snapPoint(state, { x: wall && wall.x2, y: wall && wall.y2 }, options);
    const nextWall = { id, x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    if (!isWall(nextWall)) throw new Error("A wall needs two different endpoints.");
    return replaceMapCollection(state, "walls", [...state.map.walls, nextWall]);
  }

  function moveWall(inputState, wallId, delta, options = {}) {
    const state = normaliseState(inputState);
    const wall = wallOrThrow(state, wallId);
    const dx = finite(delta && delta.x);
    const dy = finite(delta && delta.y);
    const moved = {
      ...wall,
      x1: wall.x1 + dx, y1: wall.y1 + dy,
      x2: wall.x2 + dx, y2: wall.y2 + dy,
    };
    const candidates = [
      { key: "start", point: { x: moved.x1, y: moved.y1 } },
      { key: "end", point: { x: moved.x2, y: moved.y2 } },
    ].map((candidate) => ({
      ...candidate,
      snapped: snapPoint(state, candidate.point, { ...options, excludeWallId: wallId }),
    })).map((candidate) => ({
      ...candidate,
      correction: {
        x: candidate.snapped.x - candidate.point.x,
        y: candidate.snapped.y - candidate.point.y,
      },
    })).sort((a, b) => Math.hypot(a.correction.x, a.correction.y) - Math.hypot(b.correction.x, b.correction.y));
    const correction = candidates[0].correction;
    const nextWall = {
      ...moved,
      x1: moved.x1 + correction.x, y1: moved.y1 + correction.y,
      x2: moved.x2 + correction.x, y2: moved.y2 + correction.y,
    };
    return replaceMapCollection(state, "walls", state.map.walls.map((item) => item.id === wallId ? nextWall : item));
  }

  function resizeWall(inputState, wallId, endpoint, position, options = {}) {
    const state = normaliseState(inputState);
    const wall = wallOrThrow(state, wallId);
    if (endpoint !== "start" && endpoint !== "end") throw new Error("Endpoint must be 'start' or 'end'.");
    const snapped = snapPoint(state, position || {}, { ...options, excludeWallId: wallId });
    const nextWall = endpoint === "start"
      ? { ...wall, x1: snapped.x, y1: snapped.y }
      : { ...wall, x2: snapped.x, y2: snapped.y };
    if (!isWall(nextWall)) throw new Error("A wall needs two different endpoints.");
    return replaceMapCollection(state, "walls", state.map.walls.map((item) => item.id === wallId ? nextWall : item));
  }

  function removeWall(inputState, wallId) {
    const state = normaliseState(inputState);
    wallOrThrow(state, wallId);
    const walls = state.map.walls.filter((wall) => wall.id !== wallId);
    const selected = state.selected && state.selected.wallId === wallId
      ? { ...state.selected, wallId: null }
      : state.selected;
    return { ...replaceMapCollection(state, "walls", walls), selected };
  }

  function isValidIPv4(value) {
    const parts = String(value).split(".");
    return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255 && String(Number(part)) === part);
  }

  function isValidIPv6(value) {
    const address = String(value).split("%")[0];
    if (!address.includes(":")) return false;
    if (address.includes(":::") || (address.startsWith(":") && !address.startsWith("::")) ||
      (address.endsWith(":") && !address.endsWith("::"))) return false;
    if ((address.match(/::/g) || []).length > 1) return false;
    const halves = address.split("::");
    if (halves.length > 2) return false;
    const tokens = address.split(":").filter(Boolean);
    let units = 0;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token.includes(".")) {
        if (index !== tokens.length - 1 || !isValidIPv4(token)) return false;
        units += 2;
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(token)) return false;
        units += 1;
      }
    }
    return address.includes("::") ? units < 8 : units === 8;
  }

  function isValidHostname(value) {
    const hostname = String(value).toLowerCase();
    if (hostname === "localhost") return true;
    if (hostname.length > 253 || !hostname.includes(".")) return false;
    return hostname.split(".").every((label) =>
      label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
  }

  function isValidNetworkAddress(value) {
    const candidate = text(value);
    if (candidate === "") return true;
    // A dotted numeric value is an IPv4 attempt, not a valid DNS hostname.
    if (/^[\d.]+$/.test(candidate)) return isValidIPv4(candidate);
    return isValidIPv4(candidate) || isValidIPv6(candidate) || isValidHostname(candidate);
  }

  function normalisePoint(point, state, existingId) {
    const id = text(point && point.id, existingId) || makeId("point");
    const roomId = text(point && point.roomId);
    if (roomId && !state.rooms.some((room) => room.id === roomId)) throw new Error(`Unknown room: ${roomId}`);
    const ipAddress = text(point && point.ipAddress);
    if (!isValidNetworkAddress(ipAddress)) throw new Error("Enter a valid IPv4, IPv6 or hostname, or leave the address blank.");
    return {
      id,
      roomId: roomId || null,
      x: finite(point && point.x),
      y: finite(point && point.y),
      name: text(point && point.name, "New device"),
      category: text(point && point.category, "Device"),
      brand: text(point && point.brand),
      model: text(point && point.model),
      serialNumber: text(point && point.serialNumber),
      ipAddress,
      notes: text(point && point.notes),
      checks: normaliseChecks(point && point.checks),
    };
  }

  function pointOrThrow(state, pointId) {
    const point = state.map.points.find((item) => item.id === pointId);
    if (!point) throw new Error(`Unknown point: ${pointId}`);
    return point;
  }

  function addPoint(inputState, point) {
    const state = normaliseState(inputState);
    const nextPoint = normalisePoint(point, state);
    if (state.map.points.some((item) => item.id === nextPoint.id) || state.map.walls.some((item) => item.id === nextPoint.id)) {
      throw new Error(`Duplicate spatial id: ${nextPoint.id}`);
    }
    return replaceMapCollection(state, "points", [...state.map.points, nextPoint]);
  }

  function movePoint(inputState, pointId, position, options = {}) {
    const state = normaliseState(inputState);
    pointOrThrow(state, pointId);
    const nextPosition = options.snap ? snapPoint(state, position || {}, { ...options, endpoints: false }) : {
      x: finite(position && position.x), y: finite(position && position.y),
    };
    return replaceMapCollection(state, "points", state.map.points.map((point) =>
      point.id === pointId ? { ...point, ...nextPosition } : point));
  }

  function updatePoint(inputState, pointId, patch) {
    const state = normaliseState(inputState);
    const current = pointOrThrow(state, pointId);
    const nextPoint = normalisePoint({ ...current, ...patch, id: pointId }, state, pointId);
    return replaceMapCollection(state, "points", state.map.points.map((point) => point.id === pointId ? nextPoint : point));
  }

  function removePoint(inputState, pointId) {
    const state = normaliseState(inputState);
    pointOrThrow(state, pointId);
    const points = state.map.points.filter((point) => point.id !== pointId);
    const selected = state.selected && state.selected.pointId === pointId
      ? { ...state.selected, pointId: null }
      : state.selected;
    return { ...replaceMapCollection(state, "points", points), selected };
  }

  function setLayerVisibility(inputState, layer, visible) {
    const state = normaliseState(inputState);
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_LAYERS, layer)) throw new Error(`Unknown layer: ${layer}`);
    return { ...state, map: { ...state.map, layers: { ...state.map.layers, [layer]: Boolean(visible) } } };
  }

  function toggleLayer(inputState, layer) {
    const state = normaliseState(inputState);
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_LAYERS, layer)) throw new Error(`Unknown layer: ${layer}`);
    return setLayerVisibility(state, layer, !state.map.layers[layer]);
  }

  function showAllLayers(inputState) {
    const state = normaliseState(inputState);
    return { ...state, map: { ...state.map, layers: { ...DEFAULT_LAYERS } } };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    DEFAULT_LAYERS,
    createInitialState,
    validateState,
    normaliseState,
    migrateV1,
    deriveDeviceReadiness,
    deriveRoomReadiness,
    deriveHomeReadiness,
    getReadinessSummary,
    createHistory,
    commitHistory,
    undoHistory,
    redoHistory,
    snapPoint,
    addWall,
    moveWall,
    resizeWall,
    removeWall,
    isValidIPv4,
    isValidIPv6,
    isValidHostname,
    isValidNetworkAddress,
    addPoint,
    movePoint,
    updatePoint,
    removePoint,
    setLayerVisibility,
    toggleLayer,
    showAllLayers,
  });
});
