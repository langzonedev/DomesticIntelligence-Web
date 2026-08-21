(function (root) {
  'use strict';

  const DB_NAME = 'domestic-intelligence';
  const DB_VERSION = 1;
  const RECORDS_STORE = 'records';
  const STATE_KEY = 'workspace-state-v2';
  const FLOOR_PLAN_KEY = 'floor-plan-v2';
  const FLOOR_PLAN_KEY_PREFIX = 'floor-plan-v3:';
  const FALLBACK_PREFIX = 'domestic-intelligence-v02:';
  const MAX_FLOOR_PLAN_BYTES = 15 * 1024 * 1024;
  const MAX_FALLBACK_BYTES = 3 * 1024 * 1024;
  const ALLOWED_FLOOR_PLAN_TYPES = Object.freeze([
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf'
  ]);
  let legacyFloorPlanMigration = Promise.resolve();

  function byteSize(value) {
    if (value == null) return 0;
    if (typeof value.size === 'number') return value.size;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function validateFloorPlan(file, limit = MAX_FLOOR_PLAN_BYTES) {
    if (!file) return { ok: false, error: 'Choose a floor-plan file first.' };
    const type = String(file.type || '').toLowerCase();
    if (!ALLOWED_FLOOR_PLAN_TYPES.includes(type)) {
      return { ok: false, error: 'Use a PNG, JPEG, WebP or single-page PDF floor plan.' };
    }
    const size = byteSize(file);
    if (size > limit) {
      return {
        ok: false,
        error: `This floor plan is ${formatBytes(size)}. Use a file smaller than ${formatBytes(limit)} for reliable local storage.`
      };
    }
    return { ok: true, size, type };
  }

  function normaliseFloorId(floorId) {
    const value = String(floorId == null ? '' : floorId).trim();
    if (!value) throw new TypeError('A floor id is required.');
    return value;
  }

  function floorPlanKey(floorId) {
    return `${FLOOR_PLAN_KEY_PREFIX}${encodeURIComponent(normaliseFloorId(floorId))}`;
  }

  function getLocalStorage() {
    try {
      if (!root.localStorage) return null;
      const probe = `${FALLBACK_PREFIX}probe`;
      root.localStorage.setItem(probe, '1');
      root.localStorage.removeItem(probe);
      return root.localStorage;
    } catch (_) {
      return null;
    }
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) {
        reject(new Error('IndexedDB is unavailable.'));
        return;
      }
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RECORDS_STORE)) db.createObjectStore(RECORDS_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open local database.'));
    });
  }

  async function idbRequest(mode, operation) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(RECORDS_STORE, mode);
      const store = transaction.objectStore(RECORDS_STORE);
      let request, result, settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        db.close();
        reject(error || new Error('Local database transaction failed.'));
      };
      try {
        request = operation(store);
      } catch (error) {
        fail(error);
        return;
      }
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => fail(request.error || new Error('Local database operation failed.'));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        db.close();
        resolve(result);
      };
      transaction.onerror = () => fail(transaction.error || new Error('Local database transaction failed.'));
      transaction.onabort = () => fail(transaction.error || new Error('Local database transaction was aborted.'));
    });
  }

  function fallbackKey(key) {
    return `${FALLBACK_PREFIX}${key}`;
  }

  function authorityKey(key) {
    return `${FALLBACK_PREFIX}authority:${key}`;
  }

  function writeFallback(local, key, value) {
    local.setItem(fallbackKey(key), JSON.stringify(value));
    local.setItem(authorityKey(key), 'localstorage');
  }

  function clearFallback(local, key) {
    if (!local) return;
    local.removeItem(fallbackKey(key));
    local.removeItem(authorityKey(key));
  }

  function readFallback(local, key) {
    if (!local) return null;
    const raw = local.getItem(fallbackKey(key));
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (_) { clearFallback(local, key); return null; }
  }

  async function putRecord(key, value) {
    try {
      await idbRequest('readwrite', store => store.put({ ...value, __authority: 'indexeddb' }, key));
      try { clearFallback(getLocalStorage(), key); } catch (_) { /* IndexedDB is already authoritative. */ }
      return { storage: 'indexeddb' };
    } catch (idbError) {
      const local = getLocalStorage();
      if (!local) throw new Error(`Local storage is unavailable: ${idbError.message}`);
      writeFallback(local, key, value);
      return { storage: 'localstorage', warning: 'IndexedDB was unavailable; this item was saved using limited browser storage.' };
    }
  }

  async function getRecord(key) {
    const local = getLocalStorage();
    const authority = local && local.getItem(authorityKey(key));
    const fallback = readFallback(local, key);
    let indexed;
    try {
      indexed = await idbRequest('readonly', store => store.get(key));
    } catch (_) {
      // A localStorage copy may still be recoverable.
    }
    if (indexed && indexed.__deleted === true) {
      const fallbackTime = Date.parse(fallback?.savedAt || '') || 0;
      const tombstoneTime = Date.parse(indexed.savedAt || '') || Number.MAX_SAFE_INTEGER;
      if (authority === 'localstorage' && fallback !== null && fallbackTime > tombstoneTime) return fallback;
      return null;
    }
    if (authority === 'deleted') {
      if (indexed?.__authority === 'indexeddb') return indexed;
      return null;
    }
    if (typeof authority === 'string' && authority.startsWith('deleted:')) {
      const deletedTime = Date.parse(authority.slice('deleted:'.length)) || Number.MAX_SAFE_INTEGER;
      const indexedTime = Date.parse(indexed?.savedAt || '') || 0;
      if (indexed === undefined || deletedTime > indexedTime) return null;
    }
    if (authority === 'localstorage' && fallback !== null) {
      const fallbackTime = Date.parse(fallback.savedAt || '') || 0;
      const indexedTime = Date.parse(indexed?.savedAt || '') || 0;
      if (indexed === undefined || fallbackTime > indexedTime) return fallback;
    }
    if (indexed !== undefined) return indexed;
    return fallback;
  }

  async function deleteRecord(key) {
    try {
      await idbRequest('readwrite', store => store.put({ __deleted: true, __authority: 'indexeddb', savedAt: new Date().toISOString() }, key));
      try { clearFallback(getLocalStorage(), key); } catch (_) { /* The durable IndexedDB tombstone remains authoritative. */ }
      return { storage: 'indexeddb' };
    } catch (idbError) {
      const local = getLocalStorage();
      if (!local) throw new Error(`Could not remove local data: ${idbError.message}`);
      local.removeItem(fallbackKey(key));
      local.setItem(authorityKey(key), `deleted:${new Date().toISOString()}`);
      return { storage: 'localstorage', warning: 'IndexedDB removal failed; a local deletion marker will keep this item removed.' };
    }
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      if (typeof FileReader === 'undefined') {
        reject(new Error('This browser cannot prepare the floor plan for fallback storage.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Could not read floor-plan file.'));
      reader.readAsDataURL(blob);
    });
  }

  async function saveState(state) {
    if (!state || typeof state !== 'object') throw new TypeError('State must be an object.');
    return putRecord(STATE_KEY, { schemaVersion: 2, savedAt: new Date().toISOString(), state });
  }

  async function loadState() {
    const record = await getRecord(STATE_KEY);
    return record && record.schemaVersion === 2 && record.state && typeof record.state === 'object'
      ? record.state
      : null;
  }

  function requestedFloorId(metadata, floorId) {
    if (floorId !== undefined && floorId !== null) return normaliseFloorId(floorId);
    if (metadata && metadata.floorId !== undefined && metadata.floorId !== null) return normaliseFloorId(metadata.floorId);
    return null;
  }

  async function saveFloorPlan(file, metadata = {}, floorId) {
    const validation = validateFloorPlan(file);
    if (!validation.ok) throw new Error(validation.error);
    const scopedFloorId = requestedFloorId(metadata, floorId);
    const recordKey = scopedFloorId ? floorPlanKey(scopedFloorId) : FLOOR_PLAN_KEY;
    const safeMetadata = {
      name: String(metadata.name || file.name || 'Floor plan'),
      type: validation.type,
      size: validation.size,
      transform: metadata.transform && typeof metadata.transform === 'object' ? metadata.transform : null,
      savedAt: new Date().toISOString()
    };
    if (scopedFloorId) safeMetadata.floorId = scopedFloorId;
    try {
      await idbRequest('readwrite', store => store.put({ ...safeMetadata, blob: file, __authority: 'indexeddb' }, recordKey));
      try { clearFallback(getLocalStorage(), recordKey); } catch (_) { /* The committed IndexedDB record remains valid. */ }
      return { storage: 'indexeddb', metadata: safeMetadata };
    } catch (idbError) {
      if (validation.size > MAX_FALLBACK_BYTES) {
        throw new Error(`IndexedDB is unavailable and this ${formatBytes(validation.size)} plan exceeds the ${formatBytes(MAX_FALLBACK_BYTES)} fallback limit.`);
      }
      const local = getLocalStorage();
      if (!local) throw new Error(`Floor-plan storage is unavailable: ${idbError.message}`);
      const dataUrl = await blobToDataURL(file);
      writeFallback(local, recordKey, { ...safeMetadata, dataUrl });
      return { storage: 'localstorage', metadata: safeMetadata, warning: 'Saved with limited browser fallback storage.' };
    }
  }

  async function migrateLegacyFloorPlan(floorId) {
    const scopedFloorId = normaliseFloorId(floorId);
    const scopedKey = floorPlanKey(scopedFloorId);
    const task = async () => {
      const existing = await getRecord(scopedKey);
      if (existing) return existing;
      const legacy = await getRecord(FLOOR_PLAN_KEY);
      if (!legacy) return null;
      const migrated = { ...legacy, floorId: scopedFloorId, migratedFrom: FLOOR_PLAN_KEY };
      const copied = await putRecord(scopedKey, migrated);
      if (copied.storage === 'localstorage' && migrated.blob) {
        const size = byteSize(migrated.blob);
        if (size > MAX_FALLBACK_BYTES) {
          clearFallback(getLocalStorage(), scopedKey);
          throw new Error(`IndexedDB is unavailable and this ${formatBytes(size)} legacy plan exceeds the ${formatBytes(MAX_FALLBACK_BYTES)} fallback limit. The original plan was preserved.`);
        }
        try {
          const dataUrl = await blobToDataURL(migrated.blob);
          const { blob: _blob, ...fallbackRecord } = migrated;
          writeFallback(getLocalStorage(), scopedKey, { ...fallbackRecord, dataUrl });
        } catch (error) {
          clearFallback(getLocalStorage(), scopedKey);
          throw error;
        }
      }
      const verified = await getRecord(scopedKey);
      if (!verified || (!verified.blob && !verified.dataUrl)) {
        clearFallback(getLocalStorage(), scopedKey);
        throw new Error('The legacy floor plan could not be verified after migration. The original plan was preserved.');
      }
      await deleteRecord(FLOOR_PLAN_KEY);
      return verified;
    };
    const run = legacyFloorPlanMigration.then(task, task);
    legacyFloorPlanMigration = run.catch(() => null);
    return run;
  }

  async function loadFloorPlan(floorId, options = {}) {
    if (floorId === undefined || floorId === null) return getRecord(FLOOR_PLAN_KEY);
    const scopedFloorId = normaliseFloorId(floorId);
    const existing = await getRecord(floorPlanKey(scopedFloorId));
    if (existing || options.migrateLegacy === false) return existing;
    return migrateLegacyFloorPlan(scopedFloorId);
  }

  async function removeFloorPlan(floorId) {
    const key = floorId === undefined || floorId === null ? FLOOR_PLAN_KEY : floorPlanKey(floorId);
    return deleteRecord(key);
  }

  async function storedFloorPlanKeys() {
    const keys = new Set([FLOOR_PLAN_KEY]);
    try {
      const idbKeys = await idbRequest('readonly', store => store.getAllKeys());
      (Array.isArray(idbKeys) ? idbKeys : []).forEach(key => {
        if (typeof key === 'string' && key.startsWith(FLOOR_PLAN_KEY_PREFIX)) keys.add(key);
      });
    } catch (_) {
      // Explicit floor ids and browser fallback keys still provide a safe cleanup path.
    }
    const local = getLocalStorage();
    if (local && Number.isFinite(Number(local.length)) && typeof local.key === 'function') {
      for (let index = 0; index < local.length; index += 1) {
        const key = local.key(index);
        const prefix = fallbackKey(FLOOR_PLAN_KEY_PREFIX);
        if (typeof key === 'string' && key.startsWith(prefix)) keys.add(key.slice(FALLBACK_PREFIX.length));
      }
    }
    return [...keys];
  }

  async function clearFloorPlans(floorIds = []) {
    const keys = new Set(await storedFloorPlanKeys());
    (Array.isArray(floorIds) ? floorIds : [floorIds]).filter(value => value !== undefined && value !== null && String(value).trim()).forEach(floorId => keys.add(floorPlanKey(floorId)));
    return Promise.all([...keys].map(key => deleteRecord(key)));
  }

  async function clearAll(floorIds = []) {
    let stateFloorIds = [];
    try {
      const state = await loadState();
      stateFloorIds = Array.isArray(state && state.home && state.home.floors)
        ? state.home.floors.map(floor => floor && floor.id).filter(Boolean)
        : [];
    } catch (_) {
      // Cleanup remains useful even when the saved state is malformed.
    }
    await clearFloorPlans([...stateFloorIds, ...(Array.isArray(floorIds) ? floorIds : [floorIds])]);
    await deleteRecord(STATE_KEY);
  }

  const api = Object.freeze({
    DB_NAME,
    STATE_KEY,
    FLOOR_PLAN_KEY,
    FLOOR_PLAN_KEY_PREFIX,
    MAX_FLOOR_PLAN_BYTES,
    MAX_FALLBACK_BYTES,
    ALLOWED_FLOOR_PLAN_TYPES,
    byteSize,
    formatBytes,
    validateFloorPlan,
    floorPlanKey,
    blobToDataURL,
    saveState,
    loadState,
    clearState: () => deleteRecord(STATE_KEY),
    saveFloorPlan,
    loadFloorPlan,
    migrateLegacyFloorPlan,
    removeFloorPlan,
    clearFloorPlans,
    clearAll
  });

  root.DIStorage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
