type ControlVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
type LiveMode = 'off' | 'polite' | 'assertive';
type Orientation = 'horizontal' | 'vertical';

interface Choice<T extends string = string> { value: T; label: string; disabled?: boolean; }
interface BaseControlOptions { id?: string; className?: string; disabled?: boolean; busy?: boolean; }
interface ButtonOptions extends BaseControlOptions { label: string; variant?: ControlVariant; icon?: IconName; type?: 'button' | 'submit' | 'reset'; onPress?: (event: Event) => void; }
interface IconButtonOptions extends BaseControlOptions { ariaLabel: string; icon: IconName; variant?: ControlVariant; onPress?: (event: Event) => void; }
interface FieldOptions { id?: string; label: string; hint?: string; error?: string; required?: boolean; className?: string; }
interface SelectOptions<T extends string = string> extends FieldOptions { name?: string; value?: T; choices: readonly Choice<T>[]; onChange?: (value: T) => void; }
interface SegmentOptions<T extends string = string> { id?: string; label: string; value: T; choices: readonly Choice<T>[]; onChange?: (value: T) => void; }
interface SurfaceOptions { id?: string; label: string; description?: string; className?: string; }
interface SheetOptions extends SurfaceOptions { modal?: false; }
interface DialogOptions extends SurfaceOptions { closeLabel?: string; initialFocus?: string; onClose?: () => void; }
interface ToolbarOptions { id?: string; label: string; orientation?: Orientation; controls?: readonly HTMLElement[]; }
interface StatusOptions { id?: string; text: string; tone?: StatusTone; live?: LiveMode; busy?: boolean; }
interface FieldsetOptions { id?: string; legend: string; description?: string; controls?: readonly HTMLElement[]; }
interface FieldControl<T extends HTMLElement> { root: HTMLDivElement; label: HTMLLabelElement; control: T; hint?: HTMLElement; error?: HTMLElement; setError(message?: string): void; setBusy(busy: boolean): void; }
interface DialogControl { element: HTMLElement; content: HTMLElement; closeButton: HTMLButtonElement; open(options?: { background?: readonly HTMLElement[]; returnFocus?: HTMLElement; initialFocus?: HTMLElement }): void; close(): void; isOpen(): boolean; }
interface SegmentedControl<T extends string = string> { element: HTMLElement; buttons: readonly HTMLButtonElement[]; value(): T; setValue(value: T, focus?: boolean): void; }
interface ToolbarControl { element: HTMLElement; controls: readonly HTMLElement[]; }
interface UiKitApi {
  createButton(options: ButtonOptions): HTMLButtonElement;
  createIconButton(options: IconButtonOptions): HTMLButtonElement;
  createField(options: FieldOptions & { input?: HTMLInputElement }): FieldControl<HTMLInputElement>;
  createSelect<T extends string>(options: SelectOptions<T>): FieldControl<HTMLSelectElement>;
  createSegmentedControl<T extends string>(options: SegmentOptions<T>): SegmentedControl<T>;
  createSheet(options: SheetOptions): HTMLElement;
  createDialog(options: DialogOptions): DialogControl;
  createToolbar(options: ToolbarOptions): ToolbarControl;
  createStatus(options: StatusOptions): HTMLElement;
  createFieldset(options: FieldsetOptions): HTMLFieldSetElement;
  setBusy(element: HTMLElement, busy: boolean): void;
  describedBy(control: HTMLElement, ids: Array<string | undefined>): void;
  focusAt(items: readonly HTMLElement[], index: number): void;
}
interface UiGlobal {
  document?: Document;
  DIIcons?: IconRegistryApi;
  DIUIKit?: Readonly<UiKitApi>;
}

