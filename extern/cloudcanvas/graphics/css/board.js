/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The board's CSS chunk: what a root and its blits look like before any author
 * CSS. Injected once by `createBoard` (`.addons/sandbox/board.js`) and by
 * `cloudcanvas/defaults`; keyed on the core's markers only.
 *
 * The root is the canvas: its surface, its type, and no text selection - a drag
 * that selected page text would leave a selection behind, and the next press on
 * it would start a native drag whose `pointercancel` cuts the gesture short.
 * Selectable text opts back in (`[data-selectable-text]`, the display widgets'
 * chunk). Every blit gets the hover and focus transitions and the keyboard ring;
 * a moving one (`cc-moving`, the motion add-on) promises the compositor a layer.
 */

/** The root surface, the blits' defaults, and their reduced-motion override. */
export const BOARD_CSS = `/* ------------------ BOARD ------------------ */

[data-blit-root] {
  background-color: var(--cc-bg, #0f1117);
  background-image: radial-gradient(
    circle at var(--cc-grid-dot-size, 1px) var(--cc-grid-dot-size, 1px),
    var(--cc-grid-dot, rgba(255, 255, 255, 0.12)) var(--cc-grid-dot-size, 1px),
    transparent 0
  );
  background-size: var(--cc-grid-size, 24px) var(--cc-grid-size, 24px);
  color: var(--cc-text, #e2e8f0);
  font-family: var(--cc-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
  font-size: var(--cc-type-md, 13px);
  user-select: none;
  -webkit-user-select: none;
}

[data-blit-root] [data-blit] {
  transition: box-shadow 0.15s ease, border-color 0.15s ease, opacity 0.2s ease;
}

/* The root is one tab stop and its blits are roving targets (the keyboard
   add-on); both show the same ring, and only for keyboard focus. */
[data-blit-root]:focus-visible,
[data-blit-root] [data-blit]:focus-visible {
  outline: var(--cc-focus-ring-width, 2px) solid var(--cc-focus-ring, var(--cc-accent, #38bdf8));
  outline-offset: var(--cc-focus-ring-offset, 2px);
}

/* A compositor hint is a promise to keep a layer alive: made only while a blit
   actually moves, so a board of still blits costs no layers. */
[data-blit].cc-moving {
  will-change: transform;
}

@media (prefers-reduced-motion: reduce) {
  [data-blit-root] [data-blit] {
    transition: none;
  }
}

`;
