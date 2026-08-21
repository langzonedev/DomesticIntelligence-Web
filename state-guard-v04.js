(function () {
  'use strict';

  const Store = window.DIStorage;
  if (!Store) return;

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function sanitize(state) {
    if (!state || typeof state !== 'object' || !state.map) return state;
    const next = clone(state);
    const rooms = Array.isArray(next.rooms) ? next.rooms : [];
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
})();