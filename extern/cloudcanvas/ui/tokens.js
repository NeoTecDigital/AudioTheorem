/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * `UI_TOKENS`: the tokens only the UI kit reads, in the engine catalogue's
 * shape (`{category, purpose}`, category values from `TOKEN_CATEGORY`). They live
 * with the kit rather than in `../graphics/tokens.js`, so the core bundle does
 * not carry entries it never reads. Every one chains to a core token in the kit
 * sheet, so a theme that sets only the core tokens themes the kit - except the
 * eight category tones, which are the host's own palette: no core token means
 * "category three", so each defaults to a hue of its own.
 */

/**
 * The categories used, spelled as `TOKEN_CATEGORY`'s values (the foundations
 * test holds them to it). Written out rather than imported: importing the
 * engine catalogue module would pull its whole token table into this entry.
 */
const C = /* @__PURE__ */ Object.freeze({ COLOR: 'color', SIZE: 'size', SHADOW: 'shadow', Z_INDEX: 'z-index' });

export const UI_TOKENS = /* @__PURE__ */ Object.freeze({
  /* ---- colour ---- */
  '--cc-ui-surface': { category: C.COLOR, purpose: 'Surface of dialogs, toasts and sticky timeline chrome' },
  '--cc-ui-backdrop': { category: C.COLOR, purpose: 'Dimming layer behind a modal dialog' },
  '--cc-ui-selected': { category: C.COLOR, purpose: 'Fill of a highlighted result option' },
  '--cc-ui-on-accent': { category: C.COLOR, purpose: 'Text on an accent fill (primary button, pressed view, today)' },
  '--cc-ui-grid-line': { category: C.COLOR, purpose: 'Rules between calendar, board and timeline cells' },
  '--cc-ui-hour-lines': { category: C.COLOR, purpose: 'Hour-rule background pattern of the week and day grids' },
  '--cc-ui-bar': { category: C.COLOR, purpose: 'Fill of a calendar event and a timeline bar' },
  '--cc-ui-bar-text': { category: C.COLOR, purpose: 'Text on a calendar event and a timeline bar' },
  '--cc-ui-drop': { category: C.COLOR, purpose: 'Outline of a drop target and of an item being moved' },
  '--cc-ui-today': { category: C.COLOR, purpose: "Fill marking today's date" },
  '--cc-ui-flag-light': { category: C.COLOR, purpose: 'Light on a flag badge: its sheen, its top edge and the lit side of its staff' },
  '--cc-ui-flag-shade': { category: C.COLOR, purpose: 'Shade on a flag badge: under its sheen, at its staff and in its folded tail' },
  '--cc-ui-flag-shadow': { category: C.COLOR, purpose: 'Shadow a flag badge casts on what it is planted on' },
  '--cc-ui-tab-layer': { category: C.COLOR, purpose: 'Shade a folder layer behind a tab takes, once for each step back it stands' },
  '--cc-ui-tone-1': { category: C.COLOR, purpose: 'Category tone 1 of 8: the edge of a card, event, bar, chip or tree item marked tone 1' },
  '--cc-ui-tone-2': { category: C.COLOR, purpose: 'Category tone 2 of 8: the edge of a card, event, bar, chip or tree item marked tone 2' },
  '--cc-ui-tone-3': { category: C.COLOR, purpose: 'Category tone 3 of 8: the edge of a card, event, bar, chip or tree item marked tone 3' },
  '--cc-ui-tone-4': { category: C.COLOR, purpose: 'Category tone 4 of 8: the edge of a card, event, bar, chip or tree item marked tone 4' },
  '--cc-ui-tone-5': { category: C.COLOR, purpose: 'Category tone 5 of 8: the edge of a card, event, bar, chip or tree item marked tone 5' },
  '--cc-ui-tone-6': { category: C.COLOR, purpose: 'Category tone 6 of 8: the edge of a card, event, bar, chip or tree item marked tone 6' },
  '--cc-ui-tone-7': { category: C.COLOR, purpose: 'Category tone 7 of 8: the edge of a card, event, bar, chip or tree item marked tone 7' },
  '--cc-ui-tone-8': { category: C.COLOR, purpose: 'Category tone 8 of 8: the edge of a card, event, bar, chip or tree item marked tone 8' },

  /* ---- geometry and stacking ---- */
  '--cc-ui-dialog-width': { category: C.SIZE, purpose: 'Maximum width of a dialog panel' },
  '--cc-ui-flag-rise': { category: C.SIZE, purpose: 'How far a flag badge stands out of the top of what holds it; tabs and the nav bar keep that room' },
  '--cc-ui-tab-width': { category: C.SIZE, purpose: 'Most room a tab takes; a longer label is cut with an ellipsis' },
  '--cc-ui-tab-layer-peek': { category: C.SIZE, purpose: 'How much of a folder layer shows past whatever stands in front of it' },
  '--cc-ui-tab-layer-step': { category: C.SIZE, purpose: 'How much lower a folder layer stands for each step back from its tab' },
  '--cc-ui-tab-layer-width': { category: C.SIZE, purpose: 'Most room a folder layer takes when it comes forward to be read' },
  '--cc-ui-toast-offset': { category: C.SIZE, purpose: 'Gap between the toast stack and the bottom of the viewport' },
  '--cc-ui-toast-inset-bottom': { category: C.SIZE, purpose: 'Room kept clear under the toast stack, for a bar or a button a host floats there; the toast offset when unset' },
  '--cc-ui-toast-inset-left': { category: C.SIZE, purpose: 'Room kept clear to the left of the toast stack' },
  '--cc-ui-toast-inset-right': { category: C.SIZE, purpose: 'Room kept clear to the right of the toast stack' },
  '--cc-ui-hour-height': { category: C.SIZE, purpose: 'Height of one hour in the week and day grids' },
  '--cc-ui-time-height': { category: C.SIZE, purpose: 'Visible height of the scrolling hour grid' },
  '--cc-ui-timeline-height': { category: C.SIZE, purpose: 'Visible height of the timeline sheet' },
  '--cc-ui-gutter': { category: C.SIZE, purpose: 'Width of the timeline label column' },
  '--cc-ui-graph-height': { category: C.SIZE, purpose: 'Height of the relationship-graph viewport' },
  '--cc-ui-tab-layer-shadow': { category: C.SHADOW, purpose: 'Shadow a folder tab casts on the layer behind it' },
  '--cc-ui-selected-ring': { category: C.SHADOW, purpose: 'Ring inside a card, chip, bar or heading a view marks as the selected item' },
  '--cc-z-ui-context': { category: C.Z_INDEX, purpose: 'Nonmodal floating context windows: the lowest of the floating layers, below toasts, dialogs and menus' },
  '--cc-z-ui-toast': { category: C.Z_INDEX, purpose: 'Toast stack: above the floating context windows, below a dialog and below a menu, which it must not cover' },
  '--cc-z-ui-dialog': { category: C.Z_INDEX, purpose: 'A dialog that is not modal: above toasts, below a menu opened over it (a modal dialog is in the top layer)' },
  '--cc-z-ui-popover': { category: C.Z_INDEX, purpose: 'Popovers: above a dialog that is not modal and the toasts, below a menu opened from one' },
  '--cc-z-ui-menu': { category: C.Z_INDEX, purpose: 'Menus: the top floating layer, above the context windows, toasts and dialogs one may be opened over' },
  '--cc-z-ui-raised': { category: C.Z_INDEX, purpose: 'Parts raised inside a UI view: sticky labels, a card being dragged' },
  '--cc-z-ui-sticky': { category: C.Z_INDEX, purpose: 'Sticky headers inside a UI view, above raised parts (the timeline axis)' }
});
