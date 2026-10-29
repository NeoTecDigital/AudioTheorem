/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * `TOKENS`: a JS-readable catalogue of the framework's `--cc-*` design tokens.
 *
 * The token *values* live where they always have - in the fallback chain of
 * the CSS chunks (`./css/`, all of them in `CANVAS_DEFAULT_CSS`) and of the few engine modules that
 * read a token directly, and in the override set `LIGHT_THEME` (`./theme.js`).
 * This module invents no value and no name: it is a discovery layer *over*
 * those strings, so a component author or an appearance editor can
 * ask "what tokens are in the radius category" or "is `--cc-foo` a real token"
 * instead of grepping a four-hundred-line stylesheet. Injecting styles stays
 * exactly as it was - stylesheets with `var()` fallbacks, never CSS-in-JS; this
 * is the map you read *before* you write one.
 *
 * The catalogue is authored, not scraped, because the two source strings cannot
 * be scraped for *intent*: a `var(--cc-shadow-1, ...)` read tells you the name
 * exists, not that it is an elevation shadow rather than a colour. So each entry
 * carries the one thing the strings do not - its `category` and its `purpose` -
 * and the tests (`tests/unit/tokens.test.js`) hold the catalogue honest against
 * the strings in both directions: every catalogued name must actually be read
 * somewhere, and every `LIGHT_THEME` key must be catalogued. That cross-check is
 * what keeps this from drifting into a third, contradictory source of truth.
 *
 * It complements `./style-gates.js` rather than duplicating it. The gate checks a
 * *stylesheet* for discipline (every themable value reads a token, every class is
 * namespaced); this names the tokens that discipline is written against, so a
 * future gate - or an editor's "unknown token" warning - can resolve a `var()`
 * read to a known name through {@link isToken} instead of re-listing them.
 */

import { TOKEN_PREFIX, LIGHT_THEME } from './theme.js';

/**
 * Token categories.
 *
 * The split is by *what a value is for*, which is the axis an author browses on:
 * a colour picker wants `COLOR`, a spacing control wants `SPACE`, and neither
 * wants the other. `SIZE` is the catch-all for the scalar geometry tokens
 * (control heights, blur radii, max-widths) that are themable knobs but are
 * neither a spacing step nor a corner radius.
 */
export const TOKEN_CATEGORY = /* @__PURE__ */ Object.freeze({
  COLOR: 'color',
  SPACE: 'space',
  RADIUS: 'radius',
  SHADOW: 'shadow',
  TYPE: 'type',
  Z_INDEX: 'z-index',
  SIZE: 'size',
  LAYOUT: 'layout'
});

const C = TOKEN_CATEGORY;

/**
 * The catalogue: token name -> `{ category, purpose }`.
 *
 * Names are the full `--cc-*` custom property. `purpose` is one line, present
 * tense, describing what the value paints or sizes - enough for an editor to
 * label a control without opening the stylesheet.
 */
