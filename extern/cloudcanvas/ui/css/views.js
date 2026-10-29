/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The UI kit's view rules: kanban and calendar, what the graph and the
 * timeline share with them (their own rules are `./graph.js` and
 * `./timeline.js`), and the tones they share
 * with the chips and the tree: a tone colours the leading edge, the meaning
 * tones (success, warning, danger) and the eight category tones alike.
 * Geometry that changes per element arrives as inline custom properties
 * written through the CSSOM (`--calendar-top`, `--timeline-x`, `--graph-x`,
 * ...); every size a theme may want is a `--cc-ui-*` token with its default in
 * the fallback.
 *
 * SELECTED is a ring inside the item (`--cc-ui-selected-ring`): no scrolling
 * parent cuts it, and the focus ring and the mark of a move - outlines, drawn
 * outside - stand clear of it, so an item can be selected, focused and in hand
 * at once and say all three.
 *
 * A HEADING THAT STANDS FOR AN ITEM (a kanban column's, a timeline group's) is
 * a button in the heading's own type, in the text colour, with the ring every
 * item wears.
 *
 * UNDER A FINGER a chip, a milestone and a node are 44px targets, though drawn
 * smaller. The target is the item's own `::after`, reaching out from the
 * item; it lies under every item drawn in the same day, lane, row or graph (a
 * level below them, inside a container that keeps its own stacking), so a
 * press on something drawn is never taken by a neighbour's reach. A milestone
 * and a node reach out from their middle. Chips stand one under another, so a
 * chip reaches down from its own top: the room between two is the upper
 * one's, and nothing reaches up over what is above. Where chips are stacked
 * in one day only the last has the whole 44px; the others have their own
 * height and the room to the next - there is no more room than that. A graph
 * is drawn at its zoom (`--graph-k`, written by the control): a node's target
 * is 44px on the screen. A node is placed by `left` and `top`: a transform
 * would make it a stacking context, and its reach could not lie under the
 * node drawn before it. A dimmed node is one (opacity), so it has no reach
 * beyond what is drawn. A timeline row, the all-day strip and a day of the
 * month are tall enough for one whole target. Under a fine pointer none of
 * this exists.
 *
 * WHAT CUTS ITS OWN TEXT cannot have a target that reaches past it. So a
 * graph node's label is cut in a box of its own, on any pointer, and under a
 * finger a chip leaves the cutting to its time and its title.
 *
 * THE "MORE" BUTTON (`../item-more.js`) is the one control the three views
 * share: a small round button, the kit's ellipsis, on the selected item. Each
 * view's sheet places it and keeps the room for it; this one says what it looks
 * like and how big it is (`--item-more-size`: 24px, a whole target under a
 * finger where the view has room for one - the graph keeps the size and widens
 * the reach).
 */

const FONT = 'var(--cc-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif)';
const LINE = 'var(--cc-ui-grid-line, var(--cc-card-border, rgba(255, 255, 255, 0.1)))';

