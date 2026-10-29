/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The pan add-on's CSS chunk (`../../addons/pan.js`), injected once when the
 * trait starts: a root with `pan` is a gesture surface. No text selection, so
 * a drag never leaves one behind for the next press to turn into a native drag,
 * and no browser touch panning or zooming, so a finger's pointer stream is the
 * add-on's to read rather than the page's to scroll.
 */

/** The gesture surface. */
export const PAN_CSS = `/* ------------------ PAN ------------------ */

[data-blit-root][data-pan] {
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

`;
