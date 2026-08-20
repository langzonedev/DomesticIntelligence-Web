(function (root) {
  'use strict';

  const DB_NAME = 'domestic-intelligence';
  const DB_VERSION = 1;
  const RECORDS_STORE = 'records';
  const STATE_KEY = 'workspace-state-v2';
  const FLOOR_PLAN_KEY = 'floor-plan-v2';
  const FALLBACK_PREFIX = 'domestic-intelligence-v02:';
  const MAX_FLOOR_PLAN_BYTES = 15 * 1024 * 1024;
  const MAX_FALLBACK_BYTES = 3 * 1024 * 1024;
  const ALLOWED_FLOOR_PLAN_TYPES = Object.freeze([
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf'
  ]);

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
      await idbRequest('readwrite', store => store.put(value, key));
      clearFallback(getLocalStorage(), key);
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
    if (local && local.getItem(authorityKey(key)) === 'deleted') return null;
    if (local && local.getItem(authorityKey(key)) === 'localstorage') {
      const authoritative = readFallback(local, key);
      if (authoritative !== null) return authoritative;
    }
    try {
      const value = await idbRequest('readonly', store => store.get(key));
      if (value !== undefined) return value;
    } catch (_) {
      // A localStorage copy may still be recoverable.
    }
    return readFallback(local, key);
  }

  async function deleteRecord(key) {
    try {
      await idbRequest('readwrite', store => store.delete(key));
      clearFallback(getLocalStorage(), key);
      return { storage: 'indexeddb' };
    } catch (idbError) {
      const local = getLocalStorage();
      if (!local) throw new Error(`Could not remove local data: ${idbError.message}`);
      local.removeItem(fallbackKey(key));
      local.setItem(authorityKey(key), 'deleted');
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

  async function saveFloorPlan(file, metadata = {}) {
    const validation = validateFloorPlan(file);
    if (!validation.ok) throw new Error(validation.error);
    const safeMetadata = {
      name: String(metadata.name || file.name || 'Floor plan'),
      type: validation.type,
      size: validation.size,
      transform: metadata.transform && typeof metadata.transform === 'object' ? metadata.transform : null,
      savedAt: new Date().toISOString()
    };
    try {
      await idbRequest('readwrite', store => store.put({ ...safeMetadata, blob: file }, FLOOR_PLAN_KEY));
      clearFallback(getLocalStorage(), FLOOR_PLAN_KEY);
      return { storage: 'indexeddb', metadata: safeMetadata };
    } catch (idbError) {
      if (validation.size > MAX_FALLBACK_BYTES) {
        throw new Error(`IndexedDB is unavailable and this ${formatBytes(validation.size)} plan exceeds the ${formatBytes(MAX_FALLBACK_BYTES)} fallback limit.`);
      }
      const local = getLocalStorage();
      if (!local) throw new Error(`Floor-plan storage is unavailable: ${idbError.message}`);
      const dataUrl = await blobToDataURL(file);
      writeFallback(local, FLOOR_PLAN_KEY, { ...safeMetadata, dataUrl });
      return { storage: 'localstorage', metadata: safeMetadata, warning: 'Saved with limited browser fallback storage.' };
    }
  }

  async function loadFloorPlan() {
    return getRecord(FLOOR_PLAN_KEY);
  }

  async function clearAll() {
    await Promise.all([deleteRecord(STATE_KEY), deleteRecord(FLOOR_PLAN_KEY)]);
  }

  const api = Object.freeze({
    DB_NAME,
    STATE_KEY,
    FLOOR_PLAN_KEY,
    MAX_FLOOR_PLAN_BYTES,
    MAX_FALLBACK_BYTES,
    ALLOWED_FLOOR_PLAN_TYPES,
    byteSize,
    formatBytes,
    validateFloorPlan,
    blobToDataURL,
    saveState,
    loadState,
    clearState: () => deleteRecord(STATE_KEY),
    saveFloorPlan,
    loadFloorPlan,
    removeFloorPlan: () => deleteRecord(FLOOR_PLAN_KEY),
    clearAll
  });

  root.DIStorage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
