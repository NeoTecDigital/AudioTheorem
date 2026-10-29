/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The one line under the toolbar: what the selection can do, said from the
 * callbacks the host gave - a verb the host did not take is not offered. A
 * bar, a group heading, a selected link and nothing selected each have their
 * own; the words are the timeline's labels, so a host says them its own way.
 * Where the menu is comes before the keyboard's way to draw a span, which is
 * the line's last word (as the Logger's "/ searches" is its).
 * While a span is drawn by keyboard, the line says the keys of the step.
 */
import { drawHint } from './draw.js';

/** The verbs of a bar. */
function barVerbs(tl, item) {
  const { labels, callbacks: cb } = tl;
  const editable = Boolean(cb.onChange) && item.movable;
  return [cb.onActivate && labels.hintOpen, editable && labels.hintMove, editable && item.end && labels.hintResize,
    editable && labels.hintKeys, cb.onLink && labels.hintLink, cb.onDelete && labels.hintDelete, cb.onMenu && (tl.crowded === item.id ? labels.hintMoreHeld : labels.hintMore),
    cb.onCreate && labels.hintDraw];
}

/** The verbs of a group's heading. */
function groupVerbs(tl, groupId) {
  const { labels, callbacks: cb } = tl;
  const folds = Boolean(cb.onToggleGroup) && tl.groups.has(groupId);
  return [cb.onActivate && labels.hintOpen, cb.onAdd && labels.hintAdd, folds && labels.hintFold, cb.onMenu && labels.hintMore, cb.onCreate && labels.hintDraw];
}

/** What nothing selected says: how to begin, by pointer and by keyboard. */
function startVerbs(tl) {
  const { labels, callbacks: cb } = tl;
  return [labels.hintNone, cb.onCreate && labels.hintCreate, cb.onMenu && labels.hintMore, cb.onCreate && labels.hintDraw];
}

/** The hint for the timeline's selection, or '' when it has nothing to say. */
export function hintOf(tl) {
  const { selectedId } = tl.state;
  const drawing = drawHint(tl);
  if (drawing !== null) return drawing;
  let verbs = startVerbs(tl);
  if (tl.byId.has(selectedId)) verbs = barVerbs(tl, tl.byId.get(selectedId));
  else if (tl.groups.has(selectedId)) verbs = groupVerbs(tl, selectedId);
  return verbs.filter(Boolean).join(' · ');
}
