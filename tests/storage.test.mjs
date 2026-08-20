import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

function makeLocalStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

function makeIndexedDb(initialRecord) {
  let record = initialRecord;
  const control = { abortWrites: true, abortDeletes: false };
  const database = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction(_name, mode) {
      const transaction = { error: null };
      transaction.objectStore = () => ({
        get() {
          const request = {};
          setTimeout(() => {
            request.result = record;
            request.onsuccess?.();
            setTimeout(() => transaction.oncomplete?.(), 0);
          }, 0);
          return request;
        },
        put(value) {
          const request = {};
          setTimeout(() => {
            request.result = 'workspace-state-v2';
            request.onsuccess?.();
            setTimeout(() => {
              if (control.abortWrites) {
                transaction.error = new Error('synthetic abort');
                transaction.onabort?.();
              } else {
                record = value;
                transaction.oncomplete?.();
              }
            }, 0);
          }, 0);
          return request;
        },
        delete() {
          const request = {};
          setTimeout(() => {
            request.onsuccess?.();
            if (control.abortDeletes) {
              transaction.error = new Error('synthetic delete abort');
              transaction.onabort?.();
            } else {
              record = undefined;
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
