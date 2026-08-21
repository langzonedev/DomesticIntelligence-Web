(function (root) {
  'use strict';

  const DISCLAIMER = 'Prototype commissioning documentation only. Not electrical certification or compliance sign-off.';
  const TECHNICAL_FIELDS = Object.freeze([
    'name', 'type', 'category', 'brand', 'model', 'serialNumber', 'assetReference',
    'protocol', 'networkAddress', 'macAddress', 'networkLabel', 'controllerReference', 'portReference',
    'installationDate', 'installerBusiness', 'circuitReference', 'physicalLocationNotes', 'warrantyDate',
    'firmwareVersion', 'lastTestedDate', 'issuesActions', 'maintenanceNotes', 'homeownerNotes', 'installerNotes'
  ]);
  const CREDENTIAL_VALUE = /(?:password|passphrase|wi-?fi\s+(?:password|key)|wireless\s+key|fabric\s+(?:secret|key)|private\s+key|api\s+(?:key|token)|access\s+token|refresh\s+token|bearer\s+token|psk|pin\s*code|setup\s*code)\s*[=:>]\s*(\S.*)$/i;
  const NUMERIC_CREDENTIAL_VALUE = /(?:(?:door\s+)?pin(?:\s*code)?|(?:door|access|entry|gate|garage|alarm|security|lock|keypad)\s+code|passcode|setup\s+code)\s*(?:[=:]\s*)?\d{4,}\b/i;

  function roomsFrom(state) {
    return Array.isArray(state && state.rooms) ? state.rooms : [];
  }

  function devicesFrom(room) {
    return Array.isArray(room && room.devices) ? room.devices : [];
  }

  function checksFrom(device) {
    return Array.isArray(device && device.checks) ? device.checks : [];
  }

  function deviceStatus(device) {
    const statuses = checksFrom(device).map(check => check.status);
    if (statuses.includes('fix')) return 'Needs attention';
    if (!statuses.length || statuses.includes('pending')) return 'Not tested';
    return 'Ready';
  }

  function generatedAt(options) {
    const value = options && options.generatedAt ? new Date(options.generatedAt) : new Date();
    if (Number.isNaN(value.getTime())) throw new TypeError('generatedAt must be a valid date.');
    return value.toISOString();
  }

  function projectName(state) {
    return String((state && (state.projectName || state.homeName || (state.home && state.home.name))) || 'Domestic Intelligence handover');
  }

  function cleanLine(value) {
    return String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim();
  }

  function isCredentialLikeValue(value) {
    const candidate = cleanLine(value);
    if (!candidate) return false;
    const labelled = candidate.match(CREDENTIAL_VALUE);
    const safePlaceholder = labelled && /^(?:not|never|do\s+not|must\s+not|should\s+not|redacted|removed|omitted|blank|none|n\/a)\b/i.test(labelled[1]);
    return Boolean((labelled && !safePlaceholder) || NUMERIC_CREDENTIAL_VALUE.test(candidate));
  }

  function safeLine(value) {
    const candidate = cleanLine(value);
    return isCredentialLikeValue(candidate) ? '' : candidate;
  }

  function csvCell(value) {
    let text = cleanLine(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function installerRows(state) {
    const rows = [];
    roomsFrom(state).forEach(room => {
      devicesFrom(room).forEach(device => {
        const row = { room: safeLine(room.name), status: deviceStatus(device) };
        TECHNICAL_FIELDS.forEach(field => { row[field] = safeLine(device[field]); });
        // Accept the concise editor field names while keeping a stable export schema.
        row.serialNumber = safeLine(device.serialNumber || device.serial);
        row.networkAddress = safeLine(device.networkAddress || device.ipAddress || device.ip);
        row.installerNotes = safeLine(device.installerNotes || device.notes);
        row.checks = checksFrom(device).map(check => ({ name: safeLine(check.name), status: safeLine(check.status) }))
          .filter(check => check.name && check.status).map(check => `${check.name}: ${check.status}`).join('; ');
        rows.push(row);
      });
    });
    return rows;
  }

  function createInstallerCsv(state, options = {}) {
    const headers = ['Room', 'Name', 'Type', 'Category', 'Brand', 'Model', 'Serial number', 'Asset reference', 'Protocol', 'Network address', 'MAC address', 'Network / VLAN', 'Controller / switch', 'Port reference', 'Installation date', 'Installer / business', 'Circuit / board', 'Physical location', 'Warranty date', 'Firmware / version', 'Last tested', 'Status', 'Acceptance checks', 'Issues / actions', 'Maintenance notes', 'Homeowner notes', 'Installer notes'];
    const keys = ['room', 'name', 'type', 'category', 'brand', 'model', 'serialNumber', 'assetReference', 'protocol', 'networkAddress', 'macAddress', 'networkLabel', 'controllerReference', 'portReference', 'installationDate', 'installerBusiness', 'circuitReference', 'physicalLocationNotes', 'warrantyDate', 'firmwareVersion', 'lastTestedDate', 'status', 'checks', 'issuesActions', 'maintenanceNotes', 'homeownerNotes', 'installerNotes'];
    const lines = [headers.map(csvCell).join(',')];
    installerRows(state).forEach(row => lines.push(keys.map(key => csvCell(row[key])).join(',')));
    lines.push('');
    lines.push(csvCell(`Generated ${generatedAt(options)}. ${DISCLAIMER}`));
    return `${lines.join('\r\n')}\r\n`;
  }

  function createInstallerJson(state, options = {}) {
    return JSON.stringify({
      schemaVersion: 1,
      projectName: safeLine(projectName(state)) || 'Domestic Intelligence handover',
      generatedAt: generatedAt(options),
      disclaimer: DISCLAIMER,
      devices: installerRows(state)
    }, null, 2);
  }

  function ascii(value) {
    return cleanLine(value).normalize('NFKD').replace(/[^\x20-\x7e]/g, '?');
  }

  function pdfEscape(value) {
    return ascii(value).replace(/([\\()])/g, '\\$1');
  }

  function wrapPdfLine(value, limit = 78) {
    const line = ascii(value);
    if (line.length <= limit) return [line];
    const indent = (line.match(/^\s*/) || [''])[0];
    const words = line.trim().split(/\s+/);
    const output = [];
    let current = indent;
    words.forEach(word => {
      if ((current.trim() ? current.length + 1 : indent.length) + word.length > limit) {
        output.push(current.trimEnd()); current = `${indent}${word}`;
      } else current += `${current.trim() ? ' ' : ''}${word}`;
    });
    if (current.trim()) output.push(current.trimEnd());
    return output;
  }

  function homeownerLines(state, options) {
    const stamp = generatedAt(options);
    const devices = roomsFrom(state).flatMap(devicesFrom);
    const statuses = devices.map(deviceStatus);
    const overall = statuses.includes('Needs attention')
      ? 'Needs attention'
      : (!statuses.length || statuses.includes('Not tested') ? 'Not ready' : 'Ready');
    const lines = [
      safeLine(projectName(state)) || 'Domestic Intelligence handover',
      'Homeowner handover',
      `Generated: ${stamp.slice(0, 10)}`,
      `Overall readiness: ${overall}`,
      '',
      DISCLAIMER,
      ''
    ];
    roomsFrom(state).forEach(room => {
      lines.push(safeLine(room.name) || 'Room');
      const devices = devicesFrom(room);
      if (!devices.length) lines.push('  No installed devices recorded.');
      devices.forEach(device => {
        const publicType = safeLine(device.type || device.category) || 'Device';
        const publicBrandModel = [safeLine(device.brand), safeLine(device.model)].filter(Boolean).join(' ');
        lines.push(`  ${safeLine(device.name) || 'Unnamed device'} - ${publicType} - ${deviceStatus(device)}`);
        if (publicBrandModel) lines.push(`    ${publicBrandModel}`);
        const homeownerNotes = safeLine(device.homeownerNotes);
        if (homeownerNotes) lines.push(`    Note: ${homeownerNotes}`);
      });
      lines.push('');
    });
    return lines;
  }

  function buildPdf(lines) {
    lines = lines.flatMap(line => wrapPdfLine(line));
    const pages = [];
    const perPage = 45;
    for (let index = 0; index < lines.length; index += perPage) pages.push(lines.slice(index, index + perPage));
    if (!pages.length) pages.push([]);

    const objects = [];
    const add = value => { objects.push(value); return objects.length; };
    const catalogId = add('');
    const pagesId = add('');
    const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const pageIds = [];
    pages.forEach(pageLines => {
      const commands = ['BT', '/F1 11 Tf', '50 790 Td', '14 TL'];
      pageLines.forEach((line, index) => {
        if (index) commands.push('T*');
        commands.push(`(${pdfEscape(line)}) Tj`);
      });
      commands.push('ET');
      const stream = commands.join('\n');
      const contentId = add(`<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`);
      const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
    });
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    let pdf = '%PDF-1.4\n%DI-PWA\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(byteLength(pdf));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return pdf;
  }

  function byteLength(value) {
    return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(value).length : value.length;
  }

  function blob(parts, type) {
    if (typeof Blob === 'undefined') throw new Error('File export is unavailable in this browser.');
    return new Blob(parts, { type });
  }

  function createHomeownerPdf(state, options = {}) {
    return blob([buildPdf(homeownerLines(state, options))], 'application/pdf');
  }

  function createInstallerCsvBlob(state, options = {}) {
    return blob(['\ufeff', createInstallerCsv(state, options)], 'text/csv;charset=utf-8');
  }

  function createInstallerJsonBlob(state, options = {}) {
    return blob([createInstallerJson(state, options)], 'application/json');
  }

  function downloadBlob(fileBlob, filename) {
    if (!fileBlob || !filename) throw new TypeError('A Blob and filename are required.');
    if (!root.document || !root.URL || !root.URL.createObjectURL) throw new Error('Downloads are unavailable in this environment.');
    const url = root.URL.createObjectURL(fileBlob);
    const link = root.document.createElement('a');
    link.href = url;
    link.download = String(filename).replace(/[\\/:*?"<>|]/g, '-');
    link.hidden = true;
    root.document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => root.URL.revokeObjectURL(url), 0);
  }

  const api = Object.freeze({
    DISCLAIMER,
    TECHNICAL_FIELDS,
    isCredentialLikeValue,
    csvCell,
    deviceStatus,
    installerRows,
    createInstallerCsv,
    createInstallerJson,
    createHomeownerPdf,
    createInstallerCsvBlob,
    createInstallerJsonBlob,
    downloadBlob
  });

  root.DIExporters = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
