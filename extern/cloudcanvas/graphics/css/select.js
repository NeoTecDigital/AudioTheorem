/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The select add-on's CSS chunk (`../../addons/select.js`), injected once when
 * the trait first starts: the ring a selected blit (`is-selected`) wears.
 */

/** The selection ring. */
export const SELECT_CSS = `/* ------------------ SELECTION ------------------ */

[data-blit].is-selected {
  outline: var(--cc-focus-ring-width, 2px) solid var(--cc-accent, #38bdf8);
  outline-offset: var(--cc-focus-ring-offset, 2px);
}

`;
