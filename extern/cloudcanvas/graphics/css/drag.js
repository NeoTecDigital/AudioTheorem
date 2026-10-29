/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The drag add-on's CSS chunk (`../../addons/drag.js`), injected once when the
 * trait first starts: the grab cursor, the dragging blit's stacking, and the
 * grip a blit is dragged by when its whole face is a control.
 *
 * The cursors are `:where()`, so any author rule - a preview mode that wants the
 * default arrow, a control's own pointer - outranks them. The grip is a direct
 * child of the blit, so it rides the blit's transform and a content render
 * never removes it; it is deliberately not `data-cc-control`, since starting a
 * drag is its whole purpose. It is always there and CSS decides when it shows:
 * on a selected chromeless blit (`data-chrome="false"`), or on any selected
 * blit when the trait asked for one (`data-cc-grab="always"`, `{handle: true}`).
 * A `chrome` write shows or hides it without restarting the trait. `translate`
 * straddles the top-left corner, so the grip sits over the boundary rather than
 * inside the control's hit area, and stacks over the resize handle that shares
 * the corner. The whole background lives in one token's fallback, so a theme
 * replaces the entire look with `--cc-grab-handle-bg`.
 */

/** The grab cursor, the dragging blit, and the grip. */
export const DRAG_CSS = `/* ------------------ DRAG ------------------ */

:where([data-blit][data-drag]) {
  cursor: grab;
}

:where([data-blit][data-drag]:active, [data-blit].is-dragging) {
  cursor: grabbing;
}

/* A dragged blit clears its neighbours; a scope's children stay inside its well. */
[data-blit].is-dragging {
  z-index: var(--cc-z-drag, 1100);
}

.cloudcanvas-grab-handle {
  display: none;
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  width: var(--cc-grab-handle-size, 12px);
  height: var(--cc-grab-handle-size, 12px);
  transform: translate(-50%, -50%);
  border-radius: var(--cc-radius-sm, 6px);
  background: var(--cc-grab-handle-bg, radial-gradient(var(--cc-grab-handle-dot, rgba(255, 255, 255, 0.7)) 0.75px, transparent 1px) 0 0 / 4px 4px, var(--cc-grab-handle-fill, rgba(30, 41, 59, 0.92)));
  box-shadow: var(--cc-grab-handle-ring, 0 0 0 1px rgba(8, 10, 16, 0.65));
  cursor: grab;
  z-index: var(--cc-z-grab, 1101);
  touch-action: none;
}

:where([data-blit][data-chrome="false"].is-selected) > .cloudcanvas-grab-handle,
:where([data-blit].is-selected) > .cloudcanvas-grab-handle:where([data-cc-grab="always"]) {
  display: block;
}

.cloudcanvas-grab-handle:active {
  cursor: grabbing;
}

/* A coarse pointer gets a target it can actually hit. */
@media (pointer: coarse) {
  .cloudcanvas-grab-handle {
    width: var(--cc-grab-handle-size-coarse, 20px);
    height: var(--cc-grab-handle-size-coarse, 20px);
  }
}

`;