export const TOKENS = /* @__PURE__ */ Object.freeze({
  /* ---- foundations: colour ---- */
  '--cc-bg': { category: C.COLOR, purpose: 'Canvas background fill' },
  '--cc-grid-dot': { category: C.COLOR, purpose: 'Dot colour of the background grid' },
  '--cc-text': { category: C.COLOR, purpose: 'Primary body text colour' },
  '--cc-text-muted': { category: C.COLOR, purpose: 'Secondary/muted text colour' },
  '--cc-accent': { category: C.COLOR, purpose: 'Accent colour for selection and controls' },
  '--cc-focus': { category: C.COLOR, purpose: 'Focused-blit ring colour' },
  '--cc-focus-glow': { category: C.COLOR, purpose: 'Soft glow around a focused blit' },
  '--cc-focus-ring': { category: C.COLOR, purpose: 'Keyboard focus-visible outline colour' },
  '--cc-connector': { category: C.COLOR, purpose: 'Default connector stroke colour' },
  '--cc-cursor-focus': { category: C.COLOR, purpose: 'Focus cursor reticle colour' },
  '--cc-cursor-selected': { category: C.COLOR, purpose: 'Selection cursor colour' },
  '--cc-cursor-activated': { category: C.COLOR, purpose: 'Activation cursor colour' },
  '--cc-cursor-label': { category: C.COLOR, purpose: 'Cursor caption text colour' },
  '--cc-card-bg': { category: C.COLOR, purpose: 'Card surface fill' },
  '--cc-card-border': { category: C.COLOR, purpose: 'Card border colour' },
  '--cc-card-border-hover': { category: C.COLOR, purpose: 'Card border colour on hover' },
  '--cc-scope-bg': { category: C.COLOR, purpose: 'Scope-well surface fill' },
  '--cc-scope-border': { category: C.COLOR, purpose: 'Scope-well dashed outline colour' },
  '--cc-badge-bg': { category: C.COLOR, purpose: 'Badge background fill' },
  '--cc-badge-text': { category: C.COLOR, purpose: 'Badge label colour' },
  '--cc-badge-text-override': { category: C.COLOR, purpose: 'Theme override for computed badge text colour' },
  '--cc-badge-border': { category: C.COLOR, purpose: 'Badge border colour' },
  '--cc-surface-2': { category: C.COLOR, purpose: 'Raised surface tint (SVG-state fill)' },
  '--cc-btn-bg': { category: C.COLOR, purpose: 'Action button background' },
  '--cc-btn-bg-hover': { category: C.COLOR, purpose: 'Action button background on hover' },
  '--cc-btn-border': { category: C.COLOR, purpose: 'Action button border colour' },
  '--cc-btn-text': { category: C.COLOR, purpose: 'Action button label colour' },
  '--cc-meter-track': { category: C.COLOR, purpose: 'Gradient-meter track colour' },
  '--cc-meter-end': { category: C.COLOR, purpose: 'Gradient-meter far-end colour' },
  '--cc-menu-bg': { category: C.COLOR, purpose: 'Context-menu surface fill' },
  '--cc-menu-border': { category: C.COLOR, purpose: 'Context-menu border colour' },
  '--cc-menu-item-bg': { category: C.COLOR, purpose: 'Context-menu item background' },
  '--cc-menu-item-bg-hover': { category: C.COLOR, purpose: 'Context-menu item background on hover' },
  '--cc-resize-handle-bg': { category: C.COLOR, purpose: 'Resize-handle fill colour' },
  '--cc-resize-handle-ring': { category: C.COLOR, purpose: 'Resize-handle outer ring shadow' },
  '--cc-grab-handle-bg': { category: C.COLOR, purpose: 'Chromeless grab-handle background' },
  '--cc-grab-handle-dot': { category: C.COLOR, purpose: 'Grab-handle grip-dot colour' },
  '--cc-grab-handle-fill': { category: C.COLOR, purpose: 'Grab-handle backing fill' },
  '--cc-grab-handle-ring': { category: C.COLOR, purpose: 'Grab-handle outer ring shadow' },

  /* ---- foundations: spacing ---- */
  '--cc-space-1': { category: C.SPACE, purpose: 'Spacing step 1 (tightest)' },
  '--cc-space-2': { category: C.SPACE, purpose: 'Spacing step 2' },
  '--cc-space-3': { category: C.SPACE, purpose: 'Spacing step 3' },
  '--cc-space-4': { category: C.SPACE, purpose: 'Spacing step 4 (widest)' },

  /* ---- foundations: radius ---- */
  '--cc-radius-sm': { category: C.RADIUS, purpose: 'Small corner radius (chips, insets)' },
  '--cc-radius-md': { category: C.RADIUS, purpose: 'Medium corner radius (cards, menus)' },
  '--cc-radius-pill': { category: C.RADIUS, purpose: 'Full pill radius (badges, meters)' },

  /* ---- foundations: shadow ---- */
  '--cc-shadow-1': { category: C.SHADOW, purpose: 'Resting elevation shadow' },
  '--cc-shadow-2': { category: C.SHADOW, purpose: 'Raised elevation shadow (hover, drag)' },
  '--cc-shadow-focus': { category: C.SHADOW, purpose: 'Focused-blit shadow stack' },

  /* ---- foundations: type ---- */
  '--cc-font': { category: C.TYPE, purpose: 'Base font-family stack' },
  '--cc-font-mono': { category: C.TYPE, purpose: 'Monospace font-family stack' },
  '--cc-type-xs': { category: C.TYPE, purpose: 'Extra-small type size' },
  '--cc-type-sm': { category: C.TYPE, purpose: 'Small type size' },
  '--cc-type-md': { category: C.TYPE, purpose: 'Medium (body) type size' },
  '--cc-type-lg': { category: C.TYPE, purpose: 'Large (title) type size' },
  '--cc-weight-medium': { category: C.TYPE, purpose: 'Medium font weight' },
  '--cc-weight-semibold': { category: C.TYPE, purpose: 'Semibold font weight' },

  /* ---- foundations: stacking ---- */
  '--cc-z-overlay': { category: C.Z_INDEX, purpose: 'Toast stack stacking order in the overlay' },
  '--cc-z-drag': { category: C.Z_INDEX, purpose: 'Dragging/resizing blit and resize-handle stacking order' },
  '--cc-z-grab': { category: C.Z_INDEX, purpose: 'Grab-handle stacking order, over the resize handle at its corner' },
  '--cc-z-menu': { category: C.Z_INDEX, purpose: 'Context-menu stacking order' },

  /* ---- scalar geometry (themable knobs) ---- */
  '--cc-grid-size': { category: C.SIZE, purpose: 'Background grid cell size' },
  '--cc-grid-dot-size': { category: C.SIZE, purpose: 'Background grid dot radius' },
  '--cc-card-blur': { category: C.SIZE, purpose: 'Card backdrop blur radius' },
  '--cc-card-max-width': { category: C.SIZE, purpose: 'Max width of a self-sizing card' },
  '--cc-media-max-height': { category: C.SIZE, purpose: 'Max height of a media card image' },
  '--cc-scope-min-height': { category: C.SIZE, purpose: 'Minimum populated scope-well height' },
  '--cc-control-min': { category: C.SIZE, purpose: 'Minimum interactive control height' },
  '--cc-control-min-coarse': { category: C.SIZE, purpose: 'Minimum control height for coarse pointers' },
  '--cc-menu-min-width': { category: C.SIZE, purpose: 'Minimum context-menu width' },
  '--cc-focus-ring-width': { category: C.SIZE, purpose: 'Keyboard focus outline width' },
  '--cc-focus-ring-offset': { category: C.SIZE, purpose: 'Keyboard focus outline offset' },
  '--cc-resize-handle-size': { category: C.SIZE, purpose: 'Resize-handle size' },
  '--cc-resize-handle-size-coarse': { category: C.SIZE, purpose: 'Resize-handle size for coarse pointers' },
  '--cc-grab-handle-size': { category: C.SIZE, purpose: 'Grab-handle size' },
  '--cc-grab-handle-size-coarse': { category: C.SIZE, purpose: 'Grab-handle size for coarse pointers' },
  '--cc-badge-dot': { category: C.SIZE, purpose: 'Badge status-dot diameter' },

  /* ---- layout ---- */
  '--cc-layout-gap': { category: C.LAYOUT, purpose: 'Gap between flow-container children' },
  '--cc-grid-columns': { category: C.LAYOUT, purpose: 'Grid container column-track template' },
  '--cc-scope-overflow': { category: C.LAYOUT, purpose: 'Overflow behaviour of a populated scope well' }
});

