/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The menu add-on's CSS chunk (`../../addons/menu.js`), injected once when the add-on installs.
 */

/** The context menu: panel, groups and items. */
export const MENU_CSS = `/* ------------------ CONTEXT MENU ------------------ */

/* The root's own right-click menu (the menu add-on). It lives in the root's
   overlay - the one layer that draws in screen space - which is why it is
   positioned from the click's host-relative coordinates and needs its pointer
   events back: the overlay itself is inert.
   Every value chains through a part token to a foundation one, so a theme that
   restyles cards restyles the menu with them and nothing new has to be named. */
.cloudcanvas-context-menu {
  position: absolute;
  min-width: var(--cc-menu-min-width, 168px);
  padding: var(--cc-space-1, 4px);
  background: var(--cc-menu-bg, var(--cc-card-bg, rgba(30, 41, 59, 0.85)));
  border: 1px solid var(--cc-menu-border, var(--cc-card-border, rgba(255, 255, 255, 0.1)));
  border-radius: var(--cc-radius-md, 10px);
  box-shadow: var(--cc-shadow-2, 0 12px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.09));
  backdrop-filter: blur(var(--cc-card-blur, 12px));
  -webkit-backdrop-filter: blur(var(--cc-card-blur, 12px));
  font-size: var(--cc-type-md, 13px);
  color: var(--cc-text, #e2e8f0);
  pointer-events: auto;
  user-select: none;
  z-index: var(--cc-z-menu, 1200);
}

/* Closed is the resting state, and the attribute has to outrank the display
   above - which it does on specificity alone, so no \`!important\` is needed. */
.cloudcanvas-context-menu[hidden] {
  display: none;
}

/* Groups are the only structure: consecutive ones are told apart by a rule
   rather than a separator element nobody can label. */
.cloudcanvas-context-menu-group + .cloudcanvas-context-menu-group {
  margin-top: var(--cc-space-1, 4px);
  padding-top: var(--cc-space-1, 4px);
  border-top: 1px solid var(--cc-menu-border, var(--cc-card-border, rgba(255, 255, 255, 0.1)));
}

.cloudcanvas-context-menu-item {
  display: block;
  width: 100%;
  min-height: var(--cc-control-min, 28px);
  padding: var(--cc-space-1, 4px) var(--cc-space-3, 12px);
  background: var(--cc-menu-item-bg, transparent);
  border: 0;
  border-radius: var(--cc-radius-sm, 6px);
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.cloudcanvas-context-menu-item:hover,
.cloudcanvas-context-menu-item:focus-visible {
  background: var(--cc-menu-item-bg-hover, var(--cc-btn-bg-hover, rgba(56, 189, 248, 0.22)));
}

@media (pointer: coarse) {
  .cloudcanvas-context-menu-item {
    min-height: var(--cc-control-min-coarse, 44px);
  }
}

`;
