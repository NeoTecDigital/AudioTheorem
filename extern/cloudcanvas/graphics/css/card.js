/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The display widgets' CSS chunk (`../../addons/types.js`), injected once by
 * `registerDisplayTypes`: the card surface a `card`, `media` or `vector-pointer`
 * blit wears unless `chrome` is false (and any blit wears with `chrome: true`),
 * its hover lift and border toggle, selectable text, the templates' sections
 * (the `CLS` classes), the badge pill the header's slot draws, and the scope
 * well the widgets' children sit in. Themed through the tokens.
 */

/** The surface and its toggles. */
const SURFACE_CSS = `/* ------------------ DISPLAY WIDGETS ------------------ */

:is([data-type="card"], [data-type="media"], [data-type="vector-pointer"])[data-blit]:not([data-chrome="false"]),
[data-blit][data-chrome="true"] {
  box-sizing: border-box;
  padding: var(--cc-space-3, 12px) var(--cc-space-4, 16px);
  background: var(--cc-card-bg, rgba(30, 41, 59, 0.85));
  backdrop-filter: blur(var(--cc-card-blur, 12px));
  -webkit-backdrop-filter: blur(var(--cc-card-blur, 12px));
  border: 1px solid var(--cc-card-border, rgba(255, 255, 255, 0.1));
  border-radius: var(--cc-radius-md, 10px);
  box-shadow: var(--cc-shadow-1, 0 4px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06));
  max-width: var(--cc-card-max-width, 340px);
  color: var(--cc-text, #e2e8f0);
  font-family: var(--cc-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
}

[data-blit][style*="width"]:not([data-chrome="false"]) {
  max-width: none;
}

:is([data-type="card"], [data-type="media"], [data-type="vector-pointer"])[data-blit]:not([data-chrome="false"]):hover,
[data-blit][data-chrome="true"]:hover {
  border-color: var(--cc-card-border-hover, rgba(255, 255, 255, 0.18));
  box-shadow: var(--cc-shadow-2, 0 12px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.09));
}

/* After the hover lift, each at its specificity, so the toggle outranks it under the pointer too.
   Transparent rather than removed: the box keeps its border width and moves by nothing. */
:is([data-type="card"], [data-type="media"], [data-type="vector-pointer"])[data-blit][data-bordered="false"],
:is([data-type="card"], [data-type="media"], [data-type="vector-pointer"])[data-blit][data-bordered="false"]:hover,
[data-blit][data-bordered="false"],
[data-blit][data-bordered="false"]:hover {
  border-color: transparent;
}

/* A widget toggles its empty sections with the hidden attribute; a host rule giving one a display must not show it. */
[data-type] [hidden] {
  display: none;
}

/* Selectable text takes the caret; the header stays the drag handle. */
[data-blit][data-selectable-text="true"] {
  user-select: text;
  -webkit-user-select: text;
  cursor: auto;
}

[data-blit][data-selectable-text="true"] [data-drag-handle] {
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
}

`;

/** The badge pill `createBadgeSVG` (the primitives) draws into the header's slot. */
const BADGE_CSS = `.cloudcanvas-primitive-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--cc-space-1, 4px);
  padding: var(--cc-space-1, 4px) var(--cc-space-2, 8px);
  border-radius: var(--cc-radius-pill, 9999px);
  background: var(--cc-badge-bg, rgba(56, 189, 248, 0.15));
  color: var(--cc-badge-text, #38bdf8);
  border: 1px solid var(--cc-badge-border, rgba(56, 189, 248, 0.3));
  font-size: var(--cc-type-sm, 12px);
  font-weight: var(--cc-weight-semibold, 600);
  line-height: 1;
  white-space: nowrap;
}

`;

