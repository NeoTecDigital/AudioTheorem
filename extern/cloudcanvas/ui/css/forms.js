/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The UI kit's settings-row rules: the switch and the select. A row reads words first and its control last, so a
 * column of them keeps its controls in one line at the end. Data, not code; joined with the other chunks by
 * `../styles.js`. Nothing in it moves.
 */
export const UI_FORMS_CSS = `
/* ------------------ UI KIT: SETTINGS ROWS ------------------ */

/* The words take the row; the box keeps its own column at the end. The row is the target, so the box can stay small. */
.cloudcanvas-ui-switch { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: var(--cc-space-3, 12px); min-height: 2.75rem; font: inherit; color: inherit; cursor: pointer; }
.cloudcanvas-ui-switch-text { display: flex; flex-wrap: wrap; align-items: baseline; min-width: 0; }
.cloudcanvas-ui-switch-label { min-width: 0; overflow-wrap: anywhere; }
.cloudcanvas-ui-switch-box { grid-column: 2; margin: 0; width: 1.25rem; height: 1.25rem; accent-color: var(--cc-accent, #38bdf8); cursor: inherit; }
.cloudcanvas-ui-switch-detail { flex-basis: 100%; font-size: var(--cc-type-sm, 12px); color: var(--cc-text-muted, #94a3b8); }
.cloudcanvas-ui-switch-detail[hidden] { display: none; }
/* The status is there before it has words, so it takes no room and no gap until it has some. Its words are the page's own ink: a tone's colour is a marker, never the only ink a note has. */
.cloudcanvas-ui-switch-status { font-size: var(--cc-type-sm, 12px); color: var(--cc-text, #e2e8f0); }
.cloudcanvas-ui-switch-status:not(:empty) { margin-inline-start: var(--cc-space-2, 8px); }
/* The marker a tone is told by: one dot, before the words of a status and of an invalid select's error. It is a :where(), with no specificity of its own, so the rule for each tone that follows it is the one that colours it. */
:where(.cloudcanvas-ui-switch-status:not(:empty), .cloudcanvas-ui-select-status:not(:empty), .cloudcanvas-ui-select[data-invalid] .cloudcanvas-ui-select-hint)::before {
  content: "";
  display: inline-block;
  width: 0.5em;
  height: 0.5em;
  margin-inline-end: 0.4em;
  border-radius: var(--cc-radius-pill, 9999px);
  background: var(--cc-text-muted, #94a3b8);
}
.cloudcanvas-ui-switch-status[data-tone="success"]::before, .cloudcanvas-ui-select-status[data-tone="success"]::before { background: var(--cc-tone-success, #22c55e); }
.cloudcanvas-ui-switch-status[data-tone="warning"]::before, .cloudcanvas-ui-select-status[data-tone="warning"]::before { background: var(--cc-tone-warning, #eab308); }
.cloudcanvas-ui-switch-status[data-tone="danger"]::before, .cloudcanvas-ui-select-status[data-tone="danger"]::before { background: var(--cc-tone-danger, #f87171); }
.cloudcanvas-ui-switch-status[data-tone="muted"]::before, .cloudcanvas-ui-select-status[data-tone="muted"]::before { background: var(--cc-text-muted, #94a3b8); }
.cloudcanvas-ui-switch-status[aria-live="assertive"], .cloudcanvas-ui-select-status[aria-live="assertive"] { font-weight: var(--cc-weight-semibold, 600); }
.cloudcanvas-ui-switch:has(.cloudcanvas-ui-switch-box:disabled) { opacity: 0.6; cursor: default; }
.cloudcanvas-ui-switch-box:focus-visible { outline: var(--cc-focus-ring-width, 2px) solid var(--cc-focus-ring, var(--cc-accent, #38bdf8)); outline-offset: 2px; }

/* The select reads as the switch does: words first, the control at the end of the line. The row wraps, so on a phone the control stands under its words and never reaches past the row. */
.cloudcanvas-ui-select { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--cc-space-1, 4px) var(--cc-space-3, 12px); min-height: 2.75rem; font: inherit; color: inherit; }
.cloudcanvas-ui-select-label { flex: 1 1 10rem; min-width: 0; overflow-wrap: anywhere; }
.cloudcanvas-ui-select-control { flex: 0 1 14rem; min-width: 0; max-width: 100%; }
.cloudcanvas-ui-select-hint { flex-basis: 100%; margin: 0; font-size: var(--cc-type-sm, 12px); color: var(--cc-text, #e2e8f0); }
.cloudcanvas-ui-select-hint[hidden] { display: none; }
/* The status is a line of its own under the hint. Empty it is out of the row and not hidden: a region that comes with its words is not reliably read. */
.cloudcanvas-ui-select-status { flex-basis: 100%; margin: 0; font-size: var(--cc-type-sm, 12px); color: var(--cc-text, #e2e8f0); }
.cloudcanvas-ui-select-status:empty { position: absolute; flex-basis: auto; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.cloudcanvas-ui-select[data-invalid] .cloudcanvas-ui-select-control { border-color: var(--cc-tone-danger, #f87171); }
.cloudcanvas-ui-select[data-invalid] .cloudcanvas-ui-select-hint::before { background: var(--cc-tone-danger, #f87171); }
`;
