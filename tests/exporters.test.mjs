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
  assert.match(body, /Prototype commissioning documentation only/);
  assert.doesNotMatch(body, /SER-123|192\.0\.2\.10|Synthetic local note|must-not-export/);
  assert.match(body, /xref[\s\S]*startxref/);
  assert.equal(body, await exporters.createHomeownerPdf(state, options).text());
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
