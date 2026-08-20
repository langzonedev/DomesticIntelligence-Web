# Domestic Intelligence brand system

## Idea

The mark combines a simplified top-down room boundary with three connected commissioning points. It is deliberately geometric, quiet and technical: a spatial workspace rather than a consumer smart-home gadget. The drawing is original, contains no typeface dependency and remains deterministic in source control.

Use `brand-mark.svg` as the primary app mark. Its dark architectural field, mint route and amber checkpoints remain readable in both interface themes. Do not recolour individual elements, stretch the mark or place other graphics inside it.

- Minimum digital size: 24 × 24 CSS pixels.
- Preferred interface size: 40–48 CSS pixels.
- Clear space: at least one quarter of the mark width on every side.
- The accessible name belongs on the surrounding link or heading when the mark is decorative. When the SVG is used alone, retain its embedded title and description.

## Character

Domestic Intelligence should feel like a dependable commissioning instrument used inside a home: precise, calm and reassuring, with colour reserved for selection and meaningful status. It should not look like a security alarm, electrical certification authority or a specific device vendor.

## Palette

The source of truth is `theme.css`. These pairings were selected with WCAG AA in mind; normal text needs at least 4.5:1 and large text or non-text interface boundaries at least 3:1.

| Role | Light | Dark | Approved use |
|---|---|---|---|
| Canvas | `#F3F7F5` | `#0D1714` | Page background |
| Surface | `#FFFFFF` | `#15241F` | Cards, sheets and panels |
| Primary text | `#14211E` | `#F2F8F5` | Body and headings on canvas/surface |
| Muted text | `#52635E` | `#B5C5BF` | Secondary copy; not disabled-state text |
| Brand/action | `#075E54` | `#86DDCB` | Primary action; use `#FFFFFF` on the light action and `#10201C` on the dark action |
| Ready | `#176B51` | `#82D7AD` | Ready label/icon with its corresponding soft background |
| Pending | `#805000` | `#FFCA70` | Pending label/icon with its corresponding soft background |
| Attention | `#9A3E36` | `#FF9D94` | Attention label/icon with its corresponding soft background |
| Information | `#245F88` | `#9BCFF0` | Neutral information with its corresponding soft background |

Status colour never carries meaning alone. Pair it with plain-language text and, where space allows, an icon. “Attention” means commissioning work remains; it must not imply an electrical hazard or regulated safety judgement.

## Theme behaviour

System theme is the default. With no `data-theme` attribute on the root `html` element, `prefers-color-scheme` selects light or dark automatically. An explicit user choice is represented as `data-theme="light"` or `data-theme="dark"`; the application is responsible for persisting that choice locally. Removing the attribute returns to System.

Load `theme.css` after the legacy stylesheet during migration. The `--di-*` variables are the durable v0.2 API. Temporary v0.1 aliases are included so old surfaces can move to the palette incrementally.

## Interaction and spatial rules

- All primary controls use a minimum 44 × 44 CSS-pixel target. Map edit handles increase to 28 pixels on narrow phones.
- Use the selection colour for focus, selected walls and editable points; retain a 3-pixel focus outline for keyboard users.
- Hidden layers must become non-interactive in application logic, not merely translucent. `--di-layer-hidden-opacity` is only for transitional or disabled previews.
- Do not rely on ultra-fine map lines. The strong border token is the minimum boundary treatment; selected geometry should also change stroke weight or show handles.
- Avoid placing text directly over uploaded plans without an opaque or strongly translucent surface.
- Keep mobile editing controls in a reachable sheet or toolbar and allow the map to retain useful space. The generic responsive grid moves to a map-plus-panel layout at 48rem.

## Typography and voice

Use the platform UI font stack for speed, legibility and offline reliability. Headings are short and direct; labels name tangible objects and actions. Prefer “Move wall”, “Show devices” and “Export handover” over abstract or vendor-specific terminology.

