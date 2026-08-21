import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

function makeLocalStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

function makeIndexedDb(initialRecord) {
  const records = new Map();
  if (initialRecord !== undefined) records.set('workspace-state-v2', initialRecord);
  const control = { abortWrites: true, abortDeletes: false };
  const database = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction(_name, mode) {
      const transaction = { error: null };
      transaction.objectStore = () => ({
        get(key) {
          const request = {};
          setTimeout(() => {
            request.result = records.get(key);
            request.onsuccess?.();
            setTimeout(() => transaction.oncomplete?.(), 0);
          }, 0);
          return request;
        },
        getAllKeys() {
          const request = {};
          setTimeout(() => {
            request.result = [...records.keys()];
            request.onsuccess?.();
            setTimeout(() => transaction.oncomplete?.(), 0);
          }, 0);
          return request;
        },
        put(value, key) {
          const request = {};
          setTimeout(() => {
            request.result = key;
            request.onsuccess?.();
            setTimeout(() => {
              if (control.abortWrites) {
                transaction.error = new Error('synthetic abort');
                transaction.onabort?.();
              } else {
                records.set(key, value);
                transaction.oncomplete?.();
              }
            }, 0);
          }, 0);
          return request;
        },
        delete(key) {
          const request = {};
          setTimeout(() => {
            request.onsuccess?.();
            if (control.abortDeletes) {
              transaction.error = new Error('synthetic delete abort');
              transaction.onabort?.();
            } else {
              records.delete(key);
              transaction.oncomplete?.();
            }
          }, 0);
          return request;
        }
      });
      assert.ok(mode === 'readonly' || mode === 'readwrite');
      return transaction;
    }
  };
  return {
    control,
    records,
    open() {
      const request = {};
      setTimeout(() => { request.result = database; request.onsuccess?.(); }, 0);
      return request;
    }
  };
}

async function loadStorage(indexedDB, localStorage) {
  const source = await readFile(new URL('../storage.js', import.meta.url), 'utf8');
  const context = {
    indexedDB,
    localStorage,
    module: { exports: {} },
    TextEncoder,
    Blob,
    FileReader: class TestFileReader {
      readAsDataURL(blob) {
        blob.arrayBuffer().then(buffer => {
          this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
          this.onload?.();
        }, error => {
          this.error = error;
          this.onerror?.();
        });
      }
    },
    console,
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'storage.js' });
  return context.module.exports;
}

test('an aborted IndexedDB replacement makes the successful fallback authoritative', async () => {
  const old = { schemaVersion: 2, state: { label: 'OLD-IDB' } };
  const indexedDB = makeIndexedDb(old);
  const localStorage = makeLocalStorage();
  const storage = await loadStorage(indexedDB, localStorage);

  const fallback = await storage.saveState({ label: 'NEW-FALLBACK' });
  assert.equal(fallback.storage, 'localstorage');
  assert.equal((await storage.loadState()).label, 'NEW-FALLBACK');

  indexedDB.control.abortWrites = false;
  const durable = await storage.saveState({ label: 'LATEST-IDB' });
  assert.equal(durable.storage, 'indexeddb');
  assert.equal((await storage.loadState()).label, 'LATEST-IDB');
});

test('an aborted IndexedDB delete leaves an authoritative deletion marker', async () => {
  const old = { schemaVersion: 2, state: { label: 'MUST-STAY-DELETED' } };
  const indexedDB = makeIndexedDb(old);
  indexedDB.control.abortDeletes = true;
  const storage = await loadStorage(indexedDB, makeLocalStorage());

  const removed = await storage.clearState();
  assert.equal(removed.storage, 'localstorage');
  assert.equal(await storage.loadState(), null);
});

function namedPng(contents, name) {
  const file = new Blob([contents], { type: 'image/png' });
  Object.defineProperty(file, 'name', { value: name });
  return file;
}

