/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The graph's rules: the toolbar with its search and the hint under it, the
 * viewport, the three kinds of edge, the node (two lines of title, a meta
 * line, the fold toggle that is its child count, the link handle on its right
 * edge), what a selection and a search dim, what a drag lights, and the
 * minimap. The rules the graph shares with the other views - its tones, its
 * mark while in hand, its node's 44px target under a finger - are in
 * `./views.js`.
 *
 * WHAT A GESTURE DOES IS SAID BEFORE IT IS MADE: the root says which ones the
 * host takes (`data-can-move`, `data-can-link`, `data-can-fold`), so a node
 * that can be moved has the grab cursor, the handle is drawn only when a link
 * can be asked for - on hover, on keyboard focus and on the selection - with
 * the crosshair, and a toggle that folds has its chevron. Under a finger the
 * toggle and the handle are 44px targets on the screen at any zoom
 * (`--graph-k`), as a node is. The handle's reach lies out from the node's
 * right edge, never over the node, and only for a node that is pointed at,
 * focused or selected: the fold pill is the pill's, a node's middle is the node's.
 *
 * THE "MORE" BUTTON of the selected node (`../item-more.js`, `../graph/more.js`)
 * stands at the node's top right corner, and the selected node keeps the room
 * for it at the end of its title: it covers neither the title, the link handle
 * nor the fold toggle. Drawn at the graph's zoom like the node it is on, it
 * has the reach of a whole target on the screen (24px; 44px under a finger),
 * as the toggle and the handle do: what they draw small, they take at full size.
 *
 * Nothing here moves: dimming, emphasis and a spring back are instant, so
 * there is no motion to turn off for a reader who asked for less.
 */

const LINE = 'var(--cc-ui-grid-line, var(--cc-card-border, rgba(255, 255, 255, 0.1)))';
const ACCENT = 'var(--cc-accent, #38bdf8)';
const TARGET = 'max(100%, calc(var(--cc-control-min-coarse, 44px) / var(--graph-k, 1)))';
/** A whole target (24px) on the screen at any zoom, never past what the node can spare (`room`, in world units) so the reach stays out of its neighbours. */
const reach = (room) => `max(100%, min(calc(24px / var(--graph-k, 1)), ${room}))`;

