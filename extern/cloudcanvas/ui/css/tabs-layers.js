/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The UI kit's rules for a tab's layers (`../tabs-layers.js`): the parent
 * scopes a tab stands in front of, as each face of a strip draws them
 * (`./tabs.js`). Data, not code; joined with the other chunks by
 * `../styles.js`.
 *
 * ON A LINE STRIP a layer is read in line: its label before its tab, whole up
 * to a limit, with a mark after it that points on to the tab - a trail that
 * ends at the tab. Nothing is stacked and nothing is hidden behind anything,
 * so a layer is as readable as the tab. Under the pointer or the keys it is
 * lit as a control is.
 *
 * ON A FOLDER STRIP layers are folder tabs stacked behind their tab.
 * HOW THE STACK IS MADE. A layer's button is its place in the row and its
 * whole target: as tall as the strip, and as wide as the part of the layer
 * that peeks out. What is seen is the button's face, which is free of the row:
 * it runs one corner's width under whatever stands in front of it, starts one
 * step lower for each step back it stands, and takes one more wash of shade.
 * Nothing is given a stacking level at rest - later in the page is nearer the
 * front - so the order rises to the tab without the sheet counting it.
 *
 * A FACE IS NOT SEEN THROUGH, as a folder tab's is not (`./tabs.js`, which
 * names the two washes every face is made of): the surface laid on the page's
 * own colour, under one wash of shade for each step back.
 *
 * BEHIND A TAB THAT IS ITSELF A STEP BACK - every tab but the active one - a
 * layer is one step further back again: its row starts a step lower, and its
 * face takes one wash more than the same layer behind the tab in front.
 */
