# Domestic Intelligence — Web/PWA prototype

Public, synthetic customer-facing prototype for **Domestic Intelligence** by Lang Systems.

**Prototype only:** this build does not perform electrical safety certification and stores demo changes locally in the browser. Provider/device-control capabilities remain platform- and integration-specific.

## Product-family position

This repository remains the public PWA staging and compatibility surface.

- private [`DomesticIntelligence`](https://github.com/langzonedev/DomesticIntelligence) owns protected product/architecture authority;
- shared [`DomesticIntelligence-Doc`](https://github.com/langzonedev/DomesticIntelligence-Doc) owns the cross-platform north-star roadmap;
- private [`DomesticIntelligence-Mobile`](https://github.com/langzonedev/DomesticIntelligence-Mobile) is the native Android client and primary phone/sensor experimentation path.

Portable project data should remain compatible across Web and Android without moving protected logic into either client.

## Shared direction

The next major product vertical is **Spatial Capture / phone AR**, beginning on Android with phone-based room scanning that generates editable 2D property geometry.

The Web client is **not required to reproduce native sensor capture**. Its cross-platform role is to remain compatible with the resulting normal property geometry so a captured plan can still be viewed, edited, exported and round-tripped as part of the same digital twin.

The intended family-wide onboarding path is:

**scan → label/correct → import provider devices → reconcile exceptions → position assets → later move between 2D and AR views of the same property**.

Manual floor-plan drawing and manual asset creation remain supported. Provider import must not become append-only duplication, and Google Home is a source of device/room/capability context rather than the durable property authority.

See the shared roadmap in `DomesticIntelligence-Doc/ROADMAP.md`, `SPATIAL_CAPTURE_AND_AR.md`, and `PRODUCT_FAMILY_CONTRACT.md`.

## Live prototype

GitHub Pages: https://langzonedev.github.io/DomesticIntelligence-Web/

## Existing Living Atlas scope

- mobile-first editable 2D home map with snapped wall and device-point editing;
- property address and multi-storey planning with isolated reference plans per storey;
- explicit mobile Save/Cancel edit transactions, including safe Back and breakpoint rollback;
- bounded Undo/Redo and independent floor-plan, wall, device, status and label layers;
- local PNG, JPEG, WebP and single-page PDF floor-plan import;
- synthetic device metadata and operational records;
- capability-based acceptance checks with derived room and whole-home readiness;
- homeowner-safe PDF plus installer CSV/JSON export generated in the browser;
- IndexedDB persistence with a bounded localStorage fallback;
- original brand mark, accessible palette and device-following system theme;
- installable PWA shell and offline reopening.

Imported plans and project details are never uploaded by this prototype. Do not enter real credentials, passwords or Matter fabric keys.

## Spatial roadmap boundary

Future spatial capture output should arrive in the same durable editable geometry contract rather than as a Web-incompatible AR-only format. Web remains a useful correction, compatibility and review surface even when capture itself is native.

This documentation update does not claim Spatial Capture is implemented, Gauntlet-passed or authorised for production.

## Public boundary

This repository intentionally contains presentation code and synthetic demo data only. Protected algorithms, backend authority, private research, credentials, customer data and sensitive device/fabric information belong in the private `langzonedev/DomesticIntelligence` repository.

Governed by the Lang Systems Core Development baseline. Production release is not authorised by this prototype.