(function installUiKit(root: UiGlobal) {
  'use strict';
  const doc = root.document;
  let sequence = 0;
  const iconApi = () => {
    if (!root.DIIcons) throw new Error('Load ui-icons.js before ui-kit.js.');
    return root.DIIcons;
  };
  const requireDocument = () => {
    if (!doc) throw new Error('A document is required to create UI controls.');
    return doc;
  };
  const id = (prefix = 'di') => `${prefix}-${++sequence}`;

  function applyClass(element: HTMLElement, ...names: Array<string | undefined>) {
    element.className = names.filter(Boolean).join(' ');
  }

  function setBusy(element: HTMLElement, busy: boolean) {
    element.setAttribute('aria-busy', String(Boolean(busy)));
    if ('disabled' in element) (element as HTMLButtonElement).disabled = Boolean(busy) || element.dataset.disabled === 'true';
  }

  function describedBy(control: HTMLElement, ids: Array<string | undefined>) {
    const value = ids.filter(Boolean).join(' ');
    if (value) control.setAttribute('aria-describedby', value);
    else control.removeAttribute('aria-describedby');
  }

  function createButton(options: ButtonOptions): HTMLButtonElement {
    const document = requireDocument();
    if (!options.label?.trim()) throw new TypeError('Button label is required.');
    const button = document.createElement('button');
    button.type = options.type || 'button';
    if (options.id) button.id = options.id;
    applyClass(button, 'di-control', 'di-button', `di-button--${options.variant || 'secondary'}`, options.className);
    if (options.icon) button.append(iconApi().create(options.icon));
    const text = document.createElement('span');
    text.className = 'di-button__label';
    text.textContent = options.label;
    button.append(text);
    button.disabled = Boolean(options.disabled);
    button.dataset.disabled = String(Boolean(options.disabled));
    setBusy(button, Boolean(options.busy));
    if (options.onPress) button.addEventListener('click', options.onPress);
    return button;
  }

  function createIconButton(options: IconButtonOptions): HTMLButtonElement {
    if (!options.ariaLabel?.trim()) throw new TypeError('IconButton ariaLabel is required.');
    const button = createButton({ ...options, label: options.ariaLabel });
    button.classList.add('di-icon-button');
    button.setAttribute('aria-label', options.ariaLabel);
    button.querySelector('.di-button__label')?.classList.add('di-visually-hidden');
    return button;
  }

  function wireField<T extends HTMLElement>(control: T, options: FieldOptions): FieldControl<T> {
    const document = requireDocument();
    const controlId = options.id || id('field');
    control.id = controlId;
    if (options.required) control.setAttribute('aria-required', 'true');
    const wrapper = document.createElement('div');
    applyClass(wrapper, 'di-field', options.className);
    const label = document.createElement('label');
    label.htmlFor = controlId;
    label.className = 'di-field__label';
    label.textContent = options.label;
    if (options.required) {
      const required = document.createElement('span');
      required.className = 'di-field__required';
      required.textContent = ' required';
      label.append(required);
    }
    let hint: HTMLElement | undefined;
    let error: HTMLElement | undefined;
    if (options.hint) {
      hint = document.createElement('div');
      hint.id = `${controlId}-hint`;
      hint.className = 'di-field__hint';
      hint.textContent = options.hint;
    }
    if (options.error) {
      error = document.createElement('div');
      error.id = `${controlId}-error`;
      error.className = 'di-field__error';
      error.textContent = options.error;
      error.setAttribute('role', 'alert');
    }
    control.classList.add('di-control', 'di-field__control');
    wrapper.append(label, control);
    if (hint) wrapper.append(hint);
    if (error) wrapper.append(error);
    describedBy(control, [hint?.id, error?.id]);
    control.setAttribute('aria-invalid', String(Boolean(options.error)));
    const field: FieldControl<T> = {
      root: wrapper, label, control, hint, error,
      setError(message?: string) {
        if (message && !error) {
          error = document.createElement('div');
          error.id = `${controlId}-error`;
          error.className = 'di-field__error';
          error.setAttribute('role', 'alert');
          wrapper.append(error);
          field.error = error;
        }
        if (error) {
          error.textContent = message || '';
          error.hidden = !message;
        }
        control.setAttribute('aria-invalid', String(Boolean(message)));
        describedBy(control, [hint?.id, message ? error?.id : undefined]);
      },
      setBusy(busy: boolean) { setBusy(control, busy); }
    };
    return field;
  }

  function createField(options: FieldOptions & { input?: HTMLInputElement }): FieldControl<HTMLInputElement> {
    const input = options.input || requireDocument().createElement('input');
    return wireField(input, options);
  }

  function createSelect<T extends string>(options: SelectOptions<T>): FieldControl<HTMLSelectElement> {
    const document = requireDocument();
    const select = document.createElement('select');
    if (options.name) select.name = options.name;
    options.choices.forEach(choice => {
      const option = document.createElement('option');
      option.value = choice.value;
      option.textContent = choice.label;
      option.disabled = Boolean(choice.disabled);
      select.append(option);
    });
    if (options.value != null) select.value = options.value;
    if (options.onChange) select.addEventListener('change', () => options.onChange!(select.value as T));
    return wireField(select, options);
  }

  function focusAt(items: readonly HTMLElement[], index: number) {
    items.forEach((item, itemIndex) => { item.tabIndex = itemIndex === index ? 0 : -1; });
    items[index]?.focus();
  }

  function rovingIndex(event: KeyboardEvent, items: readonly HTMLElement[], current: HTMLElement, orientation: Orientation): number | null {
    const index = Math.max(0, items.indexOf(current));
    if (event.key === 'Home') return 0;
    if (event.key === 'End') return items.length - 1;
    if ((orientation === 'horizontal' && event.key === 'ArrowRight') || (orientation === 'vertical' && event.key === 'ArrowDown')) return (index + 1) % items.length;
    if ((orientation === 'horizontal' && event.key === 'ArrowLeft') || (orientation === 'vertical' && event.key === 'ArrowUp')) return (index - 1 + items.length) % items.length;
    return null;
  }

  function createSegmentedControl<T extends string>(options: SegmentOptions<T>): SegmentedControl<T> {
    const document = requireDocument();
    if (!options.choices.length) throw new TypeError('SegmentedControl requires at least one choice.');
    const group = document.createElement('div');
    if (options.id) group.id = options.id;
    group.className = 'di-segmented';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', options.label);
    let selected = options.choices.some(choice => choice.value === options.value) ? options.value : options.choices[0].value;
    const buttons = options.choices.map(choice => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'di-control di-segmented__option';
      button.setAttribute('role', 'radio');
      button.dataset.value = choice.value;
      button.textContent = choice.label;
      button.disabled = Boolean(choice.disabled);
      group.append(button);
      return button;
    });
    function sync(focus = false) {
      buttons.forEach(button => {
        const active = button.dataset.value === selected;
        button.setAttribute('aria-checked', String(active));
        button.tabIndex = active ? 0 : -1;
        if (active && focus) button.focus();
      });
    }
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        selected = button.dataset.value as T;
        sync();
        options.onChange?.(selected);
      });
      button.addEventListener('keydown', event => {
        const enabled = buttons.filter(item => !item.disabled);
        const next = rovingIndex(event, enabled, button, 'horizontal');
        if (next == null) return;
        event.preventDefault();
        enabled[next].click();
        enabled[next].focus();
      });
    });
    sync();
    return { element: group, buttons, value: () => selected, setValue(value: T, focus = false) { if (!options.choices.some(choice => choice.value === value)) throw new RangeError(`Unknown segment: ${value}`); selected = value; sync(focus); } };
  }

  function createSheet(options: SheetOptions): HTMLElement {
    const document = requireDocument();
    const sheet = document.createElement('section');
    if (options.id) sheet.id = options.id;
    applyClass(sheet, 'di-sheet', options.className);
    sheet.setAttribute('role', 'region');
    const heading = document.createElement('h2');
    heading.id = `${options.id || id('sheet')}-title`;
    heading.textContent = options.label;
    sheet.setAttribute('aria-labelledby', heading.id);
    sheet.append(heading);
    if (options.description) {
      const description = document.createElement('p');
      description.id = `${heading.id}-description`;
      description.textContent = options.description;
      sheet.setAttribute('aria-describedby', description.id);
      sheet.append(description);
    }
    return sheet;
  }

  function focusableElements(container: HTMLElement): HTMLElement[] {
    const result: HTMLElement[] = [];
    const visit = (element: HTMLElement) => {
      Array.from(element.children).forEach(child => {
        const item = child as HTMLElement;
        const focusable = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(item.tagName) || item.tabIndex >= 0;
        if (focusable && !('disabled' in item && (item as HTMLButtonElement).disabled) && !item.hidden && !item.hasAttribute('inert')) result.push(item);
        visit(item);
      });
    };
    visit(container);
    return result;
  }

  function createDialog(options: DialogOptions): DialogControl {
    const document = requireDocument();
    const dialog = document.createElement('section');
    if (options.id) dialog.id = options.id;
    applyClass(dialog, 'di-dialog', options.className);
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.hidden = true;
    const heading = document.createElement('h2');
    heading.id = `${options.id || id('dialog')}-title`;
    heading.textContent = options.label;
    dialog.setAttribute('aria-labelledby', heading.id);
    const closeButton = createIconButton({ ariaLabel: options.closeLabel || 'Close', icon: 'close', variant: 'quiet' });
    const header = document.createElement('header');
    header.className = 'di-dialog__header';
    header.append(heading, closeButton);
    const content = document.createElement('div');
    content.className = 'di-dialog__content';
    dialog.append(header);
    if (options.description) {
      const description = document.createElement('p');
      description.id = `${heading.id}-description`;
      description.textContent = options.description;
      dialog.setAttribute('aria-describedby', description.id);
      dialog.append(description);
    }
    dialog.append(content);
    let context: { returnFocus?: HTMLElement; inerted: HTMLElement[] } | null = null;
    function close() {
      if (!context) return;
      const previous = context;
      context = null;
      dialog.hidden = true;
      previous.inerted.forEach(element => element.removeAttribute('inert'));
      options.onClose?.();
      const target = previous.returnFocus?.isConnected === false ? undefined : previous.returnFocus;
      target?.focus();
    }
    function open(openOptions: { background?: readonly HTMLElement[]; returnFocus?: HTMLElement; initialFocus?: HTMLElement } = {}) {
      if (context) close();
      const background = (openOptions.background || []).filter(element => element !== dialog && !element.hasAttribute('inert'));
      background.forEach(element => element.setAttribute('inert', ''));
      context = { returnFocus: openOptions.returnFocus || document.activeElement as HTMLElement, inerted: [...background] };
      dialog.hidden = false;
      const target = openOptions.initialFocus || (options.initialFocus ? dialog.querySelector(options.initialFocus) as HTMLElement : undefined) || focusableElements(dialog)[0] || dialog;
      if (target === dialog) dialog.tabIndex = -1;
      target.focus();
    }
    closeButton.addEventListener('click', close);
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const items = focusableElements(dialog);
      if (!items.length) { event.preventDefault(); dialog.focus(); return; }
      const current = document.activeElement as HTMLElement;
      const index = items.indexOf(current);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)!.focus(); }
      else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0].focus(); }
    });
    return { element: dialog, content, closeButton, open, close, isOpen: () => Boolean(context) };
  }

  function createToolbar(options: ToolbarOptions): ToolbarControl {
    const document = requireDocument();
    const toolbar = document.createElement('div');
    if (options.id) toolbar.id = options.id;
    toolbar.className = 'di-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', options.label);
    toolbar.setAttribute('aria-orientation', options.orientation || 'horizontal');
    const controls = [...(options.controls || [])];
    controls.forEach((control, index) => { control.tabIndex = index === 0 ? 0 : -1; toolbar.append(control); });
    toolbar.addEventListener('keydown', event => {
      const enabled = controls.filter(control => !('disabled' in control && (control as HTMLButtonElement).disabled));
      const current = event.target as HTMLElement;
      const next = rovingIndex(event, enabled, current, options.orientation || 'horizontal');
      if (next == null) return;
      event.preventDefault();
      focusAt(enabled, next);
    });
    return { element: toolbar, controls };
  }

  function createStatus(options: StatusOptions): HTMLElement {
    const document = requireDocument();
    if (!options.text?.trim()) throw new TypeError('Status text is required; status cannot rely on colour alone.');
    const status = document.createElement('div');
    if (options.id) status.id = options.id;
    status.className = `di-status di-status--${options.tone || 'neutral'}`;
    status.textContent = options.text;
    const live = options.live || 'polite';
    status.setAttribute('role', live === 'assertive' ? 'alert' : 'status');
    status.setAttribute('aria-live', live);
    setBusy(status, Boolean(options.busy));
    return status;
  }

  function createFieldset(options: FieldsetOptions): HTMLFieldSetElement {
    const document = requireDocument();
    const fieldset = document.createElement('fieldset');
    if (options.id) fieldset.id = options.id;
    fieldset.className = 'di-fieldset';
    const legend = document.createElement('legend');
    legend.textContent = options.legend;
    fieldset.append(legend);
    if (options.description) {
      const description = document.createElement('p');
      description.id = `${options.id || id('fieldset')}-description`;
      description.textContent = options.description;
      fieldset.setAttribute('aria-describedby', description.id);
      fieldset.append(description);
    }
    (options.controls || []).forEach(control => fieldset.append(control));
    return fieldset;
  }

  root.DIUIKit = Object.freeze<UiKitApi>({
    createButton, createIconButton, createField, createSelect, createSegmentedControl,
    createSheet, createDialog, createToolbar, createStatus, createFieldset,
    setBusy, describedBy, focusAt
  });
})(globalThis as unknown as UiGlobal);