export const UI_VIEWS_CSS = `/* ------------------ UI KIT: VIEWS ------------------ */

.cloudcanvas-ui-kanban, .cloudcanvas-ui-calendar, .cloudcanvas-ui-timeline, .cloudcanvas-ui-graph {
  font-family: ${FONT};
  color: var(--cc-text, #e2e8f0);
}
:is(.cloudcanvas-ui-calendar, .cloudcanvas-ui-timeline, .cloudcanvas-ui-graph) { --item-more-size: 1.5rem; --item-more-room: calc(var(--item-more-size) + 6px); }
.cloudcanvas-ui-item-more {
  position: absolute;
  z-index: var(--cc-z-ui-raised, 2);
  box-sizing: border-box;
  display: grid;
  place-items: center;
  width: var(--item-more-size);
  height: var(--item-more-size);
  padding: 0;
  font: inherit;
  color: var(--cc-text, #e2e8f0);
  background: var(--cc-ui-surface, var(--cc-card-bg, rgba(30, 41, 59, 0.85)));
  border: 1px solid ${LINE};
  border-radius: var(--cc-radius-pill, 9999px);
  cursor: pointer;
}
.cloudcanvas-ui-item-more > .cloudcanvas-ui-icon { width: 1rem; height: 1rem; }
.cloudcanvas-ui-item-more:is(:hover, :focus-visible) { background: var(--cc-btn-bg-hover, rgba(56, 189, 248, 0.22)); }
.cloudcanvas-ui-item-more:focus-visible { outline: var(--cc-focus-ring-width, 2px) solid var(--cc-focus-ring, var(--cc-accent, #38bdf8)); outline-offset: var(--cc-focus-ring-offset, 2px); }
:is(.cloudcanvas-ui-kanban-card, .cloudcanvas-ui-calendar-event, .cloudcanvas-ui-timeline-bar, .cloudcanvas-ui-graph-node)[data-tone="success"] { border-left-color: var(--cc-tone-success, #22c55e); }
:is(.cloudcanvas-ui-kanban-card, .cloudcanvas-ui-calendar-event, .cloudcanvas-ui-timeline-bar, .cloudcanvas-ui-graph-node)[data-tone="warning"] { border-left-color: var(--cc-tone-warning, #eab308); }
:is(.cloudcanvas-ui-kanban-card, .cloudcanvas-ui-calendar-event, .cloudcanvas-ui-timeline-bar, .cloudcanvas-ui-graph-node)[data-tone="danger"] { border-left-color: var(--cc-tone-danger, #f87171); }
/* Category tones one to eight: the host's own palette, on the same edge. */
:is(.cloudcanvas-ui-kanban-card, .cloudcanvas-ui-calendar-event, .cloudcanvas-ui-timeline-bar, .cloudcanvas-ui-chips-chip, .cloudcanvas-ui-tree-row)[data-tone="1"] { border-left-color: var(--cc-ui-tone-1, #60a5fa); }
:is(.cloudcanvas-ui-kanban-card, .cloudcanvas-ui-calendar-event, .cloudcanvas-ui-timeline-bar, .cloudcanvas-ui-chips-chip, .cloudcanvas-ui-tree-row)[data-tone="2"] { border-left-color: var(--cc-ui-tone-2, #a78bfa); }
:is(.cloudcanvas-ui-kanban-card, .cloudcanvas-ui-calendar-event, .cloudcanvas-ui-timeline-bar, .cloudcanvas-ui-chips-chip, .cloudcanvas-ui-tree-row)[data-tone="3"] { border-left-color: var(--cc-ui-tone-3, #f472b6); }
:is(.cloudcanvas-ui-kanban-card, .cloudcanvas-ui-calendar-event, .cloudcanvas-ui-timeline-bar, .cloudcanvas-ui-chips-chip, .cloudcanvas-ui-tree-row)[data-tone="4"] { border-left-color: var(--cc-ui-tone-4, #fb923c); }
:is(.cloudcanvas-ui-kanban-card, .cloudcanvas-ui-calendar-event, .cloudcanvas-ui-timeline-bar, .cloudcanvas-ui-chips-chip, .cloudcanvas-ui-tree-row)[data-tone="5"] { border-left-color: var(--cc-ui-tone-5, #facc15); }
:is(.cloudcanvas-ui-kanban-card, .cloudcanvas-ui-calendar-event, .cloudcanvas-ui-timeline-bar, .cloudcanvas-ui-chips-chip, .cloudcanvas-ui-tree-row)[data-tone="6"] { border-left-color: var(--cc-ui-tone-6, #4ade80); }
:is(.cloudcanvas-ui-kanban-card, .cloudcanvas-ui-calendar-event, .cloudcanvas-ui-timeline-bar, .cloudcanvas-ui-chips-chip, .cloudcanvas-ui-tree-row)[data-tone="7"] { border-left-color: var(--cc-ui-tone-7, #2dd4bf); }
:is(.cloudcanvas-ui-kanban-card, .cloudcanvas-ui-calendar-event, .cloudcanvas-ui-timeline-bar, .cloudcanvas-ui-chips-chip, .cloudcanvas-ui-tree-row)[data-tone="8"] { border-left-color: var(--cc-ui-tone-8, #94a3b8); }
:is(.cloudcanvas-ui-kanban-item, .cloudcanvas-ui-calendar-event, .cloudcanvas-ui-timeline-bar, .cloudcanvas-ui-graph-node).is-grabbed,
.cloudcanvas-ui-kanban-item.is-grabbed .cloudcanvas-ui-kanban-card {
  outline: 2px dashed var(--cc-ui-drop, var(--cc-accent, #38bdf8));
  outline-offset: 2px;
}
/* Selected: a ring inside the item. */
:is(.cloudcanvas-ui-kanban-card, .cloudcanvas-ui-kanban-label[data-ui-id], .cloudcanvas-ui-calendar-event, .cloudcanvas-ui-timeline-bar, .cloudcanvas-ui-timeline-group-label).is-selected {
  box-shadow: var(--cc-ui-selected-ring, inset 0 0 0 2px var(--cc-accent, #38bdf8));
}
/* A heading that stands for an item: a button that reads as the heading it is. */
:is(.cloudcanvas-ui-kanban-label[data-ui-id], .cloudcanvas-ui-timeline-group-label) {
  padding: 0 var(--cc-space-1, 4px);
  font: inherit;
  text-align: start;
  color: var(--cc-text, #e2e8f0);
  background: transparent;
  border: 0;
  border-radius: var(--cc-radius-sm, 6px);
  cursor: pointer;
}

/* Kanban */
.cloudcanvas-ui-kanban-lane {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(15rem, 1fr);
  gap: var(--cc-space-3, 12px);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  isolation: isolate;
}
.cloudcanvas-ui-kanban-column {
  display: flex;
  flex-direction: column;
  min-height: 8rem;
  padding: var(--cc-space-2, 8px);
  background: var(--cc-scope-bg, rgba(0, 0, 0, 0.2));
  border: 1px solid ${LINE};
  border-radius: var(--cc-radius-md, 10px);
  scroll-snap-align: start;
}
.cloudcanvas-ui-kanban-column.is-drop-target { outline: 2px dashed var(--cc-ui-drop, var(--cc-accent, #38bdf8)); }
.cloudcanvas-ui-kanban-column.is-refused { outline: 2px dashed var(--cc-tone-danger, #f87171); }
.cloudcanvas-ui-kanban-heading {
  display: flex;
  justify-content: space-between;
  margin: 0 0 var(--cc-space-2, 8px);
  font-size: var(--cc-type-sm, 12px);
  font-weight: var(--cc-weight-semibold, 600);
}
.cloudcanvas-ui-kanban-count { color: var(--cc-text-muted, #94a3b8); }
.cloudcanvas-ui-kanban-cards { flex: 1; display: grid; align-content: start; gap: var(--cc-space-2, 8px); margin: 0; padding: 0; list-style: none; }
.cloudcanvas-ui-kanban-item.is-dragging { position: relative; z-index: var(--cc-z-ui-raised, 2); pointer-events: none; opacity: 0.85; }
.cloudcanvas-ui-kanban-card {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: var(--cc-space-2, 8px) var(--cc-space-3, 12px);
  font: inherit;
  text-align: left;
  color: var(--cc-text, #e2e8f0);
  background: var(--cc-card-bg, rgba(30, 41, 59, 0.85));
  border: 1px solid var(--cc-card-border, rgba(255, 255, 255, 0.1));
  border-left: 4px solid var(--cc-accent, #38bdf8);
  border-radius: var(--cc-radius-sm, 6px);
  cursor: grab;
  touch-action: manipulation;
}
.cloudcanvas-ui-kanban-title { font-weight: var(--cc-weight-medium, 500); }
.cloudcanvas-ui-kanban-detail, .cloudcanvas-ui-kanban-meta { font-size: var(--cc-type-sm, 12px); color: var(--cc-text-muted, #94a3b8); }

/* Calendar */
.cloudcanvas-ui-calendar { display: grid; gap: var(--cc-space-2, 8px); }
.cloudcanvas-ui-calendar-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--cc-space-2, 8px); }
.cloudcanvas-ui-calendar-nav, .cloudcanvas-ui-calendar-views { display: flex; gap: var(--cc-space-1, 4px); }
.cloudcanvas-ui-calendar-title { flex: 1 1 10rem; margin: 0; font-size: var(--cc-type-lg, 15px); font-weight: var(--cc-weight-semibold, 600); }
:is(.cloudcanvas-ui-calendar-view, .cloudcanvas-ui-timeline-scale)[aria-pressed="true"] { color: var(--cc-ui-on-accent, #0f172a); background: var(--cc-accent, #38bdf8); }
:is(.cloudcanvas-ui-calendar-month, .cloudcanvas-ui-calendar-time) { border: 1px solid ${LINE}; border-radius: var(--cc-radius-md, 10px); overflow: hidden; }
:is(.cloudcanvas-ui-calendar-weekdays, .cloudcanvas-ui-calendar-week) { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.cloudcanvas-ui-calendar-weekday { padding: var(--cc-space-1, 4px); font-size: var(--cc-type-xs, 11px); text-align: center; color: var(--cc-text-muted, #94a3b8); }
.cloudcanvas-ui-calendar-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  min-height: 5.5rem;
  padding: var(--cc-space-1, 4px);
  border-top: 1px solid ${LINE};
  border-left: 1px solid ${LINE};
  cursor: pointer;
}
.cloudcanvas-ui-calendar-cell:first-child { border-left: 0; }
.cloudcanvas-ui-calendar-cell.is-outside { opacity: 0.55; }
:is(.cloudcanvas-ui-calendar-day, .cloudcanvas-ui-calendar-day-head, .cloudcanvas-ui-calendar-more) {
  font: inherit;
  font-size: var(--cc-type-sm, 12px);
  color: var(--cc-text, #e2e8f0);
  background: transparent;
  border: 0;
  cursor: pointer;
}
.cloudcanvas-ui-calendar-day { align-self: flex-end; min-width: 1.75rem; min-height: 1.75rem; border-radius: var(--cc-radius-pill, 9999px); }
:is(.cloudcanvas-ui-calendar-cell.is-today .cloudcanvas-ui-calendar-day, .cloudcanvas-ui-calendar-day-head.is-today) {
  color: var(--cc-ui-on-accent, #0f172a);
  background: var(--cc-ui-today, var(--cc-accent, #38bdf8));
}
.cloudcanvas-ui-calendar-more { padding: 0 var(--cc-space-1, 4px); text-align: left; color: var(--cc-accent, #38bdf8); }
.cloudcanvas-ui-calendar-events { display: grid; gap: 2px; min-width: 0; }
.cloudcanvas-ui-calendar-event {
  position: relative;
  display: flex;
  gap: var(--cc-space-1, 4px);
  min-width: 0;
  padding: 0 var(--cc-space-1, 4px);
  overflow: hidden;
  font: inherit;
  font-size: var(--cc-type-xs, 11px);
  text-align: left;
  white-space: nowrap;
  color: var(--cc-ui-bar-text, var(--cc-text, #e2e8f0));
  background: var(--cc-ui-bar, var(--cc-btn-bg-hover, rgba(56, 189, 248, 0.22)));
  border: 0;
  border-left: 3px solid var(--cc-accent, #38bdf8);
  border-radius: var(--cc-radius-sm, 6px);
  cursor: pointer;
}
.cloudcanvas-ui-calendar-event[data-movable] { cursor: grab; }
.cloudcanvas-ui-calendar-event-title { overflow: hidden; text-overflow: ellipsis; }
.cloudcanvas-ui-calendar-event-time { opacity: 0.8; }
:is(.cloudcanvas-ui-calendar-time-head, .cloudcanvas-ui-calendar-allday, .cloudcanvas-ui-calendar-time-grid) {
  display: grid;
  grid-template-columns: 3.5rem repeat(var(--calendar-days), minmax(0, 1fr));
}
.cloudcanvas-ui-calendar-day-head { padding: var(--cc-space-1, 4px); border-left: 1px solid ${LINE}; }
.cloudcanvas-ui-calendar-gutter { padding: var(--cc-space-1, 4px); font-size: var(--cc-type-xs, 11px); color: var(--cc-text-muted, #94a3b8); }
.cloudcanvas-ui-calendar-allday { border-top: 1px solid ${LINE}; }
.cloudcanvas-ui-calendar-allday-cell { display: grid; align-content: start; gap: 2px; min-height: 1.75rem; min-width: 0; padding: var(--cc-space-1, 4px); border-left: 1px solid ${LINE}; }
.cloudcanvas-ui-calendar-scroller { max-height: var(--cc-ui-time-height, 32rem); overflow-y: auto; border-top: 1px solid ${LINE}; }
.cloudcanvas-ui-calendar-time-grid { height: calc(var(--calendar-hours) * var(--cc-ui-hour-height, 48px)); }
.cloudcanvas-ui-calendar-hours { display: grid; grid-template-rows: repeat(var(--calendar-hours), 1fr); }
.cloudcanvas-ui-calendar-hour { padding: 0 var(--cc-space-1, 4px); font-size: var(--cc-type-xs, 11px); color: var(--cc-text-muted, #94a3b8); border-top: 1px solid ${LINE}; }
.cloudcanvas-ui-calendar-column {
  position: relative;
  min-width: 0;
  border-left: 1px solid ${LINE};
  background-image: var(--cc-ui-hour-lines, repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0.06) 0 1px, transparent 1px var(--cc-ui-hour-height, 48px)));
  cursor: pointer;
}
.cloudcanvas-ui-calendar-timed {
  position: absolute;
  top: calc(var(--calendar-top) * var(--cc-ui-hour-height, 48px) / 60);
  left: calc(var(--calendar-lane) * 100% / var(--calendar-lanes) + 1px);
  width: calc(100% / var(--calendar-lanes) - 2px);
  height: calc(var(--calendar-length) * var(--cc-ui-hour-height, 48px) / 60 - 2px);
  flex-direction: column;
  white-space: normal;
}

@media (max-width: 40rem) {
  .cloudcanvas-ui-kanban-lane { grid-auto-columns: 85%; }
  :is(.cloudcanvas-ui-calendar-time-head, .cloudcanvas-ui-calendar-allday, .cloudcanvas-ui-calendar-time-grid) {
    grid-template-columns: 2.5rem repeat(var(--calendar-days), minmax(0, 1fr));
  }
  .cloudcanvas-ui-calendar-cell { min-height: 4rem; }
}
@media (pointer: coarse) {
  /*
   * A button a view's toolbar draws is 44px wide as it is tall: the glyphs (zoom, previous, next) and the short words (Fit).
   * A day's number and a day's heading keep what is drawn - the number's circle, the heading's fill - and the rest of the
   * 44px is transparent border round it, which is part of the button and takes the press; a "more" link is as tall as a finger.
   */
  :is(.cloudcanvas-ui-graph-toolbar, .cloudcanvas-ui-calendar-toolbar, .cloudcanvas-ui-timeline-toolbar) .cloudcanvas-ui-button { min-width: var(--cc-control-min-coarse, 44px); }
  .cloudcanvas-ui-calendar-day { min-width: var(--cc-control-min-coarse, 44px); min-height: var(--cc-control-min-coarse, 44px); padding: 0; border: calc((var(--cc-control-min-coarse, 44px) - 1.75rem) / 2) solid transparent; }
  .cloudcanvas-ui-calendar-day-head { min-height: var(--cc-control-min-coarse, 44px); border-block: calc((var(--cc-control-min-coarse, 44px) - 2.25rem) / 2) solid transparent; }
  :is(.cloudcanvas-ui-calendar-cell.is-today .cloudcanvas-ui-calendar-day, .cloudcanvas-ui-calendar-day-head.is-today) { background-clip: padding-box; }
  .cloudcanvas-ui-calendar-more { min-height: var(--cc-control-min-coarse, 44px); }
  :is(.cloudcanvas-ui-kanban-label[data-ui-id], .cloudcanvas-ui-timeline-group-label) { min-height: var(--cc-control-min-coarse, 44px); }
  /* Room for one whole target: the all-day strip, and a day of the month under its number. A timeline row sets its own height, in ./timeline.js: its rule comes later in the sheet. */
  .cloudcanvas-ui-calendar-allday-cell { min-height: calc(var(--cc-control-min-coarse, 44px) + 2 * var(--cc-space-1, 4px)); }
  .cloudcanvas-ui-calendar-cell { min-height: 6.25rem; }

  /* The 44px targets of what is drawn smaller: see the head of this file. */
  :is(.cloudcanvas-ui-calendar, .cloudcanvas-ui-timeline, .cloudcanvas-ui-graph) { --target: var(--cc-control-min-coarse, 44px); --target-under: -1; }
  :is(.cloudcanvas-ui-calendar, .cloudcanvas-ui-timeline) { --item-more-size: var(--cc-control-min-coarse, 44px); }
  .cloudcanvas-ui-item-more > .cloudcanvas-ui-icon { width: 1.25rem; height: 1.25rem; }
  .cloudcanvas-ui-graph-node { --target: calc(var(--cc-control-min-coarse, 44px) / var(--graph-k, 1)); }
  .cloudcanvas-ui-calendar-month { isolation: isolate; }
  .cloudcanvas-ui-calendar-day { position: relative; z-index: var(--cc-z-ui-raised, 2); }
  :is(.cloudcanvas-ui-calendar-events, .cloudcanvas-ui-calendar-allday-cell, .cloudcanvas-ui-calendar-column, .cloudcanvas-ui-timeline-track, .cloudcanvas-ui-graph-nodes) { isolation: isolate; }
  :is(.cloudcanvas-ui-calendar-event, .cloudcanvas-ui-timeline-bar.is-point) { overflow: visible; }
  /* A chip cuts nothing itself now: its time does, as its title does, and still gives way last. */
  .cloudcanvas-ui-calendar-event-time { flex: none; max-width: 100%; max-height: 100%; overflow: hidden; }
  .cloudcanvas-ui-timeline-bar.is-point::before { border-radius: inherit; }
  :is(.cloudcanvas-ui-calendar-event, .cloudcanvas-ui-timeline-bar.is-point, .cloudcanvas-ui-graph-node)::after {
    content: "";
    position: absolute;
    top: 50%;
    left: calc(50% - 1.5px);
    z-index: var(--target-under);
    width: max(100%, var(--target));
    height: max(100%, var(--target));
    translate: -50% -50%;
  }
  .cloudcanvas-ui-calendar .cloudcanvas-ui-calendar-event::after { top: 0; translate: -50% 0; }
  .cloudcanvas-ui-calendar .cloudcanvas-ui-calendar-timed::after { left: 0; width: 100%; translate: none; }
  .cloudcanvas-ui-timeline-bar.is-point::after { rotate: -45deg; }
  /* A dimmed node is faded by opacity, a stacking context of its own: its reach could not lie under the node drawn before it, so it has none. */
  .cloudcanvas-ui-graph-node:is(.is-dim, .is-unmatched)::after { pointer-events: none; }
}
`;
