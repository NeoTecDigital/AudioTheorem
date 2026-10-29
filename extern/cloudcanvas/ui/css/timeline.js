/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The timeline's rules: the toolbar with the hint under it, the sheet, the
 * axis with the gutter's separator on its corner, the rows, and the bar - its
 * title, its status tone, its progress, the handles at its ends. The rules the
 * timeline shares with the other views - its tones, its mark when selected or
 * in hand, its heading's look, its milestone's 44px target under a finger -
 * are in `./views.js`.
 *
 * WHAT A GESTURE DOES IS SAID BEFORE IT IS MADE: the root says which ones the
 * host takes (`data-can-move`, `data-can-create`, `data-can-link`,
 * `data-can-fold`), so what can be moved has the grab
 * cursor, a handle that resizes the resize cursor, and a handle that is only
 * there to be dragged is drawn when it can be used: on hover, on focus and on
 * the selected row.
 *
 * A TITLE IS ALWAYS DRAWN: inside the bar it ends in an ellipsis, and beside
 * a milestone or a short bar it stands clear of the bar's handles. A folded
 * group's summary on its heading's row is drawn as a bar of what is folded
 * away: the page's text on the sheet's surface, a dashed outline.
 *
 * A MOUSE GETS A WHOLE TARGET (24px) of what is drawn small: the gutter's
 * separator (6px), the link handle (12px) and the ends of a bar (10px), each
 * by a reach of its own that keeps clear of the others - the ends reach inward
 * and never past a third of the bar, so the middle stays the bar's; the link
 * handle's reach starts at the bar's edge. A finger gets 44px, below.
 *
 * THE "MORE" BUTTON of the selected bar (`../item-more.js`, `../timeline/more.js`)
 * stands beyond the bar, after its link handle, where a title drawn beside the
 * bar would begin; the title of the selected row moves past it, so it covers
 * neither the bar's title nor a handle.
 *
 * Nothing here moves: a handle appears, a band is drawn, a bar is placed;
 * none of it is animated, so there is no motion to turn off for a reader who
 * asked for less.
 */

const LINE = 'var(--cc-ui-grid-line, var(--cc-card-border, rgba(255, 255, 255, 0.1)))';
const SURFACE = 'var(--cc-ui-surface, var(--cc-card-bg, rgba(30, 41, 59, 0.85)))';
const ACCENT = 'var(--cc-accent, #38bdf8)';
const RING = 'var(--cc-focus-ring-width, 2px) solid var(--cc-focus-ring, var(--cc-accent, #38bdf8))';

