type IconName =
  | 'plan' | 'devices' | 'handover' | 'more'
  | 'add' | 'edit' | 'save' | 'cancel' | 'close' | 'back'
  | 'upload' | 'undo' | 'redo' | 'check' | 'warning' | 'error';

interface IconDefinition {
  viewBox: string;
  paths: readonly string[];
}

interface IconRegistryApi {
  names: readonly IconName[];
  has(name: string): name is IconName;
  create(name: IconName, options?: { title?: string; className?: string }): SVGSVGElement;
}

interface IconGlobal {
  document?: Document;
  DIIcons?: IconRegistryApi;
}

(function installIconRegistry(root: IconGlobal) {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const definitions: Readonly<Record<IconName, IconDefinition>> = Object.freeze({
    plan: { viewBox: '0 0 24 24', paths: ['M4 4h7v7H4z', 'M13 4h7v4h-7z', 'M13 10h7v10h-7z', 'M4 13h7v7H4z'] },
    devices: { viewBox: '0 0 24 24', paths: ['M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M9 7h6', 'M9 10h6', 'M12 16h.01'] },
    handover: { viewBox: '0 0 24 24', paths: ['M6 3h9l3 3v15H6z', 'M14 3v4h4', 'M9 12h6', 'M9 16h6'] },
    more: { viewBox: '0 0 24 24', paths: ['M12 5h.01', 'M12 12h.01', 'M12 19h.01'] },
    add: { viewBox: '0 0 24 24', paths: ['M12 5v14', 'M5 12h14'] },
    edit: { viewBox: '0 0 24 24', paths: ['M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z', 'M14.5 7.5l3 3'] },
    save: { viewBox: '0 0 24 24', paths: ['M5 4h12l2 2v14H5z', 'M8 4v6h8V4', 'M8 20v-6h8v6'] },
    cancel: { viewBox: '0 0 24 24', paths: ['M6 6l12 12', 'M18 6L6 18'] },
    close: { viewBox: '0 0 24 24', paths: ['M6 6l12 12', 'M18 6L6 18'] },
    back: { viewBox: '0 0 24 24', paths: ['M19 12H5', 'M11 6l-6 6 6 6'] },
    upload: { viewBox: '0 0 24 24', paths: ['M12 16V4', 'M7 9l5-5 5 5', 'M5 20h14'] },
    undo: { viewBox: '0 0 24 24', paths: ['M9 7L4 12l5 5', 'M5 12h8a6 6 0 0 1 6 6'] },
    redo: { viewBox: '0 0 24 24', paths: ['M15 7l5 5-5 5', 'M19 12h-8a6 6 0 0 0-6 6'] },
    check: { viewBox: '0 0 24 24', paths: ['M5 12l4 4L19 6'] },
    warning: { viewBox: '0 0 24 24', paths: ['M12 3L2.8 20h18.4z', 'M12 9v5', 'M12 17h.01'] },
    error: { viewBox: '0 0 24 24', paths: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v6', 'M12 17h.01'] }
  });
  const names = Object.freeze(Object.keys(definitions) as IconName[]);

  function has(name: string): name is IconName {
    return Object.prototype.hasOwnProperty.call(definitions, name);
  }

  function create(name: IconName, options: { title?: string; className?: string } = {}): SVGSVGElement {
    if (!has(name)) throw new TypeError(`Unknown local icon: ${String(name)}`);
    if (!root.document) throw new Error('A document is required to create an icon.');
    const definition = definitions[name];
    const svg = root.document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', definition.viewBox);
    svg.setAttribute('class', options.className || 'di-icon');
    svg.setAttribute('focusable', 'false');
    if (options.title) {
      const title = root.document.createElementNS(SVG_NS, 'title');
      title.textContent = options.title;
      svg.append(title);
      svg.setAttribute('role', 'img');
    } else {
      svg.setAttribute('aria-hidden', 'true');
    }
    definition.paths.forEach(data => {
      const path = root.document!.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', data);
      svg.append(path);
    });
    return svg;
  }

  root.DIIcons = Object.freeze({ names, has, create });
})(globalThis as unknown as IconGlobal);