export const UI_GRAPH_CSS = `/* ------------------ UI KIT: GRAPH ------------------ */

.cloudcanvas-ui-graph { display: grid; gap: var(--cc-space-2, 8px); min-width: 0; }
.cloudcanvas-ui-graph-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--cc-space-1, 4px); }
.cloudcanvas-ui-graph-search { flex: 1 1 10rem; min-width: 0; max-width: 20rem; }
.cloudcanvas-ui-graph-hint { margin: 0; font-size: var(--cc-type-xs, 11px); color: var(--cc-text-muted, #94a3b8); }
.cloudcanvas-ui-graph-viewport {
  position: relative;
  height: var(--cc-ui-graph-height, 24rem);
  overflow: hidden;
  touch-action: none;
  background: var(--cc-scope-bg, rgba(0, 0, 0, 0.2));
  border: 1px solid ${LINE};
  border-radius: var(--cc-radius-md, 10px);
  cursor: grab;
}
.cloudcanvas-ui-graph-viewport:is(.is-panning, .is-drag-active) { cursor: grabbing; }
:is(.cloudcanvas-ui-graph-world, .cloudcanvas-ui-graph-edges, .cloudcanvas-ui-graph-nodes) { position: absolute; top: 0; left: 0; transform-origin: 0 0; overflow: visible; }
.cloudcanvas-ui-graph-edges { pointer-events: none; }
.cloudcanvas-ui-graph-overlay { z-index: var(--cc-z-ui-raised, 2); }

.cloudcanvas-ui-graph-edge { fill: none; stroke: var(--cc-connector, rgba(56, 189, 248, 0.6)); stroke-width: 1.5; }
.cloudcanvas-ui-graph-edge.is-related { stroke-dasharray: 6 5; }
.cloudcanvas-ui-graph-edge.is-depends-on { stroke: ${ACCENT}; stroke-width: 2; }
.cloudcanvas-ui-graph-arrow { fill: ${ACCENT}; }
/* A label is a chip on its edge: the surface's colour behind its words, so the line does not run through them. */
.cloudcanvas-ui-graph-edge-label-back { fill: var(--cc-ui-surface, var(--cc-card-bg, rgba(30, 41, 59, 0.85))); stroke: ${LINE}; stroke-width: 1px; }
.cloudcanvas-ui-graph-edge-label-text { fill: var(--cc-text-muted, #94a3b8); font-size: var(--cc-type-xs, 11px); }
.cloudcanvas-ui-graph-draft { fill: none; stroke: ${ACCENT}; stroke-width: 2; stroke-dasharray: 4 4; }

.cloudcanvas-ui-graph-node {
  position: absolute;
  top: var(--graph-y);
  left: var(--graph-x);
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto auto;
  align-content: space-between;
  padding: var(--cc-space-1, 4px) var(--cc-space-2, 8px);
  font: inherit;
  font-size: var(--cc-type-md, 13px);
  line-height: 1.3;
  text-align: left;
  color: var(--cc-text, #e2e8f0);
  background: var(--cc-card-bg, rgba(30, 41, 59, 0.85));
  border: 1px solid var(--cc-card-border, rgba(255, 255, 255, 0.1));
  border-left: 4px solid ${ACCENT};
  border-radius: var(--cc-radius-md, 10px);
  box-shadow: var(--cc-shadow-1, 0 4px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06));
  cursor: pointer;
  user-select: none;
}
.cloudcanvas-ui-graph[data-can-move] .cloudcanvas-ui-graph-node { cursor: grab; }
/* Two lines of the title, then an ellipsis: the node's tooltip and name hold the rest. */
.cloudcanvas-ui-graph-node-label {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-weight: var(--cc-weight-medium, 500);
}
.cloudcanvas-ui-graph-node-meta { display: flex; align-items: center; gap: var(--cc-space-1, 4px); min-width: 0; font-size: var(--cc-type-xs, 11px); color: var(--cc-text-muted, #94a3b8); }
.cloudcanvas-ui-graph-status {
  flex: none;
  max-width: 50%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  padding: 0 var(--cc-space-1, 4px);
  color: var(--cc-text, #e2e8f0);
  background: var(--cc-btn-bg, rgba(56, 189, 248, 0.12));
  border-radius: var(--cc-radius-pill, 9999px);
}
.cloudcanvas-ui-graph-time { flex: 0 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.cloudcanvas-ui-graph-toggle {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  padding: 0 var(--cc-space-1, 4px);
  font-variant-numeric: tabular-nums;
  border: 1px solid var(--cc-card-border, rgba(255, 255, 255, 0.1));
  border-radius: var(--cc-radius-pill, 9999px);
}
/* A toggle that folds wears a chevron after its count: right to open what is folded, left to fold it back. */
.cloudcanvas-ui-graph[data-can-fold] .cloudcanvas-ui-graph-toggle { cursor: pointer; }
.cloudcanvas-ui-graph[data-can-fold] .cloudcanvas-ui-graph-toggle::before {
  content: "";
  order: 1;
  width: 0.35em;
  height: 0.35em;
  border-top: 1px solid currentColor;
  border-right: 1px solid currentColor;
  rotate: -135deg;
}
.cloudcanvas-ui-graph[data-can-fold] .cloudcanvas-ui-graph-node[aria-expanded="false"] .cloudcanvas-ui-graph-toggle::before { rotate: 45deg; }
.cloudcanvas-ui-graph-node[aria-expanded="false"] .cloudcanvas-ui-graph-toggle { color: var(--cc-ui-on-accent, #0f172a); background: ${ACCENT}; border-color: ${ACCENT}; }
.cloudcanvas-ui-graph-handle {
  position: absolute;
  top: 50%;
  right: 0;
  display: none;
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  translate: 50% -50%;
  background: var(--cc-card-bg, rgba(30, 41, 59, 0.85));
  border: 2px solid ${ACCENT};
  border-radius: var(--cc-radius-pill, 9999px);
  opacity: 0;
  cursor: crosshair;
}
.cloudcanvas-ui-graph[data-can-link] .cloudcanvas-ui-graph-handle { display: block; }
.cloudcanvas-ui-graph-node:is(:hover, :focus-visible, .is-selected) .cloudcanvas-ui-graph-handle { opacity: 1; }
/* A mouse gets a whole target of what is drawn small: the fold toggle (24x16) and the link handle (12) reach 24px on the screen, kept within the node's own room - 30 world units tall, so a map at the first view's least scale, 0.8, still has them whole. The reach of the handle starts at its own edge and runs out from the node. */
:where(.cloudcanvas-ui-graph[data-can-fold]) .cloudcanvas-ui-graph-toggle::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: ${reach('40px')};
  height: ${reach('30px')};
  translate: -50% -50%;
}
.cloudcanvas-ui-graph-handle::after {
  content: "";
  position: absolute;
  top: 50%;
  left: -2px;
  width: ${reach('40px')};
  height: ${reach('30px')};
  translate: 0 -50%;
}

/* The "more" button of the selected node: its top right corner, the title keeping its room. Its reach is its own. */
.cloudcanvas-ui-graph-more { top: 3px; right: 3px; }
.cloudcanvas-ui-graph-more::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: ${reach('36px')};
  height: ${reach('36px')};
  translate: -50% -50%;
}
/* Drawn at the graph's zoom it would shrink to a dot on a map zoomed out to the 0.5 a big one opens at: it holds 16px on the screen, up to 36 of the graph's own units. */
.cloudcanvas-ui-graph-node { --item-more-size: min(max(1.5rem, calc(16px / var(--graph-k, 1))), 2.25rem); --item-more-room: calc(var(--item-more-size) + 4px); }
.cloudcanvas-ui-graph[data-can-menu] .cloudcanvas-ui-graph-node.is-selected .cloudcanvas-ui-graph-node-label { padding-right: var(--item-more-room); }

.cloudcanvas-ui-graph-node.is-selected {
  box-shadow: var(--cc-ui-selected-ring, inset 0 0 0 2px ${ACCENT}), var(--cc-shadow-1, 0 4px 16px rgba(0, 0, 0, 0.4));
}
.cloudcanvas-ui-graph-node.is-path { border-color: ${ACCENT}; }
:is(.cloudcanvas-ui-graph-node, .cloudcanvas-ui-graph-edge, .cloudcanvas-ui-graph-edge-label).is-dim, .cloudcanvas-ui-graph-node.is-unmatched { opacity: 0.4; }
.cloudcanvas-ui-graph-node.is-drop-target { outline: 2px dashed var(--cc-ui-drop, ${ACCENT}); outline-offset: 3px; }
.cloudcanvas-ui-graph-node.is-dragging {
  z-index: var(--cc-z-ui-raised, 2);
  pointer-events: none;
  opacity: 0.85;
  box-shadow: var(--cc-shadow-2, 0 12px 32px rgba(0, 0, 0, 0.55));
}

.cloudcanvas-ui-graph-minimap {
  position: absolute;
  right: var(--cc-space-2, 8px);
  bottom: var(--cc-space-2, 8px);
  z-index: var(--cc-z-ui-raised, 2);
  width: 10rem;
  height: 6.25rem;
  overflow: hidden;
  background: var(--cc-ui-surface, var(--cc-card-bg, rgba(30, 41, 59, 0.85)));
  border: 1px solid ${LINE};
  border-radius: var(--cc-radius-sm, 6px);
  box-shadow: var(--cc-shadow-1, 0 4px 16px rgba(0, 0, 0, 0.4));
  touch-action: none;
  cursor: pointer;
}
.cloudcanvas-ui-graph-minimap-picture { display: block; width: 100%; height: 100%; }
.cloudcanvas-ui-graph-minimap-node { fill: var(--cc-text-muted, #94a3b8); fill-opacity: 0.6; }
.cloudcanvas-ui-graph-minimap-node.is-selected { fill: ${ACCENT}; fill-opacity: 1; }
.cloudcanvas-ui-graph-minimap-view { fill: var(--cc-btn-bg, rgba(56, 189, 248, 0.12)); stroke: ${ACCENT}; stroke-width: 2; vector-effect: non-scaling-stroke; }

@media (max-width: 40rem) {
  .cloudcanvas-ui-graph-minimap { width: 6.5rem; height: 4.25rem; }
}
@media (pointer: coarse) {
  /* The toggle and the handle are drawn small, at the graph's zoom: a finger gets 44px of each on the screen. */
  :is(.cloudcanvas-ui-graph-toggle, .cloudcanvas-ui-graph-handle)::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: ${TARGET};
    height: ${TARGET};
    translate: -50% -50%;
  }
  /* The handle's reach starts at the node's right edge and runs out from it, never over the node: the pill is the pill's, a node's middle is the node's. It is there for the node that is pointed at, focused or selected, as the handle is drawn. */
  .cloudcanvas-ui-graph-handle { pointer-events: none; }
  .cloudcanvas-ui-graph-node:is(:hover, :focus-visible, .is-selected) .cloudcanvas-ui-graph-handle { pointer-events: auto; }
  .cloudcanvas-ui-graph-handle::after { left: 7px; translate: 0 -50%; }
  /* The button is drawn at 24px and reaches a finger's 44px, which the room at a node's corner allows. */
  .cloudcanvas-ui-graph-more::after { width: max(100%, min(calc(var(--cc-control-min-coarse, 44px) / var(--graph-k, 1)), 52px)); height: max(100%, min(calc(var(--cc-control-min-coarse, 44px) / var(--graph-k, 1)), 52px)); }
  .cloudcanvas-ui-graph-node { --item-more-room: calc(var(--item-more-size) + 14px); }
}
`;
