/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * What is selected, drawn, and what it can do, said. The event that is the
 * selection wears the kit's mark on every day it is drawn; the one line under
 * the toolbar says what the selection can do, from the callbacks the host
 * took - a verb it did not take is not offered. The selection is the
 * reader's - focus and a press move it - and the model's `selectedId`
 * replaces it when the model changes it. While a range is drawn by keyboard
 * (`./draw.js`), the line says the keys of the step it is at.
 */
import { markSelected, writeText } from '../dom.js';
import { eventById } from './model.js';
import { syncMore } from './more.js';
import { CAL } from './month.js';
import { resizable } from './resize.js';

/** The verbs of the event that is selected. */
function eventVerbs(cal, event) {
  const { labels, callbacks: cb } = cal;
  const moves = event.movable && typeof cb.onMove === 'function';
  return [cb.onActivate && labels.hintOpen, moves && labels.hintMove, resizable(cal, event) && labels.hintResize, resizable(cal, event) && labels.hintKeys,
    cb.onMenu && (cal.crowded ? labels.hintMoreHeld : labels.hintMore)];
}

/** What nothing selected says: how to begin, by pointer and by keyboard. */
function startVerbs(cal) {
  const add = cal.state.view === 'month' ? cal.labels.hintCreateDays : cal.labels.hintCreate;
  return [cal.labels.hintNone, cal.callbacks.onPick && add, cal.callbacks.onMenu && cal.labels.hintMore, cal.callbacks.onPick && cal.labels.hintDraw];
}

/** The keys of the step a drawing is at: in the month or the hours, before its anchor or after. */
function drawingHint(cal, { kind, anchor }) {
  const { labels } = cal;
  if (kind === 'days') return anchor === null ? labels.hintDrawDays : labels.hintDrawDaysEnd;
  return anchor === null ? labels.hintDrawTime : labels.hintDrawTimeEnd;
}

/** The hint for the calendar's selection, or '' when it has nothing to say; while a range is drawn, the keys of its step. */
export function hintOf(cal) {
  if (cal.state.drawing) return drawingHint(cal, cal.state.drawing);
  const event = eventById(cal, cal.state.selectedId);
  const verbs = event ? eventVerbs(cal, event) : startVerbs(cal);
  return verbs.filter(Boolean).join(' · ');
}

/** Mark the selection on every chip that draws it, stand the "more" button by it, and write the hint. */
export function paint(cal) {
  for (const chip of cal.body.querySelectorAll(`.${CAL}-event`)) markSelected(chip, chip.getAttribute('data-ui-id') === cal.state.selectedId);
  syncMore(cal);
  const hint = hintOf(cal);
  writeText(cal.hintText, hint);
  cal.hint.hidden = hint === '';
}

/** Make `id` the selection (null clears it). */
export function select(cal, id) {
  if (cal.state.selectedId === id) return;
  cal.state.selectedId = id;
  paint(cal);
}
