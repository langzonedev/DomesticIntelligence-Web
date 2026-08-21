# Domestic Intelligence v0.7 brand and responsive foundation

## Decision

Domestic Intelligence v0.7 adopts the approved Lang Systems visual grammar without becoming a clone of the corporate website.

- **Violet is the primary product action and selection colour.** Use it for primary buttons, the active destination and selected controls.
- **Cyan is spatial guidance.** Use it for map focus, active geometry, handles, guides and neutral information. It is not a second general call-to-action colour.
- **Mint/green means success only.** It is reserved for a labelled `Ready` state or equivalent completed outcome.
- **Warning and danger colours are status-only.** Orange must not decorate ordinary controls, navigation or the map.
- **Theme follows the device/browser.** v0.7 has no manual theme selector and no `data-theme` override contract.

The implementation source is [`theme-v07.css`](theme-v07.css). Raw palette values appear only in its token definition layer. Components consume semantic `--di-v07-*` variables.

## Authority and research

The palette and shared interaction grammar come from the canonical Core assets:

- `LangSystems-Core-Development/assets/tokens/lang-systems.tokens.json`
- `LangSystems-Core-Development/assets/tokens/lang-systems.css`
- `LangSystems-Core-Development/docs/BRAND_AND_ASSET_SYSTEM.md`
- `LangSystems-Core-Development/docs/UX_AND_DESIGN_SYSTEM.md`

The current public `langzonedev/LangSystemsWebsite` was checked on 21 August 2026. Its production stylesheet uses the same ink, violet, cyan, mint, paper, panel and blueprint foundation, an 1180px content measure, restrained 8–12px radii, 44px controls, blueprint grids, violet actions and cyan focus. Domestic Intelligence carries those principles into a denser spatial tool, with 8/12/16px radii and a wider editor shell rather than copying marketing layouts or portfolio-card skins.

The previous Domestic Intelligence eucalyptus/amber system is historical v0.6 styling. It is not the v0.7 authority. During migration, `theme-v07.css` bridges the durable `--di-color-*` and current `--di-*` aliases to the new semantic system so the stable editor can move incrementally.

## Palette roles

### Approved Lang Systems primitives

| Primitive | Value | v0.7 use |
| --- | --- | --- |
| Ink | `#13072F` | Light-theme primary text, wall geometry |
| Secondary ink | `#2C2352` | Secondary headings and strong labels |
| Violet | `#6C19FF` | Primary action and current selection |
| Dark violet | `#250861` | Strong action text/link and dark gradient anchor |
| Cyan | `#0EA5B7` | Spatial guidance and focus family |
| Mint | `#34D399` | Success family only |
| Paper | `#F1F4FA` | Light canvas |
| Panel | `#F8F9FD` | Light surface |
| Wash | `#E9EEF6` | Recessed controls and quiet grouping |
| Blueprint | `#DFE8F2` | Spatial/grid family |

### Intentional dark counterpart

The dark theme is not an inverted light theme. It uses a violet-black canvas (`#0E0A19`), aubergine surfaces (`#171126` / `#201733`), near-white text (`#F7F4FF`), bright violet action (`#A983FF`) and bright cyan spatial guidance (`#5BD6E4`). Ready, pending, attention and information each use a dark soft background plus a high-contrast text colour. Pure black, neon gradients and green-tinted general surfaces are deliberately avoided.

## Measured contrast evidence

Ratios below use the WCAG relative-luminance formula, rounded to two decimals. Normal text requires 4.5:1; large text and non-text UI boundaries require 3:1.

| Foreground / background | Ratio | Approved use |
| --- | ---: | --- |
| Light text `#13072F` / paper `#F1F4FA` | 17.34:1 | Body and headings |
| Light muted `#635D78` / panel `#F8F9FD` | 5.93:1 | Secondary copy |
| White `#FFFFFF` / violet `#6C19FF` | 6.52:1 | Primary action |
| Dark violet `#250861` / panel `#F8F9FD` | 15.52:1 | Strong link/label |
| Focus cyan `#006B78` / panel `#F8F9FD` | 5.92:1 | Light focus and spatial text |
| Success `#087F5B` / panel `#F8F9FD` | 4.76:1 | Ready label |
| Success `#087F5B` / ready soft `#E9FAF3` | 4.63:1 | Ready status chip |
| Pending slate `#4B5563` / panel `#F8F9FD` | 7.14:1 | Untested label |
| Danger `#B42318` / panel `#F8F9FD` | 6.25:1 | Attention label |
| Light strong border `#8B84A1` / panel `#F8F9FD` | 3.38:1 | Control boundary |
| Dark text `#F7F4FF` / canvas `#0E0A19` | 17.97:1 | Body and headings |
| Dark muted `#BDB5D1` / surface `#171126` | 9.34:1 | Secondary copy |
| Dark action `#A983FF` / on-action `#17052F` | 6.71:1 | Primary action |
| Dark focus `#5BD6E4` / canvas `#0E0A19` | 11.32:1 | Focus and spatial guidance |
| Dark ready `#70E6B7` / soft `#12392E` | 8.30:1 | Ready status |
| Dark pending `#CBD5E1` / soft `#252B38` | 9.39:1 | Untested status |
| Dark attention `#FF9C91` / soft `#4B1E1A` | 6.95:1 | Attention status |
| Dark strong border `#756696` / raised surface `#201733` | 3.33:1 | Control boundary |

