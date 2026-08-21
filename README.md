# Domestic Intelligence — Web/PWA prototype

Public, synthetic customer-facing prototype for **Domestic Intelligence** by Lang Systems.

**Prototype only:** this build does not commission or control real Matter devices, does not perform electrical safety certification, and stores demo changes locally in the browser.

## Live prototype

GitHub Pages: https://langzonedev.github.io/DomesticIntelligence-Web/

## v0.6 scope

- mobile-first editable 2D home map with snapped wall and device-point editing;
- property address and multi-storey planning with isolated reference plans per storey;
- explicit mobile Save/Cancel edit transactions, including safe Back and breakpoint rollback;
- bounded Undo/Redo and independent floor-plan, wall, device, status and label layers;
- local PNG, JPEG, WebP and single-page PDF floor-plan import;
- synthetic device metadata, including installer-only serial, network and notes fields;
- capability-based acceptance checks with derived room and whole-home readiness;
- homeowner-safe PDF plus installer CSV/JSON export generated in the browser;
- IndexedDB persistence with a bounded localStorage fallback;
- original brand mark, accessible palette and device-following system theme;
- installable PWA shell and offline reopening.

Imported plans and project details are never uploaded by this prototype. Do not enter real credentials, passwords or Matter fabric keys.

## Public boundary

This repository intentionally contains presentation code and synthetic demo data only. Protected algorithms, backend authority, private research, credentials, customer data and sensitive device/fabric information belong in the private `langzonedev/DomesticIntelligence` repository.

Governed by the Lang Systems Core Development baseline. Production release is not authorised by this prototype.
