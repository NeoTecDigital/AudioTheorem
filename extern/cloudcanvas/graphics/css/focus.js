/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The focus add-on's CSS chunk (`../../addons/focus.js`), injected once when a
 * blit is first focused: the glow the focused blit (`is-focused`) wears.
 *
 * Forced, because the glow replaces whatever shadow the blit's own surface or
 * its hover lift paints, whichever chunk came first - and forced over a value
 * that is token reads alone, so a theme still decides what the glow is
 * (`../style-gates.js`, rule 3).
 */

/** The focus glow. */
export const FOCUS_CSS = `/* ------------------ FOCUS ------------------ */

[data-blit].is-focused {
  box-shadow: var(
    --cc-shadow-focus,
    0 0 0 2px var(--cc-focus, #833446),
    0 10px 30px var(--cc-focus-glow, rgba(131, 52, 70, 0.35))
  ) !important;
}

`;
