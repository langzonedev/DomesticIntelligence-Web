import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const exporters = require('../exporters.js');
const storage = require('../storage.js');

const state = {
  projectName: 'Synthetic House',
  rooms: [{
    name: 'Living room',
    devices: [{
      name: '=West blind',
      type: 'Motorised blind',
      category: 'Cover',
      brand: 'Example Co',
      model: 'Shade 2',
      serial: 'SER-123',
      ip: '192.0.2.10',
      protocol: 'Thread',
      macAddress: '02:00:00:00:00:01',
      networkLabel: 'IoT VLAN 30',
      circuitReference: 'DB1 / C12',
      firmwareVersion: '1.2.3',
      homeownerNotes: 'Use the wall switch for normal operation.',
      notes: 'Synthetic local note',
      password: 'must-not-export',
      checks: [{ name: 'Open / close', status: 'pass' }]
    }]
  }]
};

const options = { generatedAt: '2026-08-20T10:00:00.000Z' };

test('CSV safely escapes cells and includes approved technical fields only', () => {
  const csv = exporters.createInstallerCsv(state, options);
  assert.match(csv, /'\=West blind/);
  assert.match(csv, /SER-123/);
  assert.match(csv, /192\.0\.2\.10/);
  assert.match(csv, /Synthetic local note/);
  assert.match(csv, /Thread/);
  assert.match(csv, /02:00:00:00:00:01/);
  assert.match(csv, /IoT VLAN 30/);
  assert.match(csv, /DB1 \/ C12/);
  assert.doesNotMatch(csv, /must-not-export/);
  assert.match(csv, /Not electrical certification or compliance sign-off/i);
});

test('installer JSON is deterministic and whitelisted', () => {
  const first = exporters.createInstallerJson(state, options);
  const second = exporters.createInstallerJson(state, options);
  assert.equal(first, second);
  const parsed = JSON.parse(first);
  assert.equal(parsed.generatedAt, options.generatedAt);
  assert.equal(parsed.devices[0].serialNumber, 'SER-123');
  assert.equal(parsed.devices[0].protocol, 'Thread');
  assert.equal(parsed.devices[0].networkLabel, 'IoT VLAN 30');
  assert.equal(parsed.devices[0].password, undefined);
});

test('homeowner PDF is valid-looking and excludes private installer fields', async () => {
  const pdf = exporters.createHomeownerPdf(state, options);
  assert.equal(pdf.type, 'application/pdf');
  const body = await pdf.text();
  assert.ok(body.startsWith('%PDF-1.4'));
  assert.match(body, /Synthetic House/);
  assert.match(body, /Homeowner handover/);
  assert.match(body, /Overall readiness: Ready/);
  assert.match(body, /Example Co Shade 2/);
  assert.match(body, /Use the wall switch for normal operation/);
  assert.match(body, /Prototype commissioning documentation only/);
  assert.doesNotMatch(body, /SER-123|192\.0\.2\.10|02:00:00:00:00:01|IoT VLAN 30|DB1 \/ C12|1\.2\.3|Synthetic local note|must-not-export/);
  assert.match(body, /xref[\s\S]*startxref/);
  assert.equal(body, await exporters.createHomeownerPdf(state, options).text());
});

test('all export formats remove credential-labelled values and check names', async () => {
  const unsafe = structuredClone(state);
  unsafe.rooms[0].devices[0].installerNotes = 'Wi-Fi password: hunter2';
  unsafe.rooms[0].devices[0].homeownerNotes = 'Door PIN code 2468';
  unsafe.rooms[0].devices[0].checks.push({ name: 'Setup code 12345678', status: 'pass' });
  const csv = exporters.createInstallerCsv(unsafe, options);
  const json = exporters.createInstallerJson(unsafe, options);
  const pdf = await exporters.createHomeownerPdf(unsafe, options).text();
  for (const output of [csv, json, pdf]) assert.doesNotMatch(output, /hunter2|2468|12345678/);
  assert.match(csv, /Open \/ close: pass/);
  assert.match(pdf, /Overall readiness: Ready/);
});

test('PIN and domestic access-code values are absent from every export', async () => {
  for (const credential of ['Door PIN: 2468', 'PIN=2468', 'Door code 2468', 'Access code: 2468', 'Entry code 9753', 'Gate code: 2468', 'Garage code 8642', 'Alarm code=8642', 'Security code 1357', 'Lock code 1357', 'Keypad code: 9753', 'Passcode: 4567']) {
    const unsafe = structuredClone(state);
    unsafe.rooms[0].devices[0].homeownerNotes = credential;
    unsafe.rooms[0].devices[0].installerNotes = credential;
    unsafe.rooms[0].devices[0].checks.push({ name: credential, status: 'pass' });
    const outputs = [
      exporters.createInstallerCsv(unsafe, options),
      exporters.createInstallerJson(unsafe, options),
      await exporters.createHomeownerPdf(unsafe, options).text()
    ];
    const digits = credential.match(/\d{4,}/)[0];
    for (const output of outputs) assert.equal(output.includes(digits), false, credential);
  }
});

test('credential detector does not suppress ordinary security guidance', () => {
  const guidance = 'Do not enter passwords, Wi-Fi keys, credentials or Matter fabric secrets.';
  assert.equal(exporters.isCredentialLikeValue(guidance), false);
  assert.equal(exporters.isCredentialLikeValue('Password is managed outside this application.'), false);
  assert.equal(exporters.isCredentialLikeValue('API token: not stored'), false);
  assert.equal(exporters.isCredentialLikeValue('Wi-Fi password: hunter2'), true);
  assert.equal(exporters.isCredentialLikeValue('Door PIN code 2468'), true);
  assert.equal(exporters.isCredentialLikeValue('Door PIN: 2468'), true);
  assert.equal(exporters.isCredentialLikeValue('PIN=2468'), true);
  assert.equal(exporters.isCredentialLikeValue('Door code 2468'), true);
  assert.equal(exporters.isCredentialLikeValue('Access code: 2468'), true);
  assert.equal(exporters.isCredentialLikeValue('Entry code 9753'), true);
  assert.equal(exporters.isCredentialLikeValue('Gate code: 2468'), true);
  assert.equal(exporters.isCredentialLikeValue('Garage code 8642'), true);
  assert.equal(exporters.isCredentialLikeValue('Alarm code=8642'), true);
  assert.equal(exporters.isCredentialLikeValue('Security code 1357'), true);
  assert.equal(exporters.isCredentialLikeValue('Lock code 1357'), true);
  assert.equal(exporters.isCredentialLikeValue('Keypad code: 9753'), true);
  assert.equal(exporters.isCredentialLikeValue('Passcode: 4567'), true);
  assert.equal(exporters.isCredentialLikeValue('PIN location marker beside the entry.'), false);
  assert.equal(exporters.isCredentialLikeValue('Door PIN: not stored.'), false);
  assert.equal(exporters.isCredentialLikeValue('Gate code location marker beside the keypad.'), false);
  assert.equal(exporters.isCredentialLikeValue('Alarm code: not stored.'), false);
});

test('device status is derived from checks', () => {
  assert.equal(exporters.deviceStatus({ checks: [{ status: 'pass' }] }), 'Ready');
  assert.equal(exporters.deviceStatus({ checks: [{ status: 'fix' }] }), 'Needs attention');
  assert.equal(exporters.deviceStatus({ checks: [] }), 'Not tested');
});

test('floor-plan validation enforces file types and clear size limits', () => {
  assert.equal(storage.validateFloorPlan({ type: 'image/png', size: 1024 }).ok, true);
  assert.match(storage.validateFloorPlan({ type: 'image/gif', size: 1024 }).error, /PNG, JPEG, WebP or single-page PDF/);
  assert.match(storage.validateFloorPlan({ type: 'image/png', size: storage.MAX_FLOOR_PLAN_BYTES + 1 }).error, /smaller than/);
});