Colour never carries commissioning meaning alone. Status components require visible text and include a shape marker. `Needs attention` is a workflow state, not an electrical hazard or certification claim.

## Product lock-up and company mark

The canonical Lang Systems raster masters in Core are approved public company assets, but they have a light background and are not transparent. Do not remove white pixels, apply `mix-blend-mode`, recolour segments or improvise a vector trace.

For v0.7:

1. Use a **text-led product lock-up** in primary app chrome: `Domestic Intelligence`, with the residence address as context. A small `Lang Systems` endorsement may appear in About or launch material, not as competing navigation text.
2. The official `lang-systems-mark-outline.png` may be copied unchanged from Core for an About/attribution surface only. Render it inside a white 8px-radius tile with at least 12.5% clear space and a minimum 44px image dimension. Treat it as decorative when adjacent text already says `Lang Systems`.
3. Do not shrink the full `lang-systems-logo.png` into the app bar. Its wordmark is intended for larger light-background uses.
4. `brand-mark.svg` is the approved v0.7 violet/cyan Domestic Intelligence derivative: the existing floor-plan/checkpoint concept is retained, while the old eucalyptus/amber treatment is retired.

Core master checksums:

- Outline mark: `4458d941605fc87dc9611c58e1f64c48013fa93fad3372476a5133d27f71ffe9`
- Full lock-up: `587e8567536973c03d4d8196782977d4caeaa0e60e1d8c956a3f7a8568c858ce`

## Spatial and status token rules

- The map stays portrait. `--di-v07-map-*` tokens distinguish canvas, room, minor grid, major grid, wall, muted wall, cyan guidance and handle fill.
- Active geometry uses cyan plus a stroke-weight/handle change. Violet remains the surrounding product selection/action language.
- A hidden layer is visually hidden and non-interactive in the CSS foundation. Application logic must also omit it from hit-testing and mark its controls with the correct state; CSS is not a data-state safeguard.
- Uploaded plans sit behind vector geometry. Labels require an opaque or strongly translucent backing/paint-order treatment.
- Map gestures retain 44px non-scaling hit zones independently of visible stroke width.
- `Ready`, `Pending`, `Attention` and `Info` use separate text/background pairs and never reuse the action violet.

## Responsive composition

The reusable primitives in `theme-v07.css` establish three compositions:

- **Phone, below 48rem:** sticky app bar, fixed four-destination bottom navigation, one task surface, horizontally scrollable toolbars and a portrait map sized from available viewport height. Full-screen dialogs have no rounded outer edge.
- **Tablet, 48–69.999rem:** the portrait map remains dominant; inspector sections may form a two-column flow below it. Mobile cards do not stretch into a wide single column.
- **Desktop, 70rem and above:** map plus a 20–24rem inspector rail, with an optional sticky inspector constrained to the viewport.

Every interactive primitive has a 44px minimum target, strong `:focus-visible`, safe-area padding where fixed, `min-width: 0` in grid/flex children, and no fixed content width that can create page-level horizontal overflow.

Radii are intentionally limited to 8px, 12px and 16px, plus a semantic pill for statuses. The spacing scale remains 4/8/12/16/24/32/48px.

## Motion, forced colours and system theme

- Motion is short and functional: 140ms feedback, 180ms state transitions and 260ms larger spatial changes.
- `prefers-reduced-motion: reduce` collapses non-essential motion to 0.01ms and disables smooth scrolling.
- `forced-colors: active` maps surfaces, text, focus and action to system colours, removes the decorative grid and hides visually hidden layer previews.
- The stylesheet follows `prefers-color-scheme`. Do not add a product theme setting or write `data-theme` from JavaScript.

## Integration sequence

1. Add `<link rel="stylesheet" href="theme-v07.css">` after all v0.6 theme/layout styles. Do not delete old styles in the same commit.
2. Add `class="di-v07"` to the application root or `body` to opt into the foundation primitives.
3. Move shell surfaces incrementally to `.di-v07-appbar`, `.di-v07-shell`, `.di-v07-workspace`, `.di-v07-surface`, `.di-v07-toolbar`, `.di-v07-map-frame`, `.di-v07-inspector`, `.di-v07-control`, `.di-v07-status` and `.di-v07-bottom-nav`.
4. Preserve existing editor/storage behavior. This layer does not author routing, persistence, layer hit-testing or Save/Cancel semantics.
5. Remove the hidden manual theme field from markup when the owning integration task touches it; do not merely restyle it.
6. Update `theme-color` from the same semantic canvas/surface values during system-theme changes, without introducing a user theme preference.
7. During the Gauntlet, capture 320/375/390/768/1024/1440px in both system themes and measure all visible controls, map hit zones, focus states, status pairs and page overflow.

## Acceptance checklist

- [ ] Violet is the only general action accent.
- [ ] Cyan is limited to spatial guidance, focus and neutral information.
- [ ] Mint/green appears only in labelled success meaning; orange is not used.
- [ ] System light/dark selection works with no application selector.
- [ ] All documented contrast pairs meet WCAG 2.2 AA.
- [ ] Controls and map hit zones are at least 44px.
- [ ] Phone, tablet and desktop compositions are intentionally different.
- [ ] Reduced-motion and forced-colours behavior is verified.
- [ ] Company raster masters remain unchanged and are used only on suitable light tiles.
- [ ] The v0.7 violet/cyan product mark is used consistently at small sizes.
