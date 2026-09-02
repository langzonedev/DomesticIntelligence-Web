# Domestic Intelligence Web Agent Rules

## Authority

1. Explicit current operator instruction.
2. Private `DomesticIntelligence` product brief, architecture and acceptance criteria.
3. Shared cross-platform direction in `langzonedev/DomesticIntelligence-Doc`.
4. This file.
5. LangSystems Core Development baseline.

The public repository contains only safe PWA presentation, generic spatial/domain logic, synthetic fixtures and publishable assets. Do not add customer data, credentials, Matter fabric secrets, protected commercial algorithms or privileged endpoints.

## Product contract

- The floor plan is the dominant Living Atlas surface on desktop, tablet and phone.
- View mode is safe; Edit mode supports direct manipulation with Undo/Redo and cancellation.
- Device points open rich operational records without collecting passwords, Wi-Fi keys or fabric credentials.
- State, per-storey reference plans and exports remain local to the browser.
- Use LangSystems semantic design tokens and accessible status presentation.
- Follow `prefers-color-scheme`; no manual selector without private product authorisation.
- Minimum touch/control/hit target is 44x44px; status is never colour-only.

## Shared Spatial Capture direction

The next family vertical is **Spatial Capture / phone AR**, implemented/discovered first in the native Android client.

Web does not need to reproduce camera/sensor capture. Its responsibilities are:

- remain compatible with captured geometry once converted into the normal Domestic Intelligence property model;
- preserve manual floor-plan editing as a first-class fallback/correction path;
- round-trip captured/manual geometry without introducing Web-vs-AR copies of the property;
- keep provider import/link metadata provider-neutral in portable/public-safe representations;
- avoid append-only import semantics that duplicate already-linked assets;
- support review/correction of room labels, geometry and asset placement where those capabilities are part of the shared interchange contract.

Google Home is an initial provider source, not the durable property authority. The shared onboarding target is **scan → label/correct → import provider devices → reconcile exceptions → position assets → 2D/AR continuity**.

Do not claim native Spatial Capture, AR alignment, concealed-service certainty or provider control capability from the public Web client unless separately implemented and verified.

## Engineering and verification

- Prefer incremental TypeScript for touched editor/property/component modules; keep stable storage/export logic unless behavior requires a change.
- No runtime CDN, telemetry or third-party remote dependency.
- Preserve Save/Cancel/Back transaction semantics and per-storey storage authority.
- Add focused tests for migrations, geometry, keyboard behavior, persistence races, export privacy, PWA/offline behavior and a representative large property.
- When portable geometry changes to accommodate Spatial Capture, add explicit cross-client golden-fixture/round-trip verification before claiming compatibility.
- Browser-test the complete contracted viewport matrix and both system themes on the exact frozen snapshot.
- Critics are read-only during Gauntlet verdict rounds. Do not label a browser-unavailable round as a visual pass without fresh identical-snapshot evidence elsewhere.
- Do not push or publish until the applicable Gauntlet/handoff contract is satisfied.
