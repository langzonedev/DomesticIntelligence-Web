# Domestic Intelligence UI kit

The v0.7 UI kit is an additive, dependency-free layer for accessible controls. TypeScript source lives under `src/ui/`; deterministic classic-script runtimes are checked in at the repository root.

## Build and verify

```powershell
node scripts/build-ui.mjs
node scripts/build-ui.mjs --check
node --test tests/ui-kit.test.mjs
# In CI/tooling with TypeScript installed:
tsc -p tsconfig.ui.json
```

The builder uses Node's local type-stripper. It does not download packages or introduce a runtime dependency.
`tsconfig.ui.json` is the strict editor/CI type gate; the checked-in runtime build itself requires only Node 24.

## Browser loading order

```html
<link rel="stylesheet" href="ui-kit.css">
<script src="ui-icons.js"></script>
<script src="ui-kit.js"></script>
```

The runtime APIs are `window.DIIcons` and `window.DIUIKit`. Existing screens can adopt one control at a time.

## API

- `DIIcons.create(name, { title?, className? })` creates a local, injection-safe SVG node.
- `createButton`, `createIconButton` enforce visible or accessible names and expose `aria-busy`.
- `createField`, `createSelect` return `{ root, label, control, hint, error, setError, setBusy }`; hint/error IDs and `aria-invalid` stay synchronized.
- `createSegmentedControl` provides radio semantics and Arrow/Home/End roving navigation.
- `createSheet` creates a labelled non-modal region.
- `createDialog` returns `{ element, content, closeButton, open, close, isOpen }`; `open` accepts background nodes to inert and restores focus on close.
- `createToolbar` provides a labelled toolbar with orientation-aware roving focus.
- `createStatus` requires text and exposes tone, live-region and busy semantics.
- `createFieldset` always creates a real `fieldset` with a visible `legend`.

All `.di-control` controls and statuses have a 44px minimum target in `ui-kit.css`.
