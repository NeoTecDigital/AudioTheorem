/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The calendar's rules for what use added to it: the handle on a timed
 * event's bottom edge (a grip drawn when the event is pointed at, focused,
 * selected or in hand, and the resize cursor over it). The rest of the
 * calendar's rules - its grids, its chips, their tones and their 44px
 * targets under a finger - are in `./views.js`.
 *
 * THE "MORE" BUTTON of the selected event (`../item-more.js`, `./more.js`) stands
 * at its chip's end, in the chip's own row of the day's list or at the chip's own
 * place in the day's column, and the chip keeps the room for it: the button is
 * its chip's neighbour, never a part of it (a chip is a button), and covers
 * neither its title, its time nor its grip. A list that holds one is the
 * button's containing block, its row the chip's own row of the grid.
 *
 * Nothing here moves: a grip appears and a band is drawn, none of it is
 * animated, so there is no motion to turn off for a reader who asked for less.
 */

export const UI_CALENDAR_CSS = `/* ------------------ UI KIT: CALENDAR ------------------ */

/* A drag across the grid selects no text on its way. */
.cloudcanvas-ui-calendar-body.is-drag-active { user-select: none; }

/* The line under the toolbar: what the selection can do. */
.cloudcanvas-ui-calendar-hint { margin: 0; font-size: var(--cc-type-xs, 11px); color: var(--cc-text-muted, #94a3b8); }

/* The handle on a timed event's bottom edge: it resizes, and says so under the pointer. */
.cloudcanvas-ui-calendar-event-handle { position: absolute; right: 0; bottom: 0; left: 0; height: 6px; cursor: ns-resize; }
.cloudcanvas-ui-calendar-event-handle::before {
  content: "";
  position: absolute;
  bottom: 2px;
  left: calc(50% - 7px);
  width: 14px;
  height: 2px;
  background: currentcolor;
  border-radius: var(--cc-radius-sm, 6px);
  opacity: 0;
}
.cloudcanvas-ui-calendar-event:is(:hover, :focus-visible, .is-selected, .is-grabbed) .cloudcanvas-ui-calendar-event-handle::before { opacity: 0.7; }

/* The "more" button of the selected event, and the room its chip keeps for it. */
:is(.cloudcanvas-ui-calendar-events, .cloudcanvas-ui-calendar-allday-cell) { position: relative; }
.cloudcanvas-ui-calendar-event.is-holding-more { padding-right: var(--item-more-room); }
:is(.cloudcanvas-ui-calendar-events, .cloudcanvas-ui-calendar-allday-cell) > .cloudcanvas-ui-calendar-more-actions { grid-column: 1 / 2; top: 50%; right: 3px; translate: 0 -50%; }
.cloudcanvas-ui-calendar-more-actions.is-timed {
  top: calc(var(--calendar-top) * var(--cc-ui-hour-height, 48px) / 60 + 2px);
  right: auto;
  left: calc((var(--calendar-lane) + 1) * 100% / var(--calendar-lanes) - var(--item-more-size) - 3px);
  translate: none;
}

/* The range being made: a band of slots with their times in it down a column; the days of a month or the strip, lit. Its words are the page's text: the band is a wash over the page, and a bar's text colour is for a bar's accent fill. */
.cloudcanvas-ui-calendar-draft {
  position: absolute;
  top: calc(var(--calendar-top) * var(--cc-ui-hour-height, 48px) / 60);
  right: 1px;
  left: 1px;
  height: calc(var(--calendar-length) * var(--cc-ui-hour-height, 48px) / 60);
  padding: 0 var(--cc-space-1, 4px);
  overflow: hidden;
  font-size: var(--cc-type-xs, 11px);
  white-space: nowrap;
  color: var(--cc-text, #e2e8f0);
  background: var(--cc-btn-bg-hover, rgba(56, 189, 248, 0.22));
  border: 2px dashed var(--cc-ui-drop, var(--cc-accent, #38bdf8));
  border-radius: var(--cc-radius-sm, 6px);
  pointer-events: none;
}
.cloudcanvas-ui-calendar-cell.is-range, .cloudcanvas-ui-calendar-allday-cell.is-range { background: var(--cc-btn-bg-hover, rgba(56, 189, 248, 0.22)); outline: 2px dashed var(--cc-ui-drop, var(--cc-accent, #38bdf8)); outline-offset: -2px; }

@media (pointer: coarse) {
  .cloudcanvas-ui-calendar-event-handle { height: 14px; }
  /* The handle's reach runs on from it, down over the ground below the event and out over its edge: under every event, so a neighbour below keeps its own. */
  .cloudcanvas-ui-calendar-event-handle::after { content: ""; position: absolute; top: 0; right: 0; left: -3px; z-index: var(--target-under); height: var(--cc-control-min-coarse, 44px); }
}
`;