/** Every catalogued token name. */
export const TOKEN_NAMES = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.keys(TOKENS));

/**
 * Whether `name` is a catalogued `--cc-*` token.
 *
 * The resolver an editor or a future style gate reaches for: a `var()` read
 * whose name is not here is either a typo or a token this catalogue forgot, and
 * either way is worth a warning.
 */
export function isToken(name) {
  return Object.prototype.hasOwnProperty.call(TOKENS, name);
}

/**
 * Every token in a category, as `[name, entry]` pairs in catalogue order.
 *
 * This is the "what exists in the shadow/radius/colour category" query the whole
 * module is for: an appearance editor builds one control group per category by
 * calling this once per {@link TOKEN_CATEGORY} value.
 *
 * @param {string} category one of {@link TOKEN_CATEGORY}
 * @returns {Array<[string, {category: string, purpose: string}]>}
 */
export function tokensInCategory(category) {
  return Object.entries(TOKENS).filter(([, entry]) => entry.category === category);
}

/**
 * The reference light-theme override for a token, or `undefined` when the token
 * keeps its dark default (which is the fallback baked into the stylesheet, not a
 * value this module holds).
 *
 * Reads through to `LIGHT_THEME` rather than copying it, so the theme stays the
 * single owner of every override value and this catalogue never disagrees with
 * it about one.
 */
export function lightThemeValue(name) {
  return LIGHT_THEME[name];
}

/** The custom-property prefix every token carries; re-exported from the theme. */
export { TOKEN_PREFIX };
