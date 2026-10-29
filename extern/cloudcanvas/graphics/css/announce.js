/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The announce add-on's CSS chunk (`../../addons/announce.js`), injected once when the add-on
 * installs.
 */

/** The visually hidden live region. */
export const LIVE_REGION_CSS = `/* ------------------ UTILITY ------------------ */

/* Announcement target for assistive technology: in the accessibility tree,
   out of the visual one. */
.cloudcanvas-live-region {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

`;
