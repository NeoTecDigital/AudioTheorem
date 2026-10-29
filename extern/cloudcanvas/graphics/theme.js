/**
 * CloudCanvas - NeoTec, LLC, Richard Christopher
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Theming: the reference light token set, and the one function that applies it.
 *
 * A theme is inline custom properties on the host element, not a stylesheet
 * swap. That wins over any author rule without `!important`, scopes to one
 * session on a shared page, and is reversible in a single call - which a
 * swapped `<link>` is not. The dark theme is not a token set at all: it is the
 * fallback chain baked into `CANVAS_DEFAULT_CSS`, so clearing is the same
 * operation as returning to default.
 */

/** Custom properties owned by the framework; the prefix is the whole contract. */
export const TOKEN_PREFIX = '--cc-';

/**
 * Reference light theme: the override set `applyTheme` writes onto a host.
 *
 * Only tokens whose dark fallback is wrong on a light surface appear here -
 * geometry (spacing, radii, type scale) is theme-independent. Every key is read
 * either by `CANVAS_DEFAULT_CSS` or by an SVG generator in `primitives/`, which
 * `tests/unit/styles.test.js` asserts.
 */
export const LIGHT_THEME = /* @__PURE__ */ Object.freeze({
  '--cc-bg': '#f4f5f7',
  '--cc-grid-dot': 'rgba(15, 23, 42, 0.14)',
  '--cc-text': '#1e293b',
  '--cc-text-muted': '#64748b',
  '--cc-accent': '#0284c7',
  '--cc-focus': '#9f3a52',
  '--cc-focus-glow': 'rgba(159, 58, 82, 0.25)',
  '--cc-card-bg': 'rgba(255, 255, 255, 0.92)',
  '--cc-card-border': 'rgba(15, 23, 42, 0.12)',
  '--cc-card-border-hover': 'rgba(15, 23, 42, 0.2)',
  '--cc-scope-bg': 'rgba(15, 23, 42, 0.05)',
  '--cc-scope-border': 'rgba(15, 23, 42, 0.15)',
  '--cc-badge-bg': 'rgba(2, 132, 199, 0.1)',
  '--cc-badge-text': '#0369a1',
  // Generated badges compute their own text colour against the *dark* card and
  // write it inline, where no host-level token can reach it. This is the token
  // that can (see `BADGE_TEXT_OVERRIDE_TOKEN` in primitives.js): on a light card
  // every tint at the badge's fill alpha composites to a pale surface, so one
  // dark foreground - the theme's own text colour - clears 4.5:1 across the
  // whole tint range where the dark-card computation scored ~1.15:1.
  '--cc-badge-text-override': '#1e293b',
  '--cc-badge-border': 'rgba(2, 132, 199, 0.3)',
  '--cc-btn-bg': 'rgba(2, 132, 199, 0.08)',
  '--cc-btn-bg-hover': 'rgba(2, 132, 199, 0.16)',
  '--cc-btn-border': 'rgba(2, 132, 199, 0.35)',
  '--cc-btn-text': '#0369a1',
  '--cc-meter-track': 'rgba(15, 23, 42, 0.08)',
  '--cc-meter-end': '#db2777',
  '--cc-connector': 'rgba(2, 132, 199, 0.55)',
  // Read by the cursors add-on (`../addons/cursors.js`), which builds SVG attributes
  // rather than matching a stylesheet rule.
  '--cc-cursor-focus': '#9f3a52',
  '--cc-cursor-selected': '#0284c7',
  '--cc-cursor-activated': '#059669',
  // The reticle *caption* is text, not a marker, so it is not the reticle
  // colour: #9f3a52 on a light canvas reads at 4.1:1 and the dark default's
  // #833446 measured 2.29:1. Stated here rather than left to the
  // `var(--cc-text)` fallback so a theme that moves body text without moving
  // the caption still has a knob for it.
  '--cc-cursor-label': '#1e293b',
  '--cc-shadow-1': '0 2px 8px rgba(15, 23, 42, 0.1), 0 1px 2px rgba(15, 23, 42, 0.08)',
  '--cc-shadow-2': '0 12px 28px rgba(15, 23, 42, 0.18)'
});

/**
 * Write (or clear) CloudCanvas tokens on a host element.
 *
 * A `null` value removes one token; a `null` `vars` removes them all, restoring
 * the built-in dark fallbacks. Keys outside the `--cc-` prefix are ignored: a
 * theme may not reach past the framework's own surface.
 *
 * @param {Element} hostElement element carrying `.cloudcanvas-host`
 * @param {Object<string, string|null>|null} vars token map, or null to clear
 * @returns {Element|null} the host, for chaining
 */
export function applyTheme(hostElement, vars) {
  const style = hostElement ? hostElement.style : null;
  if (!style) return null;

  if (vars === null || vars === undefined) {
    clearTheme(style);
    return hostElement;
  }

  for (const [name, value] of Object.entries(vars)) {
    if (!name.startsWith(TOKEN_PREFIX)) continue;
    if (value === null || value === undefined) style.removeProperty(name);
    else style.setProperty(name, String(value));
  }

  return hostElement;
}

/** Remove every `--cc-*` property. Names are collected first: removal reindexes. */
function clearTheme(style) {
  const names = [];
  for (let i = 0; i < style.length; i += 1) {
    const name = style.item(i);
    if (name && name.startsWith(TOKEN_PREFIX)) names.push(name);
  }
  for (const name of names) style.removeProperty(name);
}
