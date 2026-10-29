/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The UI kit's menu rules: the panels the control places in the viewport, and
 * the items in them. Data, not code; joined with the other chunks by
 * `../styles.js`. The surface is the kit's own (`--cc-ui-surface`, as a dialog
 * and a toast have it), so a theme that moves the cards moves the menu; its
 * font and its text colour are the ones `./controls.js` gives every kit root.
 * Nothing here moves: a menu is there or it is not. It is the top floating
 * layer of the kit: over a context window, a toast or a dialog it was opened
 * above, none of which may cover what it offers.
 */
export const UI_MENU_CSS = `
/* ------------------ UI KIT: MENU ------------------ */

/* The menu's own box draws nothing and takes no room where it is mounted: the control places its panels in the viewport. */
.cloudcanvas-ui-menu { display: contents; }
.cloudcanvas-ui-menu-panel {
  position: fixed;
  z-index: var(--cc-z-ui-menu, 1400);
  box-sizing: border-box;
  display: grid;
  min-width: var(--cc-menu-min-width, 168px);
  overflow: auto;
  padding: var(--cc-space-1, 4px);
  font-size: var(--cc-type-md, 13px);
  background: var(--cc-ui-surface, var(--cc-card-bg, rgba(30, 41, 59, 0.85)));
  border: 1px solid var(--cc-card-border, rgba(255, 255, 255, 0.1));
  border-radius: var(--cc-radius-md, 10px);
  box-shadow: var(--cc-shadow-2, 0 12px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.09));
  backdrop-filter: blur(var(--cc-card-blur, 12px));
}
.cloudcanvas-ui-menu-item {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cc-space-3, 12px);
  min-width: 0;
  min-height: var(--cc-control-min, 28px);
  padding: var(--cc-space-1, 4px) var(--cc-space-3, 12px);
  font: inherit;
  text-align: start;
  white-space: nowrap;
  color: inherit;
  background: transparent;
  border: 0;
  border-left: 3px solid transparent;
  border-radius: var(--cc-radius-sm, 6px);
  cursor: pointer;
}
.cloudcanvas-ui-menu-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.cloudcanvas-ui-menu-icon { display: inline-flex; flex: none; }
/* One highlight: the pointer moves focus, so the item under it and the item the keys are on are the same item. An open submenu's item keeps it. */
.cloudcanvas-ui-menu-item:is(:hover, :focus, [aria-expanded="true"]):not(:disabled) { background: var(--cc-ui-selected, var(--cc-btn-bg-hover, rgba(56, 189, 248, 0.22))); }
.cloudcanvas-ui-menu-item:disabled { opacity: 0.5; cursor: not-allowed; }
/* The panel clips what is drawn outside it, so an item - and a menu with nothing to choose - wears the ring inside. */
:is(.cloudcanvas-ui-menu-item, .cloudcanvas-ui-menu-panel):focus-visible {
  outline: var(--cc-focus-ring-width, 2px) solid var(--cc-focus-ring, var(--cc-accent, #38bdf8));
  outline-offset: calc(-1 * var(--cc-focus-ring-width, 2px));
}
/* A dangerous item wears its tone as text. Under the highlight that tone loses its contrast: there the label is text again, and the edge carries the tone. */
.cloudcanvas-ui-menu-item[data-tone="danger"] { color: var(--cc-tone-danger, #f87171); }
.cloudcanvas-ui-menu-item[data-tone="danger"]:is(:hover, :focus):not(:disabled) { color: inherit; border-left-color: var(--cc-tone-danger, #f87171); }
.cloudcanvas-ui-menu-item[aria-haspopup="menu"]::after {
  content: "";
  flex: none;
  width: 0.4em;
  height: 0.4em;
  border-top: 1px solid currentColor;
  border-right: 1px solid currentColor;
  transform: rotate(45deg);
}
.cloudcanvas-ui-menu-separator { height: 1px; margin: var(--cc-space-1, 4px) 0; background: var(--cc-card-border, rgba(255, 255, 255, 0.1)); }

@media (pointer: coarse) {
  .cloudcanvas-ui-menu-item { min-height: var(--cc-control-min-coarse, 44px); }
}
`;
