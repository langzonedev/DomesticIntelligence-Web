import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.key = options.key || '';
    this.shiftKey = Boolean(options.shiftKey);
    this.target = options.target || null;
    this.defaultPrevented = false;
  }
  preventDefault() { this.defaultPrevented = true; }
}

class FakeClassList {
  constructor(element) { this.element = element; }
  values() { return this.element.className.split(/\s+/).filter(Boolean); }
  add(...names) { this.element.className = [...new Set([...this.values(), ...names])].join(' '); }
  remove(...names) { this.element.className = this.values().filter(name => !names.includes(name)).join(' '); }
  contains(name) { return this.values().includes(name); }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.classList = new FakeClassList(this);
    this.dataset = {};
    this.id = '';
    this.textContent = '';
    this.value = '';
    this.name = '';
    this.type = '';
    this.disabled = false;
    this.hidden = false;
    this.tabIndex = -1;
    this.isConnected = true;
  }
  append(...children) {
    children.forEach(child => {
      child.parentElement = this;
      child.ownerDocument = this.ownerDocument;
      this.children.push(child);
    });
  }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
    return !event.defaultPrevented;
  }
  click() { this.dispatchEvent(new FakeEvent('click', { target: this })); }
  focus() { this.ownerDocument.activeElement = this; }
  contains(candidate) { return candidate === this || this.children.some(child => child.contains(candidate)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = [];
    const match = element => selector.startsWith('.') ? element.classList.contains(selector.slice(1)) : selector.startsWith('#') ? element.id === selector.slice(1) : element.tagName === selector.toUpperCase();
    const visit = element => element.children.forEach(child => { if (match(child)) matches.push(child); visit(child); });
    visit(this);
    return matches;
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body', this);
    this.activeElement = this.body;
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  createElementNS(_namespace, tagName) { return new FakeElement(tagName, this); }
}

async function loadKit() {
  const document = new FakeDocument();
  const context = vm.createContext({ console, document });
  vm.runInContext(await readFile(new URL('../ui-icons.js', import.meta.url), 'utf8'), context);
  vm.runInContext(await readFile(new URL('../ui-kit.js', import.meta.url), 'utf8'), context);
  return { document, icons: context.DIIcons, kit: context.DIUIKit };
}

test('checked-in runtime is deterministically generated from TypeScript', () => {
  const result = spawnSync(process.execPath, ['scripts/build-ui.mjs', '--check'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('local icon registry creates hidden SVGs and rejects unknown names', async () => {
  const { icons } = await loadKit();
  const icon = icons.create('save');
  assert.equal(icon.tagName, 'SVG');
  assert.equal(icon.getAttribute('aria-hidden'), 'true');
  assert.ok(icon.children.length >= 2);
  assert.throws(() => icons.create('remote-script'), /Unknown local icon/);
});

test('Button and IconButton expose names, busy state and 44px control classes', async () => {
  const { kit } = await loadKit();
  const button = kit.createButton({ label: 'Save', icon: 'save', busy: true, variant: 'primary' });
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(button.disabled, true);
  assert.equal(button.classList.contains('di-control'), true);
  assert.equal(button.querySelector('.di-button__label').textContent, 'Save');
  const iconButton = kit.createIconButton({ ariaLabel: 'Close details', icon: 'close' });
  assert.equal(iconButton.getAttribute('aria-label'), 'Close details');
  assert.throws(() => kit.createIconButton({ ariaLabel: '', icon: 'close' }), /ariaLabel/);
});

test('Field synchronizes hint, error, aria-invalid and aria-busy', async () => {
  const { kit } = await loadKit();
  const field = kit.createField({ id: 'serial', label: 'Serial number', hint: 'Printed on the device.' });
  assert.equal(field.label.htmlFor, 'serial');
  assert.equal(field.control.getAttribute('aria-describedby'), 'serial-hint');
  assert.equal(field.control.getAttribute('aria-invalid'), 'false');
  field.setError('Serial number is required.');
  assert.equal(field.control.getAttribute('aria-invalid'), 'true');
  assert.equal(field.control.getAttribute('aria-describedby'), 'serial-hint serial-error');
  assert.equal(field.error.getAttribute('role'), 'alert');
  field.setBusy(true);
  assert.equal(field.control.getAttribute('aria-busy'), 'true');
  field.setError();
  assert.equal(field.control.getAttribute('aria-invalid'), 'false');
  assert.equal(field.control.getAttribute('aria-describedby'), 'serial-hint');
});

test('Select and Fieldset retain native labels and safe text nodes', async () => {
  const { kit } = await loadKit();
  const select = kit.createSelect({ id: 'room', label: 'Room', value: 'kitchen', choices: [{ value: 'kitchen', label: '<Kitchen>' }, { value: 'entry', label: 'Entry' }] });
  assert.equal(select.control.children[0].textContent, '<Kitchen>');
  assert.equal(select.label.htmlFor, 'room');
  const fieldset = kit.createFieldset({ id: 'checks', legend: 'Acceptance checks', description: 'Complete every recorded check.', controls: [select.root] });
  assert.equal(fieldset.children[0].tagName, 'LEGEND');
  assert.equal(fieldset.getAttribute('aria-describedby'), 'checks-description');
});

test('SegmentedControl uses roving radio navigation', async () => {
  const { document, kit } = await loadKit();
  const changes = [];
  const segmented = kit.createSegmentedControl({ label: 'Map mode', value: 'view', choices: [{ value: 'view', label: 'View' }, { value: 'edit', label: 'Edit' }], onChange: value => changes.push(value) });
  assert.deepEqual(segmented.buttons.map(button => button.tabIndex), [0, -1]);
  const event = new FakeEvent('keydown', { key: 'ArrowRight', target: segmented.buttons[0] });
  segmented.buttons[0].dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(segmented.value(), 'edit');
  assert.equal(segmented.buttons[1].getAttribute('aria-checked'), 'true');
  assert.equal(document.activeElement, segmented.buttons[1]);
  assert.deepEqual(changes, ['edit']);
});

test('Toolbar provides labelled orientation-aware roving focus', async () => {
  const { document, kit } = await loadKit();
  const first = kit.createButton({ label: 'Undo' });
  const second = kit.createButton({ label: 'Redo' });
  const toolbar = kit.createToolbar({ label: 'Edit history', controls: [first, second] });
  assert.equal(toolbar.element.getAttribute('role'), 'toolbar');
  assert.deepEqual(Array.from(toolbar.controls, control => control.tabIndex), [0, -1]);
  const event = new FakeEvent('keydown', { key: 'ArrowRight', target: first });
  toolbar.element.dispatchEvent(event);
  assert.equal(document.activeElement, second);
  assert.deepEqual(Array.from(toolbar.controls, control => control.tabIndex), [-1, 0]);
});

test('Dialog inerts background, traps focus, closes on Escape and restores focus', async () => {
  const { document, kit } = await loadKit();
  const opener = kit.createButton({ label: 'Open details' });
  const background = document.createElement('main');
  const dialog = kit.createDialog({ id: 'device-dialog', label: 'Device details' });
  const save = kit.createButton({ label: 'Save' });
  dialog.content.append(save);
  opener.focus();
  dialog.open({ background: [background], returnFocus: opener });
  assert.equal(dialog.element.hidden, false);
  assert.equal(dialog.element.getAttribute('role'), 'dialog');
  assert.equal(dialog.element.getAttribute('aria-modal'), 'true');
  assert.equal(background.hasAttribute('inert'), true);
  assert.equal(document.activeElement, dialog.closeButton);
  const escape = new FakeEvent('keydown', { key: 'Escape', target: dialog.element });
  dialog.element.dispatchEvent(escape);
  assert.equal(dialog.isOpen(), false);
  assert.equal(background.hasAttribute('inert'), false);
  assert.equal(document.activeElement, opener);
});

test('Status requires text and publishes busy/live semantics', async () => {
  const { kit } = await loadKit();
  const status = kit.createStatus({ text: 'Saving device details', tone: 'info', busy: true });
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(status.getAttribute('aria-busy'), 'true');
  assert.throws(() => kit.createStatus({ text: '' }), /text is required/);
});

test('component stylesheet enforces minimum target and visible focus contracts', async () => {
  const css = await readFile(new URL('../ui-kit.css', import.meta.url), 'utf8');
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});