export const UI_TAB_LAYERS_CSS = `
/* ------------------ UI KIT: TAB LAYERS ------------------ */

.cloudcanvas-ui-tabs-layers { display: inline-flex; align-self: stretch; }
.cloudcanvas-ui-tabs-layer {
  position: relative;
  flex: none;
  box-sizing: border-box;
  min-height: var(--cc-control-min, 28px);
  padding: 0;
  font: inherit;
  font-size: var(--cc-type-sm, 12px);
  color: var(--cc-text, #e2e8f0);
  background: transparent;
  border: 0;
  cursor: pointer;
}
.cloudcanvas-ui-tabs-layer:disabled { opacity: 0.5; cursor: not-allowed; }
/* The face carries the label, and cuts one that is too long for it. */
.cloudcanvas-ui-tabs-layer-face { box-sizing: border-box; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The ring is the face's, inside it: on a folder strip the face is in front of every neighbour by then, and wider than the place it left. */
.cloudcanvas-ui-tabs-layer:focus-visible { outline: none; }
.cloudcanvas-ui-tabs-layer:focus-visible > .cloudcanvas-ui-tabs-layer-face {
  outline: var(--cc-focus-ring-width, 2px) solid var(--cc-focus-ring, var(--cc-accent, #38bdf8));
  outline-offset: calc(-1 * var(--cc-focus-ring-width, 2px));
}
/* The fold's menu is mounted beside the strip and takes no room there. */
.cloudcanvas-ui-tabs-menu { display: contents; }

/* On a line strip: the label in line, then a mark that points on to the tab. */
.cloudcanvas-ui-tabs[data-face="line"] .cloudcanvas-ui-tabs-layer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--cc-space-1, 4px);
  max-width: var(--cc-ui-tab-layer-width, 12rem);
}
.cloudcanvas-ui-tabs[data-face="line"] .cloudcanvas-ui-tabs-layer-face { min-width: 0; padding: var(--cc-space-1, 4px) var(--cc-space-2, 8px); border-radius: var(--cc-radius-sm, 6px); }
.cloudcanvas-ui-tabs[data-face="line"] .cloudcanvas-ui-tabs-layer::after {
  content: "";
  flex: none;
  width: 0.4em;
  height: 0.4em;
  border-top: 1px solid currentColor;
  border-right: 1px solid currentColor;
  transform: rotate(45deg);
}
.cloudcanvas-ui-tabs[data-face="line"] .cloudcanvas-ui-tabs-layer:is(:hover, :focus-visible):not(:disabled) > .cloudcanvas-ui-tabs-layer-face { background: var(--cc-btn-bg-hover, rgba(56, 189, 248, 0.22)); }

/* On a folder strip: a stack. The button is what peeks out; its face is free of the row. */
.cloudcanvas-ui-tabs[data-face="folder"] .cloudcanvas-ui-tabs-layer { width: var(--cc-ui-tab-layer-peek, 4.5rem); }
.cloudcanvas-ui-tabs[data-face="folder"] .cloudcanvas-ui-tabs-layer.is-fold { width: var(--cc-control-min, 28px); }
/* The label starts at the face's near edge, at its top as on a folder's tab, and ends before the corner the face is tucked under. */
.cloudcanvas-ui-tabs[data-face="folder"] .cloudcanvas-ui-tabs-layer-face {
  position: absolute;
  inset: var(--cc-ui-tab-layer-step, 3px) auto 0 0;
  width: max-content;
  min-width: calc(100% + var(--cc-radius-sm, 6px));
  max-width: calc(100% + var(--cc-radius-sm, 6px));
  padding: var(--cc-space-1, 4px) var(--cc-space-3, 12px) 0 var(--cc-space-2, 8px);
  line-height: 1.2;
  text-align: start;
  background-color: var(--cc-bg, #0f1117);
  border: 1px solid var(--cc-card-border, rgba(255, 255, 255, 0.1));
  border-width: 1px 0 0 1px;
  border-radius: var(--cc-radius-sm, 6px) var(--cc-radius-sm, 6px) 0 0;
  box-shadow: var(--cc-ui-tab-layer-shadow, var(--cc-shadow-1, 0 4px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)));
}
.cloudcanvas-ui-tabs[data-face="folder"] .cloudcanvas-ui-tabs-layer.is-fold > .cloudcanvas-ui-tabs-layer-face { padding-right: var(--cc-space-2, 8px); text-align: center; }
/* One step back, one step lower and one wash of shade more over the tab's own face. */
.cloudcanvas-ui-tabs[data-face="folder"] .cloudcanvas-ui-tabs-layer[data-depth="1"] > .cloudcanvas-ui-tabs-layer-face { background-image: var(--layer-shade), var(--tab-face); }
.cloudcanvas-ui-tabs[data-face="folder"] .cloudcanvas-ui-tabs-layer[data-depth="2"] > .cloudcanvas-ui-tabs-layer-face {
  top: calc(2 * var(--cc-ui-tab-layer-step, 3px));
  background-image: var(--layer-shade), var(--layer-shade), var(--tab-face);
}
.cloudcanvas-ui-tabs[data-face="folder"] .cloudcanvas-ui-tabs-layer[data-depth="3"] > .cloudcanvas-ui-tabs-layer-face {
  top: calc(3 * var(--cc-ui-tab-layer-step, 3px));
  background-image: var(--layer-shade), var(--layer-shade), var(--layer-shade), var(--tab-face);
}
/* Behind a tab a step back: one wash more. No heavier than the rules above, so a layer brought forward is still lit. */
.cloudcanvas-ui-tabs[data-face="folder"] :where(.cloudcanvas-ui-tabs-item:not(.is-active)) .cloudcanvas-ui-tabs-layer[data-depth="1"] > .cloudcanvas-ui-tabs-layer-face { background-image: var(--layer-shade), var(--layer-shade), var(--tab-face); }
.cloudcanvas-ui-tabs[data-face="folder"] :where(.cloudcanvas-ui-tabs-item:not(.is-active)) .cloudcanvas-ui-tabs-layer[data-depth="2"] > .cloudcanvas-ui-tabs-layer-face { background-image: var(--layer-shade), var(--layer-shade), var(--layer-shade), var(--tab-face); }
.cloudcanvas-ui-tabs[data-face="folder"] :where(.cloudcanvas-ui-tabs-item:not(.is-active)) .cloudcanvas-ui-tabs-layer[data-depth="3"] > .cloudcanvas-ui-tabs-layer-face {
  background-image: var(--layer-shade), var(--layer-shade), var(--layer-shade), var(--layer-shade), var(--tab-face);
}
/* Under the pointer or the keys a layer comes to the front and opens out to its label, over what stood in front of it:
   whole now, and lit as a control is under the pointer rather than shaded as something behind. */
.cloudcanvas-ui-tabs[data-face="folder"] .cloudcanvas-ui-tabs-layer:is(:hover, :focus-visible):not(:disabled) { z-index: var(--cc-z-ui-raised, 2); }
.cloudcanvas-ui-tabs[data-face="folder"] .cloudcanvas-ui-tabs-layer:is(:hover, :focus-visible):not(:disabled) > .cloudcanvas-ui-tabs-layer-face {
  max-width: var(--cc-ui-tab-layer-width, 12rem);
  background-image: linear-gradient(var(--cc-btn-bg-hover, rgba(56, 189, 248, 0.22)), var(--cc-btn-bg-hover, rgba(56, 189, 248, 0.22))), var(--tab-face);
  border-right-width: 1px;
}

/* A folder layer eases open only for a user who has not asked for less motion. */
@media (prefers-reduced-motion: no-preference) {
  .cloudcanvas-ui-tabs[data-face="folder"] .cloudcanvas-ui-tabs-layer-face { transition: max-width 120ms ease-out; }
}
@media (pointer: coarse) {
  .cloudcanvas-ui-tabs-layer { min-width: var(--cc-control-min-coarse, 44px); min-height: var(--cc-control-min-coarse, 44px); }
}
`;
