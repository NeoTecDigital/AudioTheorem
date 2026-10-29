/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The graph's keys, on a focused node. The arrows walk the tree as an aria
 * tree does and the selection goes with them: Up and Down to the sibling
 * before or after, Right into the first child (a folded node is opened
 * instead), Left up to the parent (an open node is folded instead), Home and
 * End to the first and last node. Enter opens (`onActivate`), `+` or Insert
 * adds a child (`onAdd`), Delete or Backspace removes (`onDelete`), Space
 * folds or opens (`onToggle`), the menu key or Shift+F10 asks for the menu
 * under the node (`onMenu`), `/` goes to the search box and `0` fits. A verb
 * the host gave no callback for leaves its key to the host. Tab is never taken:
 * a widget whose focus roves must not trap the key that leaves it. The "more"
 * button inside the selected node (`./more.js`) is a button, and its keys are
 * its own.
 */
import { isMore } from '../item-more.js';
import { treeStep } from './layout.js';
import { NODE_CLASS } from './node.js';

const MOVES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

/** Fold or open node `id` when the host can and it has children; false when it cannot. */
function toggle(g, id, collapsed) {
  if (!g.callbacks.onToggle || g.countOf(id) === 0) return false;
  g.callbacks.onToggle(id, collapsed);
  return true;
}

/** An arrow, Home or End: fold, open or move along the tree. Always the graph's, even where there is nowhere to go. */
function moveKey(g, id, key) {
  const open = g.countOf(id) > 0 && !g.byId.get(id).collapsed;
  if (key === 'ArrowRight' && !open && toggle(g, id, false)) return;
  if (key === 'ArrowLeft' && open && toggle(g, id, true)) return;
  const next = treeStep(g.forest, g.rows, id, key);
  if (next !== null) g.select(next, { focus: true });
}

/** The menu under node `id`, where a menu opened from the keyboard is put. */
function menuPoint(element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom };
}

/** What a verb key does on node `id`: a call, or null when it is not the graph's. */
function verbOf(g, id, event, element) {
  const cb = g.callbacks;
  const menu = event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
  if (menu) return cb.onMenu ? () => cb.onMenu(id, menuPoint(element)) : null;
  if (event.key === 'Enter') return cb.onActivate ? () => cb.onActivate(id) : null;
  if (event.key === '+' || event.key === 'Insert') return cb.onAdd ? () => cb.onAdd(id) : null;
  if (event.key === 'Delete' || event.key === 'Backspace') return cb.onDelete ? () => cb.onDelete(id) : null;
  if (event.key === ' ') return cb.onToggle ? () => toggle(g, id, !g.byId.get(id).collapsed) : null;
  if (event.key === '/') return () => { g.search.focus(); g.search.select?.(); };
  if (event.key === '0') return () => g.fit({ report: true });
  return null;
}

/** Handle a key pressed on one of the graph's nodes. */
export function onGraphKey(g, event) {
  const element = event.target.closest?.(`.${NODE_CLASS}`);
  if (!element || !g.nodeLayer.contains(element) || isMore(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
  const id = element.getAttribute('data-ui-id');
  if (!g.byId.has(id)) return;
  if (MOVES.has(event.key)) {
    event.preventDefault();
    moveKey(g, id, event.key);
    return;
  }
  const verb = verbOf(g, id, event, element);
  if (!verb) return;
  event.preventDefault();
  verb();
}