test('floor-aware plan records remain isolated by stable floor id', async () => {
  const indexedDB = makeIndexedDb();
  indexedDB.control.abortWrites = false;
  const storage = await loadStorage(indexedDB, makeLocalStorage());

  await storage.saveFloorPlan(namedPng('GROUND', 'ground.png'), {}, 'ground');
  await storage.saveFloorPlan(namedPng('LEVEL1', 'level1.png'), {}, 'level-1');

  assert.equal(await (await storage.loadFloorPlan('ground')).blob.text(), 'GROUND');
  assert.equal(await (await storage.loadFloorPlan('level-1')).blob.text(), 'LEVEL1');
  assert.notEqual(storage.floorPlanKey('ground'), storage.floorPlanKey('level-1'));
});

test('a legacy global plan migrates once to the requested floor after a verified copy', async () => {
  const indexedDB = makeIndexedDb();
  indexedDB.control.abortWrites = false;
  indexedDB.records.set('floor-plan-v2', {
    name: 'legacy.png', type: 'image/png', size: 6,
    transform: null, blob: namedPng('LEGACY', 'legacy.png')
  });
  const storage = await loadStorage(indexedDB, makeLocalStorage());

  const migrated = await storage.loadFloorPlan('ground');
  assert.equal(await migrated.blob.text(), 'LEGACY');
  assert.equal(migrated.floorId, 'ground');
  assert.equal(await storage.loadFloorPlan(), null);
  assert.equal(await storage.loadFloorPlan('level-1'), null);
});

test('a scoped read can defer legacy migration until the property owner is known', async () => {
  const indexedDB = makeIndexedDb();
  indexedDB.control.abortWrites = false;
  indexedDB.records.set('floor-plan-v2', {
    name: 'ground.png', type: 'image/png', size: 6,
    transform: null, blob: namedPng('GROUND', 'ground.png')
  });
  const storage = await loadStorage(indexedDB, makeLocalStorage());

  assert.equal(await storage.loadFloorPlan('level-1', { migrateLegacy: false }), null);
  assert.ok(await storage.loadFloorPlan());
  await storage.migrateLegacyFloorPlan('ground');
  assert.equal(await (await storage.loadFloorPlan('ground', { migrateLegacy: false })).blob.text(), 'GROUND');
  assert.equal(await storage.loadFloorPlan('level-1', { migrateLegacy: false }), null);
});

test('legacy migration converts a Blob safely when IndexedDB falls back', async () => {
  const indexedDB = makeIndexedDb();
  indexedDB.records.set('floor-plan-v2', {
    name: 'legacy.png', type: 'image/png', size: 6,
    transform: null, blob: namedPng('LEGACY', 'legacy.png')
  });
  const storage = await loadStorage(indexedDB, makeLocalStorage());

  const migrated = await storage.loadFloorPlan('ground');
  assert.match(migrated.dataUrl, /^data:image\/png;base64,/);
  assert.equal(migrated.blob, undefined);
  assert.equal(await storage.loadFloorPlan(), null);
});

test('clearAll removes state, legacy and every scoped floor plan', async () => {
  const indexedDB = makeIndexedDb();
  indexedDB.control.abortWrites = false;
  const storage = await loadStorage(indexedDB, makeLocalStorage());
  await storage.saveState({ home: { floors: [{ id: 'ground' }, { id: 'level-1' }] } });
  await storage.saveFloorPlan(namedPng('GROUND', 'ground.png'), {}, 'ground');
  await storage.saveFloorPlan(namedPng('LEVEL1', 'level1.png'), {}, 'level-1');
  await storage.saveFloorPlan(namedPng('LEGACY', 'legacy.png'));

  await storage.clearAll();
  assert.equal(await storage.loadState(), null);
  assert.equal(await storage.loadFloorPlan(), null);
  assert.equal(await storage.loadFloorPlan('ground'), null);
  assert.equal(await storage.loadFloorPlan('level-1'), null);
});