/** The header, body and footer every type but `raw` opens with. */
const SECTIONS_CSS = `.cloudcanvas-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cc-space-3, 12px);
  margin-bottom: var(--cc-space-2, 8px);
}

.cloudcanvas-card-title {
  font-size: var(--cc-type-lg, 15px);
  font-weight: var(--cc-weight-semibold, 600);
  color: var(--cc-text, #e2e8f0);
  line-height: 1.25;
}

.cloudcanvas-card-badge-slot {
  display: inline-flex;
  align-items: center;
  flex: none;
}

.cloudcanvas-card-body {
  font-size: var(--cc-type-md, 13px);
  color: var(--cc-text-muted, #94a3b8);
  line-height: 1.45;
}

.cloudcanvas-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cc-space-2, 8px);
  margin-top: var(--cc-space-3, 12px);
  font-size: var(--cc-type-xs, 11px);
  color: var(--cc-text-muted, #94a3b8);
}

/* A single-line ellipsised run states its line-height, or the footer's height moves with the host page's. */
.cloudcanvas-card-author {
  font-size: var(--cc-type-xs, 11px);
  line-height: 1.45;
  color: var(--cc-text-muted, #94a3b8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloudcanvas-card-action-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--cc-control-min, 28px);
  padding: var(--cc-space-1, 4px) var(--cc-space-2, 8px);
  background: var(--cc-btn-bg, rgba(56, 189, 248, 0.12));
  border: 1px solid var(--cc-btn-border, rgba(56, 189, 248, 0.35));
  border-radius: var(--cc-radius-sm, 6px);
  color: var(--cc-btn-text, #7dd3fc);
  font-family: inherit;
  font-size: var(--cc-type-xs, 11px);
  font-weight: var(--cc-weight-medium, 500);
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.cloudcanvas-card-action-btn:hover {
  background: var(--cc-btn-bg-hover, rgba(56, 189, 248, 0.22));
  border-color: var(--cc-accent, #38bdf8);
}

/* A coarse pointer gets the full 44px target without changing the desktop look. */
@media (pointer: coarse) {
  .cloudcanvas-card-action-btn {
    min-height: var(--cc-control-min-coarse, 44px);
  }
}

.cloudcanvas-card-html {
  min-width: 0;
}

`;

/** The media body, and the vector-pointer's needle beside its gauge column. */
const MEDIA_GAUGE_CSS = `.cloudcanvas-card-media {
  display: block;
  width: 100%;
  max-height: var(--cc-media-max-height, 120px);
  object-fit: cover;
  border-radius: var(--cc-radius-sm, 6px);
  background: var(--cc-scope-bg, rgba(0, 0, 0, 0.2));
}

.cloudcanvas-card-caption {
  margin: var(--cc-space-2, 8px) 0 0;
  font-size: var(--cc-type-xs, 11px);
  color: var(--cc-text-muted, #94a3b8);
  line-height: 1.35;
}

.cloudcanvas-card-gauge-row {
  display: flex;
  align-items: center;
  gap: var(--cc-space-3, 12px);
  padding: var(--cc-space-1, 4px) 0;
}

.cloudcanvas-card-needle-slot {
  display: flex;
  align-items: center;
  flex: none;
}

.cloudcanvas-card-gauge {
  flex: 1;
  min-width: 0;
}

.cloudcanvas-card-label {
  margin-bottom: var(--cc-space-1, 4px);
  font-size: var(--cc-type-xs, 11px);
  color: var(--cc-text-muted, #94a3b8);
}

.cloudcanvas-card-meter-slot {
  display: block;
}

`;

/**
 * The scope well. Every widget but `raw` carries one, so an empty one costs
 * nothing: no box until something is inside it. The well itself - frame, gap,
 * clip, floor - arrives with `cc-populated`, which the layout add-on writes only
 * while a live child is inside, together with the measured `min-height` the
 * clip is honest against. An outline rather than a border, so the frame takes
 * nothing out of a `border-box` content box; the flow modes are the layout
 * add-on's own chunk.
 */
const SCOPE_CSS = `.cloudcanvas-card-scope {
  width: 100%;
  min-height: 0;
  margin: 0;
}

[data-scope].cloudcanvas-card-scope:empty {
  display: none;
}

.cloudcanvas-card-scope.cc-populated {
  box-sizing: border-box;
  margin-top: var(--cc-space-2, 8px);
  min-height: var(--cc-scope-min-height, 40px);
  border-radius: var(--cc-radius-sm, 6px);
  background: var(--cc-scope-bg, rgba(0, 0, 0, 0.2));
  outline: 1px dashed var(--cc-scope-border, rgba(255, 255, 255, 0.15));
  outline-offset: -1px;
  overflow: var(--cc-scope-overflow, hidden);
}

@media (prefers-reduced-motion: reduce) {
  .cloudcanvas-card-action-btn {
    transition: none;
  }

  /* The SVG generators write their own inline transitions. */
  .cloudcanvas-card-needle-slot svg,
  .cloudcanvas-card-meter-slot * {
    transition: none !important;
  }
}

`;

/** The display widgets' whole chunk. */
export const CARD_CSS = /* @__PURE__ */ [SURFACE_CSS, BADGE_CSS, SECTIONS_CSS, MEDIA_GAUGE_CSS, SCOPE_CSS].join('');
