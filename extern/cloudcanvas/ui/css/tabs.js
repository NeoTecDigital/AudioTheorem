/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The UI kit's rules for a tab strip (`../tabs.js`), in the two faces a strip
 * can wear. Data, not code; joined with the other chunks by `../styles.js`,
 * before `./tabs-layers.js`, which draws what stands behind a tab. What is
 * said here is not shipped; the sheet itself carries only a line where a rule
 * needs one.
 *
 * THE LINE FACE is the strip's own, and what every rule here draws unless it
 * names the other: a tab is its label on whatever is behind it, and the tab
 * that is selected is heavier and has a line under it. Nothing is boxed, so a
 * row of them inside a page - a view switcher, the two rows of a menu - reads
 * as a row of words. A label is in the text colour, selected or not: the
 * muted ink would not clear 4.5:1 on the light page.
 *
 * THE FOLDER FACE (`[data-face="folder"]`) is a row of folder tabs, for the
 * strip a host's contexts live in. Every tab is one, with a stack behind it or
 * with none: rounded top corners, a flat foot on the strip's baseline, a
 * hairline edge, and a soft shadow on what is behind it. THE ACTIVE TAB STANDS
 * IN FRONT: as tall as the strip, on the lit face, its foot marked and its
 * label heavier. Every other row is one step back, exactly as a layer is - a
 * step lower and one wash of shade more - and brings its own layers back with
 * it. A row says which it is (`is-active`); with nothing selected, none is in
 * front. A flag that rises out of its tab (`--cc-ui-flag-rise`) stands as high
 * on a tab a step back as on the one in front - what its tab lost, it gains.
 *
 * A FOLDER TAB IS NOT SEEN THROUGH. The kit's surface is translucent, and a
 * translucent tab would tint what it overlaps instead of hiding it. So a face
 * is that surface laid on the page's own colour (`--cc-bg`): the same colour
 * the surface shows over the page, and nothing behind it shows. The two washes
 * every face is made of are named once, on the strip.
 *
 * THE CLOSE CONTROL STANDS INSIDE ITS TAB'S FACE, on either strip. It is a
 * button beside the tab in the page (a button in a tab is invalid ARIA), and
 * the sheet stands it back over the far end of the tab, in room the tab keeps
 * for it (`--tab-close`: a control's height, a whole target under a finger).
 * It has no ground, edge or corner of its own, so it is never a second little
 * tab: the face, and the line under a selected tab, are the tab's from end to
 * end.
 *
 * A LONG LABEL IS CUT with an ellipsis at `--cc-ui-tab-width`, with a badge
 * beside it or without. The label has a box of its own to be cut in, so the
 * tab cuts nothing itself and a flag still stands out of the top of it.
 *
 * WHAT A STRIP CLIPS. It scrolls, so it cuts what is drawn outside it, and a
 * row keeps a stack that opens out to itself: a ring drawn outside a tab would
 * be cut. So a tab wears its ring inside, and so does a tab being moved.
 *
 * A MOVE (`../tabs-reorder.js`). The tab in hand is outlined inside its own
 * face, and the place it would land is a bar at that edge of the row it would
 * stand beside, edged in the page's colour so it is told from any face it lies
 * over. Neither takes room, so nothing shifts under the pointer; a row is the
 * bar's frame only while it carries one.
 */
export const UI_TABS_CSS = `
/* ------------------ UI KIT: TABS ------------------ */

/* A strip that scrolls clips, so it keeps the room a risen flag stands in. */
.cloudcanvas-ui-tabs {
  --tab-close: var(--cc-control-min, 28px);
  --tab-close-back: calc(-1 * var(--tab-close));
  display: flex;
  gap: var(--cc-space-1, 4px);
  padding-top: var(--cc-ui-flag-rise, 0px);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;
}
.cloudcanvas-ui-tabs-item { display: inline-flex; align-items: center; flex: none; overflow-x: clip; scroll-snap-align: start; }
.cloudcanvas-ui-tabs-tab, .cloudcanvas-ui-tabs-close {
  min-height: var(--cc-control-min, 28px);
  font: inherit;
  color: var(--cc-text, #e2e8f0);
  background: transparent;
  border: 0;
  cursor: pointer;
}
/* A tab is one row: its mark, its label, its badge. The label is what gives way. */
.cloudcanvas-ui-tabs-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--cc-space-1, 4px);
  max-width: var(--cc-ui-tab-width, 16rem);
  padding: var(--cc-space-1, 4px) var(--cc-space-3, 12px);
  white-space: nowrap;
  border-bottom: 2px solid transparent;
}
.cloudcanvas-ui-tabs-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* The icon is a mark in the tab's own ink; it never shrinks, so the label is what gives way. A kit icon is as large as the label's text, so it makes no tab taller; a host's own element is as large as the host draws it. */
.cloudcanvas-ui-tabs-icon { display: inline-flex; flex: none; }
.cloudcanvas-ui-tabs-icon > .cloudcanvas-ui-icon { width: 1em; height: 1em; }
.cloudcanvas-ui-tabs-tab > .cloudcanvas-ui-badge { flex: none; }
.cloudcanvas-ui-tabs-tab[aria-selected="true"] { border-bottom-color: var(--cc-accent, #38bdf8); font-weight: var(--cc-weight-semibold, 600); }
.cloudcanvas-ui-tabs-tab:disabled { opacity: 0.5; cursor: not-allowed; }
/* A badge needs the height a tab's padding takes: the label is centred in the whole tab instead, where it already sat. */
.cloudcanvas-ui-tabs-tab.is-badged { padding-top: 0; padding-bottom: 0; }
/* A pinned tab stays put and cannot be closed: a small mark before its label says so, in the label's own colour. */
.cloudcanvas-ui-tabs-tab[data-pinned="true"]::before {
  content: "";
  flex: none;
  width: 0.375em;
  height: 0.375em;
  background: currentColor;
  border-radius: var(--cc-radius-pill, 9999px);
}
/* The close control stands back over the far end of its tab, in the room the tab keeps for it. */
.cloudcanvas-ui-tabs .is-closable > .cloudcanvas-ui-tabs-tab { padding-right: var(--tab-close); }
.cloudcanvas-ui-tabs-close { position: relative; flex: none; align-self: stretch; width: var(--tab-close); margin-left: var(--tab-close-back); padding: 0; }
/* The ring is worn inside: a strip cuts what is drawn outside its tabs. */
.cloudcanvas-ui-tabs-tab:focus-visible {
  outline: var(--cc-focus-ring-width, 2px) solid var(--cc-focus-ring, var(--cc-accent, #38bdf8));
  outline-offset: calc(-1 * var(--cc-focus-ring-width, 2px));
}

/* The folder face: opaque, the tab in front of whatever is behind it in its row. */
.cloudcanvas-ui-tabs[data-face="folder"] {
  --tab-face: linear-gradient(var(--cc-ui-surface, var(--cc-card-bg, rgba(30, 41, 59, 0.85))), var(--cc-ui-surface, var(--cc-card-bg, rgba(30, 41, 59, 0.85))));
  --layer-shade: linear-gradient(var(--cc-ui-tab-layer, var(--cc-scope-bg, rgba(0, 0, 0, 0.2))), var(--cc-ui-tab-layer, var(--cc-scope-bg, rgba(0, 0, 0, 0.2))));
}
.cloudcanvas-ui-tabs[data-face="folder"] .cloudcanvas-ui-tabs-tab {
  position: relative;
  align-self: stretch;
  background-color: var(--cc-bg, #0f1117);
  background-image: var(--tab-face);
  border-top: 1px solid var(--cc-card-border, rgba(255, 255, 255, 0.1));
  border-left: 1px solid var(--cc-card-border, rgba(255, 255, 255, 0.1));
  border-right: 1px solid var(--cc-card-border, rgba(255, 255, 255, 0.1));
  border-radius: var(--cc-radius-sm, 6px) var(--cc-radius-sm, 6px) 0 0;
  box-shadow: var(--cc-ui-tab-layer-shadow, var(--cc-shadow-1, 0 4px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)));
}
/* One step back: a step lower, under one wash of shade. A flag that rises keeps its height. */
.cloudcanvas-ui-tabs[data-face="folder"] .cloudcanvas-ui-tabs-item:not(.is-active) { padding-top: var(--cc-ui-tab-layer-step, 3px); }
.cloudcanvas-ui-tabs[data-face="folder"] .cloudcanvas-ui-tabs-item:not(.is-active) > .cloudcanvas-ui-tabs-tab { background-image: var(--layer-shade), var(--tab-face); }
.cloudcanvas-ui-tabs[data-face="folder"] .cloudcanvas-ui-tabs-item:not(.is-active) .cloudcanvas-ui-badge[data-shape="flag"] {
  transform: translateY(calc(-1 * (var(--cc-ui-flag-rise, 0px) + min(var(--cc-ui-flag-rise, 0px), var(--cc-ui-tab-layer-step, 3px)))));
}

/* A tab in hand, and the bar where it would land. */
.cloudcanvas-ui-tabs.is-drag-active, .cloudcanvas-ui-tabs.is-drag-active button { cursor: grabbing; }
.cloudcanvas-ui-tabs-item.is-dragging > .cloudcanvas-ui-tabs-tab {
  outline: var(--cc-focus-ring-width, 2px) dashed var(--cc-ui-drop, var(--cc-accent, #38bdf8));
  outline-offset: calc(-1 * var(--cc-focus-ring-width, 2px));
}
.cloudcanvas-ui-tabs-item[data-drop] { position: relative; }
.cloudcanvas-ui-tabs-item[data-drop]::after {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  z-index: var(--cc-z-ui-raised, 2);
  width: var(--cc-focus-ring-width, 2px);
  background: var(--cc-ui-drop, var(--cc-accent, #38bdf8));
  outline: 1px solid var(--cc-bg, #0f1117);
}
.cloudcanvas-ui-tabs-item[data-drop="after"]::after { inset: 0 0 0 auto; }

/* Under a finger a tab is 44px tall and its close control 44px wide. */
@media (pointer: coarse) {
  .cloudcanvas-ui-tabs { --tab-close: var(--cc-control-min-coarse, 44px); }
  .cloudcanvas-ui-tabs-tab, .cloudcanvas-ui-tabs-close { min-height: var(--cc-control-min-coarse, 44px); }
}
`;
