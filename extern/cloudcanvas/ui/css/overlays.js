/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The UI kit's overlay rules: what stands in the dialog a confirmation draws, and the popover. Data, not code;
 * joined with the other chunks by `../styles.js`. Nothing in it moves.
 */
export const UI_OVERLAYS_CSS = `
/* ------------------ UI KIT: OVERLAYS ------------------ */

.cloudcanvas-ui-confirm-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--cc-space-2, 8px); }

/* A popover stands in the viewport, sized by its content and held by the screen's width: placed by the control, so no ancestor clips it. */
.cloudcanvas-ui-popover {
  position: fixed;
  z-index: var(--cc-z-ui-popover, 1375);
  box-sizing: border-box;
  width: max-content;
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--cc-space-3, 12px);
  font-family: var(--cc-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
  color: var(--cc-text, #e2e8f0);
  background: var(--cc-ui-surface, var(--cc-card-bg, rgba(30, 41, 59, 0.85)));
  border: 1px solid var(--cc-card-border, rgba(255, 255, 255, 0.1));
  border-radius: var(--cc-radius-md, 10px);
  box-shadow: var(--cc-shadow-2, 0 12px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.09));
}
/* The popover clips what is drawn outside it, so it wears its ring inside. */
.cloudcanvas-ui-popover:focus-visible {
  outline: var(--cc-focus-ring-width, 2px) solid var(--cc-focus-ring, var(--cc-accent, #38bdf8));
  outline-offset: calc(-1 * var(--cc-focus-ring-width, 2px));
}
`;