export const UI_TIMELINE_CSS = `/* ------------------ UI KIT: TIMELINE ------------------ */

.cloudcanvas-ui-timeline { --timeline-gutter: var(--cc-ui-gutter, 10rem); display: grid; gap: var(--cc-space-2, 8px); min-width: 0; }
.cloudcanvas-ui-timeline-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--cc-space-2, 8px); }
.cloudcanvas-ui-timeline-scales { display: flex; gap: var(--cc-space-1, 4px); }
.cloudcanvas-ui-timeline-range { font-size: var(--cc-type-sm, 12px); color: var(--cc-text-muted, #94a3b8); }
.cloudcanvas-ui-timeline-hint { margin: 0; font-size: var(--cc-type-xs, 11px); color: var(--cc-text-muted, #94a3b8); }
.cloudcanvas-ui-timeline-sheet { position: relative; isolation: isolate; max-height: var(--cc-ui-timeline-height, 28rem); overflow: auto; touch-action: pan-x pan-y; border: 1px solid ${LINE}; border-radius: var(--cc-radius-md, 10px); }
.cloudcanvas-ui-timeline-sheet.is-drag-active { user-select: none; }
.cloudcanvas-ui-timeline-grid { position: relative; width: calc(var(--timeline-gutter) + var(--timeline-width)); min-width: 100%; padding-bottom: var(--cc-space-2, 8px); }
.cloudcanvas-ui-timeline-axis { position: sticky; top: 0; z-index: var(--cc-z-ui-sticky, 3); display: flex; height: 1.75rem; background: ${SURFACE}; border-bottom: 1px solid ${LINE}; }
.cloudcanvas-ui-timeline-corner { position: sticky; left: 0; z-index: var(--cc-z-ui-raised, 2); flex: none; width: var(--timeline-gutter); background: ${SURFACE}; }
.cloudcanvas-ui-timeline-ticks { position: relative; flex: none; width: var(--timeline-width); }
.cloudcanvas-ui-timeline-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--timeline-x);
  padding: var(--cc-space-1, 4px);
  font-size: var(--cc-type-xs, 11px);
  white-space: nowrap;
  color: var(--cc-text-muted, #94a3b8);
  border-left: 1px solid ${LINE};
}

/* The gutter's separator: a grip on the corner's edge, a cursor that says what a drag does. */
.cloudcanvas-ui-timeline-gutter-handle { position: absolute; top: 0; right: -3px; bottom: 0; width: 6px; cursor: col-resize; touch-action: none; border-radius: var(--cc-radius-sm, 6px); }
.cloudcanvas-ui-timeline-gutter-handle::after { content: ""; position: absolute; top: 6px; bottom: 6px; left: 2px; width: 2px; border-radius: var(--cc-radius-sm, 6px); background: var(--cc-text-muted, #94a3b8); opacity: 0.5; }
.cloudcanvas-ui-timeline-gutter-handle:is(:hover, :focus-visible, .is-grabbed)::after { background: ${ACCENT}; opacity: 1; }
/* The separator is drawn 6px wide and takes a mouse 24px: it stands on the axis alone, so its reach has no neighbour to take a press from. */
.cloudcanvas-ui-timeline-gutter-handle::before { content: ""; position: absolute; top: 0; bottom: 0; left: 50%; width: 24px; translate: -50% 0; }
.cloudcanvas-ui-timeline-gutter-handle:focus-visible { outline: ${RING}; outline-offset: 0; }

/* A group's heading: a row of its own, level 1 of the treegrid. */
/* It is as wide as the sheet's content, so the empty track beside its name takes a dragged span; the name stays in view as the sheet is scrolled. */
.cloudcanvas-ui-timeline-group { position: relative; display: flex; }
.cloudcanvas-ui-timeline-group > .cloudcanvas-ui-timeline-track { position: absolute; top: 0; bottom: 0; left: var(--timeline-gutter); height: auto; }
/* The heading's cell is the title column's, as a row's title is: at least as wide, on its surface, so a summary or a band scrolled under it is hidden as a bar is under a title. */
.cloudcanvas-ui-timeline-group-cell { position: sticky; left: 0; z-index: var(--cc-z-ui-raised, 2); flex: none; box-sizing: border-box; min-width: var(--timeline-gutter); display: flex; align-items: center; gap: var(--cc-space-1, 4px); padding: var(--cc-space-1, 4px) var(--cc-space-2, 8px); font-size: var(--cc-type-sm, 12px); font-weight: var(--cc-weight-semibold, 600); color: var(--cc-text-muted, #94a3b8); background: ${SURFACE}; }
.cloudcanvas-ui-timeline-group-label:focus-visible { outline: ${RING}; outline-offset: var(--cc-focus-ring-offset, 2px); }
/* The chevron: drawn, not written, so the heading's words are its name alone; it points down when the group is open and right when it is folded. */
.cloudcanvas-ui-timeline-group-toggle {
  position: relative;
  order: -1;
  flex: none;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--cc-radius-sm, 6px);
  cursor: pointer;
}
.cloudcanvas-ui-timeline-group-toggle::before {
  content: "";
  position: absolute;
  top: calc(50% - 4px);
  left: calc(50% - 3px);
  width: 6px;
  height: 6px;
  border-right: 2px solid currentcolor;
  border-bottom: 2px solid currentcolor;
  rotate: 45deg;
}
.cloudcanvas-ui-timeline-group-toggle[aria-expanded="false"]::before { top: calc(50% - 3px); left: calc(50% - 4px); rotate: -45deg; }
.cloudcanvas-ui-timeline-group-toggle:is(:hover, :focus-visible) { color: var(--cc-text, #e2e8f0); background: var(--cc-btn-bg-hover, rgba(56, 189, 248, 0.22)); }
.cloudcanvas-ui-timeline-group-toggle:focus-visible { outline: ${RING}; outline-offset: 0; }
.cloudcanvas-ui-timeline-group-count { padding: 0 var(--cc-space-1, 4px); font-weight: var(--cc-weight-medium, 500); color: var(--cc-text-muted, #94a3b8); border: 1px solid ${LINE}; border-radius: var(--cc-radius-sm, 6px); }

.cloudcanvas-ui-timeline-row { display: flex; align-items: center; min-height: 2.25rem; border-bottom: 1px solid ${LINE}; }
.cloudcanvas-ui-timeline-label {
  position: sticky;
  left: 0;
  z-index: var(--cc-z-ui-raised, 2);
  flex: none;
  box-sizing: border-box;
  width: var(--timeline-gutter);
  padding: 0 var(--cc-space-2, 8px);
  overflow: hidden;
  font-size: var(--cc-type-sm, 12px);
  white-space: nowrap;
  text-overflow: ellipsis;
  background: ${SURFACE};
  cursor: pointer;
}
.cloudcanvas-ui-timeline-label::after { content: ""; position: absolute; top: 0; right: 0; bottom: 0; border-right: 1px solid ${LINE}; }
.cloudcanvas-ui-timeline-row.is-current .cloudcanvas-ui-timeline-label { font-weight: var(--cc-weight-semibold, 600); }
.cloudcanvas-ui-timeline-track { position: relative; flex: none; width: var(--timeline-width); height: 2.25rem; }
.cloudcanvas-ui-timeline[data-can-create] .cloudcanvas-ui-timeline-track { cursor: crosshair; }
/* The span being made: a band of the days it covers - its border within them - and its dates in a tag of their own. A title drawn beside a short bar or a milestone is centred on the row, where a band over those days would write its dates too, so the tag hangs below that line: its top is the row's middle (the band's own) and 0.85em down, past a title's half height at the line height of 1.6 a page may inherit, which on the last row is below the row, so the grid keeps room for it and the sheet does not grow when it is drawn - on the sheet's surface so it is read at 4.5:1 whatever is under it, in the page's text colour (see the calendar's band). */
.cloudcanvas-ui-timeline-draft {
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: var(--timeline-x);
  width: var(--timeline-w);
  box-sizing: border-box;
  overflow: visible;
  background: var(--cc-btn-bg-hover, rgba(56, 189, 248, 0.22));
  border: 2px dashed var(--cc-ui-drop, ${ACCENT});
  border-radius: var(--cc-radius-sm, 6px);
  pointer-events: none;
}
.cloudcanvas-ui-timeline-draft-words {
  position: absolute;
  top: calc(50% + 0.85em);
  left: -2px;
  padding: 0 var(--cc-space-1, 4px);
  font-size: var(--cc-type-xs, 11px);
  line-height: 1;
  white-space: nowrap;
  color: var(--cc-text, #e2e8f0);
  background: ${SURFACE};
  border-radius: var(--cc-radius-sm, 6px);
}

/* A folded group's summary: the days its items cover, its name and count in the page's text; a press opens the group's item, so it points, and it is no row to drag a span across. */
.cloudcanvas-ui-timeline-summary {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: var(--timeline-x);
  width: var(--timeline-w);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  padding: 0 var(--cc-space-2, 8px);
  font-size: var(--cc-type-xs, 11px);
  color: var(--cc-text, #e2e8f0);
  background: ${SURFACE};
  border: 1px dashed var(--cc-text-muted, #94a3b8);
  border-left: 4px solid var(--cc-text-muted, #94a3b8);
  border-radius: var(--cc-radius-sm, 6px);
  cursor: pointer;
}
.cloudcanvas-ui-timeline-summary-title { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

/* A bar: its title inside (or beside it), its status in its outline and fill, its progress as the fill that is done. */
.cloudcanvas-ui-timeline-bar {
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: var(--timeline-x);
  width: var(--timeline-w);
  min-width: 1.25rem;
  display: flex;
  align-items: center;
  padding: 0 var(--cc-space-2, 8px);
  font: inherit;
  font-size: var(--cc-type-xs, 11px);
  color: var(--cc-ui-bar-text, var(--cc-text, #e2e8f0));
  background: var(--cc-ui-bar, var(--cc-btn-bg-hover, rgba(56, 189, 248, 0.22)));
  border: 1px solid var(--timeline-tone, ${ACCENT});
  border-left-width: 4px;
  border-radius: var(--cc-radius-sm, 6px);
  cursor: pointer;
}
.cloudcanvas-ui-timeline-bar[data-movable] { cursor: grab; }
.cloudcanvas-ui-timeline-bar[data-status-tone="success"] { --timeline-tone: var(--cc-tone-success, #22c55e); }
.cloudcanvas-ui-timeline-bar[data-status-tone="warning"] { --timeline-tone: var(--cc-tone-warning, #eab308); }
.cloudcanvas-ui-timeline-bar[data-status-tone="danger"] { --timeline-tone: var(--cc-tone-danger, #f87171); }
.cloudcanvas-ui-timeline-bar[data-status-tone="muted"] { --timeline-tone: var(--cc-text-muted, #94a3b8); }
.cloudcanvas-ui-timeline-bar::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: calc(var(--timeline-progress, 0) * 100%);
  background: var(--cc-btn-bg-hover, rgba(56, 189, 248, 0.22));
  border-radius: inherit;
}
.cloudcanvas-ui-timeline-bar[data-status-tone]::before { background: color-mix(in oklab, var(--timeline-tone) var(--timeline-fill, 40%), transparent); }
.cloudcanvas-ui-timeline-bar.is-point { top: 50%; bottom: auto; left: calc(var(--timeline-x) - 7px); width: 14px; height: 14px; padding: 0; translate: 0 -50%; rotate: 45deg; }
.cloudcanvas-ui-timeline-bar.is-short { padding: 0; }
.cloudcanvas-ui-timeline-bar-title { position: relative; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

/* The title of a milestone, or of a bar too short to hold it: beside it, a part of the same item. */
.cloudcanvas-ui-timeline-outside {
  position: absolute;
  top: 50%;
  left: calc(var(--timeline-x) + var(--timeline-w) + 22px);
  translate: 0 -50%;
  font-size: var(--cc-type-xs, 11px);
  white-space: nowrap;
  color: var(--cc-text, #e2e8f0);
  cursor: pointer;
}
.cloudcanvas-ui-timeline-outside.is-point { left: calc(var(--timeline-x) + 12px); }
.cloudcanvas-ui-timeline[data-can-link] .cloudcanvas-ui-timeline-outside { left: calc(var(--timeline-x) + var(--timeline-w) + 30px); }
.cloudcanvas-ui-timeline[data-can-link] .cloudcanvas-ui-timeline-outside.is-point { left: calc(var(--timeline-x) + 32px); }

/* The handle a link is dragged from: beside a bar's right edge, drawn when the host can link and the row is hovered, focused or selected. */
.cloudcanvas-ui-timeline-link {
  position: absolute;
  top: 50%;
  left: calc(var(--timeline-x) + var(--timeline-w) + 6px);
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  z-index: var(--cc-z-ui-raised, 2);
  translate: 0 -50%;
  background: var(--cc-card-bg, rgba(30, 41, 59, 0.85));
  border: 2px solid ${ACCENT};
  border-radius: var(--cc-radius-pill, 9999px);
  opacity: 0;
  cursor: crosshair;
}
.cloudcanvas-ui-timeline-link.is-point { left: calc(var(--timeline-x) + 16px); }
/* A mouse gets 24px of the handle: from the bar's edge, a whole target, clear of the title drawn beside it. */
.cloudcanvas-ui-timeline-link::after { content: ""; position: absolute; top: 50%; left: -6px; width: 24px; height: 24px; translate: 0 -50%; }
.cloudcanvas-ui-timeline-row:is(:hover, :focus-within, .is-current) .cloudcanvas-ui-timeline-link { opacity: 1; }
.cloudcanvas-ui-timeline-bar.is-drop-target { outline: 2px dashed var(--cc-ui-drop, ${ACCENT}); outline-offset: 2px; }

/* The dependencies: connectors in a layer of their own over the bars, a picture the pointer passes through everywhere - the bars are the pointer's, and so is the handle a link is dragged from, which stands above the layer where a connector starts. */
.cloudcanvas-ui-timeline-links {
  position: absolute;
  top: 0;
  left: var(--timeline-gutter);
  z-index: var(--cc-z-ui-raised, 2);
  width: var(--timeline-width);
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
.cloudcanvas-ui-timeline-connector-line { fill: none; stroke: var(--cc-connector, rgba(56, 189, 248, 0.6)); stroke-width: 1.5; }
.cloudcanvas-ui-timeline-arrow { fill: ${ACCENT}; }
.cloudcanvas-ui-timeline-draft-link { fill: none; stroke: ${ACCENT}; stroke-width: 2; stroke-dasharray: 6 5; }

/* The handles at a bar's ends: each resizes, and says so under the pointer. */
:is(.cloudcanvas-ui-timeline-handle, .cloudcanvas-ui-timeline-handle-start) { position: absolute; top: 0; bottom: 0; width: min(10px, 30%); cursor: ew-resize; background: ${ACCENT}; opacity: 0.4; }
.cloudcanvas-ui-timeline-handle { right: 0; border-radius: 0 var(--cc-radius-sm, 6px) var(--cc-radius-sm, 6px) 0; }
.cloudcanvas-ui-timeline-handle-start { left: 0; border-radius: var(--cc-radius-sm, 6px) 0 0 var(--cc-radius-sm, 6px); }
.cloudcanvas-ui-timeline-row:is(:hover, :focus-within, .is-current) :is(.cloudcanvas-ui-timeline-handle, .cloudcanvas-ui-timeline-handle-start) { opacity: 0.75; }
/* A mouse gets 24px of each end: inward from the bar's edge, never past a third of what is inside its borders (4px at the start, 1px at the end), so its middle is its own to move - a bar of half an hour is 20px wide, and its body is still its body; the handle is as tall as the bar. */
:is(.cloudcanvas-ui-timeline-handle, .cloudcanvas-ui-timeline-handle-start)::after { content: ""; position: absolute; top: 50%; width: min(24px, calc((var(--timeline-w) - 5px) / 3)); height: max(100%, 24px); translate: 0 -50%; }
.cloudcanvas-ui-timeline-handle::after { right: 0; }
.cloudcanvas-ui-timeline-handle-start::after { left: 0; }

/* The "more" button of the selected bar: where a title beside the bar would begin, which the selected row's title gives way to. */
.cloudcanvas-ui-timeline-more { top: 50%; left: calc(var(--timeline-x) + var(--timeline-w) + 22px); translate: 0 -50%; }
.cloudcanvas-ui-timeline[data-can-link] .cloudcanvas-ui-timeline-more { left: calc(var(--timeline-x) + var(--timeline-w) + 30px); }
.cloudcanvas-ui-timeline-more.is-point { left: calc(var(--timeline-x) + 12px); }
.cloudcanvas-ui-timeline[data-can-link] .cloudcanvas-ui-timeline-more.is-point { left: calc(var(--timeline-x) + 32px); }
.cloudcanvas-ui-timeline[data-can-menu] .cloudcanvas-ui-timeline-row.is-current:not(.is-crowded) .cloudcanvas-ui-timeline-outside { margin-left: var(--item-more-room); }
.cloudcanvas-ui-timeline-now {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--timeline-gutter) + var(--timeline-x));
  width: 2px;
  pointer-events: none;
  background: var(--cc-tone-danger, #f87171);
}

@media (max-width: 40rem) {
  .cloudcanvas-ui-timeline { --timeline-gutter: var(--cc-ui-gutter, 6rem); }
}
@media (pointer: coarse) {
  /* A finger gets a whole target at everything that is dragged or pressed: the toggle, the separator, a bar's handles. */
  .cloudcanvas-ui-timeline-group-toggle { width: var(--cc-control-min-coarse, 44px); height: var(--cc-control-min-coarse, 44px); }
  .cloudcanvas-ui-timeline-gutter-handle { right: calc(-0.5 * var(--cc-control-min-coarse, 44px)); width: var(--cc-control-min-coarse, 44px); }
  .cloudcanvas-ui-timeline-gutter-handle::after { left: calc(50% - 1px); }
  :is(.cloudcanvas-ui-timeline-handle, .cloudcanvas-ui-timeline-handle-start) { width: min(14px, 30%); }
  /* A bar's ends reach inward a third of the bar at most, so its body keeps a third; a bar too short for three targets is one, its ends inert. */
  :is(.cloudcanvas-ui-timeline-handle, .cloudcanvas-ui-timeline-handle-start)::after {
    content: "";
    position: absolute;
    top: 50%;
    width: min(var(--cc-control-min-coarse, 44px), calc(var(--timeline-w) / 3));
    height: var(--cc-control-min-coarse, 44px);
    translate: 0 -50%;
  }
  .cloudcanvas-ui-timeline-bar.is-short :is(.cloudcanvas-ui-timeline-handle, .cloudcanvas-ui-timeline-handle-start) { pointer-events: none; }
  /* The grab area of a bar drawn narrower than a finger is padding round it: it lies under the bar, so the bar keeps its own look. A folded group's summary is a whole target the same way. */
  .cloudcanvas-ui-timeline-bar { overflow: visible; }
  /* A milestone's reach stands over the title drawn beside it - a part of the same item - so a finger 12 to 22px from its middle moves the milestone, not just opens it. */
  .cloudcanvas-ui-timeline-bar.is-point { z-index: var(--cc-z-ui-raised, 2); }
  .cloudcanvas-ui-timeline-bar:not(.is-point)::after, .cloudcanvas-ui-timeline-summary::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: var(--target-under);
    width: max(100%, var(--target));
    height: max(100%, var(--target));
    translate: -50% -50%;
  }
  .cloudcanvas-ui-timeline-handle::after { right: 0; }
  .cloudcanvas-ui-timeline-handle-start::after { left: 0; }
  /*
   * THE LINK HANDLE'S REACH lies past the bar's right end - the whole 44px of it, starting at the bar's edge (a milestone's
   * right corner) - never over the bar: the middle of every bar is the bar's, to tap, to hold and to drag. Where a bar is
   * narrower than two targets the handle is there only for the item that is selected or focused; its title, drawn beside
   * it, stands clear of the reach.
   */
  .cloudcanvas-ui-timeline-link::after { content: ""; position: absolute; top: 50%; left: -6px; width: var(--cc-control-min-coarse, 44px); height: var(--cc-control-min-coarse, 44px); translate: 0 -50%; }
  .cloudcanvas-ui-timeline-link.is-point::after { left: 0; }
  .cloudcanvas-ui-timeline-link.is-narrow { pointer-events: none; }
  .cloudcanvas-ui-timeline-row:is(.is-current, :focus-within) .cloudcanvas-ui-timeline-link.is-narrow { pointer-events: auto; }
  .cloudcanvas-ui-timeline[data-can-link] .cloudcanvas-ui-timeline-outside { left: calc(var(--timeline-x) + var(--timeline-w) + var(--cc-control-min-coarse, 44px) + 8px); }
  .cloudcanvas-ui-timeline[data-can-link] .cloudcanvas-ui-timeline-outside.is-point { left: calc(var(--timeline-x) + var(--cc-control-min-coarse, 44px) + 20px); }
  .cloudcanvas-ui-timeline[data-can-link] .cloudcanvas-ui-timeline-more { left: calc(var(--timeline-x) + var(--timeline-w) + var(--cc-control-min-coarse, 44px) + 8px); }
  .cloudcanvas-ui-timeline[data-can-link] .cloudcanvas-ui-timeline-more.is-point { left: calc(var(--timeline-x) + var(--cc-control-min-coarse, 44px) + 20px); }
  .cloudcanvas-ui-timeline[data-can-link] .cloudcanvas-ui-timeline-row.is-current .cloudcanvas-ui-timeline-link { opacity: 1; }
  /* A row is one whole target tall, and so is its track: a bar's grab area and the link handle's reach lie within it. */
  .cloudcanvas-ui-timeline-row { min-height: var(--cc-control-min-coarse, 44px); }
  .cloudcanvas-ui-timeline-track { height: var(--cc-control-min-coarse, 44px); }
  /* The axis is a target tall too, for the separator on its corner: 44px of content and its 1px rule below, whichever box a host sizes by. A row's title in the gutter, and the title beside a short bar, are the bar's: the whole height of the row. */
  .cloudcanvas-ui-timeline-axis { box-sizing: content-box; height: var(--cc-control-min-coarse, 44px); }
  .cloudcanvas-ui-timeline-tick { display: flex; align-items: center; }
  .cloudcanvas-ui-timeline-label { align-self: stretch; line-height: var(--cc-control-min-coarse, 44px); }
  .cloudcanvas-ui-timeline-outside { min-width: var(--cc-control-min-coarse, 44px); line-height: var(--cc-control-min-coarse, 44px); }
}
`;
