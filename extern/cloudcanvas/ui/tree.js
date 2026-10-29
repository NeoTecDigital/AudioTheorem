/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Tree: a hierarchy the host owns, drawn as the rows that are open.
 *
 *   const tree = createTree(host, { onActivate: (id) => open(id), onToggle: (id, expanded) => setOpen(id, expanded) });
 *   tree.update({ label: 'Notebooks', expanded: ['w'], selectedId: 'p',
 *     items: [{ id: 'w', label: 'Work', count: 12 }, { id: 'p', parentId: 'w', label: 'Plan', tone: '2' }] });
 *
 * CONTROLLED. `expanded` and `selectedId` are the model's. Enter or a click
 * reports `onActivate(id)`; the twisty, Right and Left report
 * `onToggle(id, expanded)`; the tree then shows what the next model says. The
 * one thing it keeps is where the tab stop is.
 *
 * KEYS. One tab stop that roves: Up and Down move through the rows on show,
 * Home and End jump, Right opens a closed row or enters an open one, Left
 * closes an open row or goes to its parent, Enter activates. Rows are
 * `<button role="treeitem">`, so inside a canvas their keys and presses are
 * already a control's.
 *
 * THE LIST IS THE HOST'S DATA, so it is drawn whatever its shape: an item
 * whose parent is not in the list shows at the root, and a loop of parents is
 * cut at its first item. Only a repeated id is refused. `count` is shown beside
 * the label (zero is a count); `tone` is written as `data-tone` for the sheet.
 *
 * MOVE AND SEARCH. With `onMove`, a row dragged onto another row reports
 * `onMove(id, parentId)` (the row under the pointer is lit as the target; let
 * go anywhere else and nothing is asked); without it a row is never picked
 * up. A `query` in the model dims the rows whose label does not hold it, case
 * aside; a query that no item holds dims nothing and says so, in words, in a
 * polite live region beside the tree (`labels.noMatches`), for a screen reader as
 * for the eye. Both are reported or drawn, never applied: the rows stay the model's.
 *
 * A CUT LABEL IS SAID WHOLE. A row is one line, and a label that does not fit ends in an ellipsis; the row then carries the
 * whole label as its `title` (the tooltip), and a row whose label fits carries none. It is read where the rows are laid
 * out: after every update, and whenever the tree's own width changes (a pane opens beside it, a window is resized). The
 * label is also the row's text, so a screen reader reads it all; the title only says the same words to the eye.
 *
 * `badge` on an item is the kit badge (`./badge.js`) inside its row, between
 * the label and the count: the model the tabs and the nav bar take - a flag
 * too - or a bare number for the count. What it says is part of the row's
 * name, said once: its figure is the eye's alone. An item that names none has
 * none.
 */
import { syncBadge } from './badge.js';
import { createLife, documentOf, el, textNode, uniqueItems, writeText } from './dom.js';
import { trackDrag } from './drag.js';
import { matchesQuery, setDropTarget } from './graph/marks.js';
import { nextIndex, setTabStop } from './roving.js';
import { injectUiStyles } from './styles.js';
import { CONTROL_ATTR } from '../addons/trait.js';
import { reconcileKeyedList } from '../addons/keyed-list.js';

const CLASS = 'cloudcanvas-ui-tree';
const ROW = '[role="treeitem"]';

/** The tree's words; `{query}` is what was searched for. A host's own are given as `labels`. */
const TREE_LABELS = Object.freeze({ noMatches: 'Nothing matches “{query}”' });

/** Each item under the parent it names when that parent is in the list (and is not itself); `null` holds the roots. */
function childrenByParent(items) {
  const ids = new Set(items.map((item) => item.id));
  const children = new Map([[null, []]]);
  for (const item of items) {
    const named = item.parentId === null || item.parentId === undefined ? null : String(item.parentId);
    const parent = named !== null && named !== item.id && ids.has(named) ? named : null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(item);
  }
  return children;
}

/**
 * The forest every item appears in exactly once. Items no root leads to are in
 * a loop of parents (or hang below one): the first of them, in list order, is
 * moved to the root, which frees the rest.
 */
function forestOf(items) {
  const children = childrenByParent(items);
  const reached = new Set();
  const reach = (parentId) => {
    for (const item of children.get(parentId) ?? []) {
      reached.add(item.id);
      reach(item.id);
    }
  };
  reach(null);
  for (const item of items) {
    if (reached.has(item.id)) continue;
    const siblings = children.get(String(item.parentId));
    siblings.splice(siblings.indexOf(item), 1);
    children.get(null).push(item);
    reached.add(item.id);
    reach(item.id);
  }
  return children;
}

/** The rows on show, depth first: every root, and the children of each open row. */
function visibleRows(children, expanded) {
  const rows = [];
  const walk = (parentId, level) => {
    const siblings = children.get(parentId) ?? [];
    siblings.forEach((item, index) => {
      const hasChildren = (children.get(item.id) ?? []).length > 0;
      const open = hasChildren && expanded.has(item.id);
      rows.push({ id: item.id, item, parentId, level, position: index + 1, size: siblings.length, hasChildren, expanded: open });
      if (open) walk(item.id, level + 1);
    });
  };
  walk(null, 1);
  return rows;
}

/**
 * The row that holds the tab stop: the one that had it if it is still on show,
 * else its nearest ancestor that is, else the selected row, else the first.
 */
function tabStopId(state, children) {
  const parents = new Map();
  for (const [parentId, items] of children) for (const item of items) parents.set(item.id, parentId);
  const shown = new Set(state.rows.map((row) => row.id));
  for (let id = state.focusId; id !== null && id !== undefined; id = parents.get(id) ?? null) {
    if (shown.has(id)) return id;
  }
  return shown.has(state.selectedId) ? state.selectedId : state.rows[0]?.id ?? null;
}

/** Whether a search is typed: a blank one is none. */
const searched = (query) => query.trim() !== '';

function rowNode(doc) {
  const node = el(doc, 'button', { className: `${CLASS}-row`, attrs: { type: 'button', role: 'treeitem', tabindex: '-1' } });
  const label = el(doc, 'span', { className: `${CLASS}-label` });
  const count = el(doc, 'span', { className: `${CLASS}-count` });
  node.append(el(doc, 'span', { className: `${CLASS}-indent`, attrs: { 'aria-hidden': 'true' } }),
    el(doc, 'span', { className: `${CLASS}-twisty`, attrs: { 'aria-hidden': 'true' } }), label, count);
  node._uiText = { label: textNode(doc, label), count: textNode(doc, count) };
  node._uiLabel = label;
  node._uiBadge = null;
  return node;
}

/** The row's badge, kept across redraws (`syncBadge`): a new one is put before the count, which stays at the end of the row. */
function writeBadge(node, badge) {
  const had = node._uiBadge;
  node._uiBadge = syncBadge(had, node, badge);
  if (node._uiBadge && !had) node.insertBefore(node.lastChild, node._uiText.count.parentNode);
}

function writeRow(node, row, state) {
  const { item } = row;
  const counted = item.count !== undefined && item.count !== null;
  node.setAttribute('data-ui-id', row.id);
  node.setAttribute('aria-level', String(row.level));
  node.setAttribute('aria-posinset', String(row.position));
  node.setAttribute('aria-setsize', String(row.size));
  if (state.selectedId === null) node.removeAttribute('aria-selected');
  else node.setAttribute('aria-selected', String(row.id === state.selectedId));
  if (row.hasChildren) node.setAttribute('aria-expanded', String(row.expanded));
  else node.removeAttribute('aria-expanded');
  if (item.tone) node.setAttribute('data-tone', String(item.tone));
  else node.removeAttribute('data-tone');
  node.style.setProperty('--tree-level', String(row.level - 1));
  node.classList.toggle('is-unmatched', !state.nothingMatches && !matchesQuery(item.label ?? row.id, state.query));
  writeText(node._uiText.label, item.label ?? row.id);
  writeText(node._uiText.count, counted ? item.count : '');
  node._uiText.count.parentNode.hidden = !counted;
  writeBadge(node, item.badge);
}

/** End the badge of every row in `rows` that `root` no longer holds - a row that closed - or, given no root, of every row: the tree is gone. */
function dropBadges(rows, root = null) {
  for (const node of rows) {
    if (root !== null && node.parentNode === root) continue;
    node._uiBadge?.destroy();
    node._uiBadge = null;
  }
}

/** Whether the sheet cut a row's label: the text is wider than the room it has. A label with no layout (a test document) is not cut. */
const isCut = (node) => node._uiLabel.scrollWidth > node._uiLabel.clientWidth;

/**
 * Say the whole label as the row's `title` where it is cut, and nowhere else. Every row is measured before any is written, so the
 * rows are laid out once, not once for each.
 */
function titleCutLabels(root) {
  const rows = Array.from(root.querySelectorAll(ROW));
  const cut = rows.map(isCut);
  rows.forEach((node, at) => {
    if (cut[at]) node.setAttribute('title', node._uiLabel.textContent);
    else node.removeAttribute('title');
  });
}

/** Watch the tree's own width: a label is cut or not as the room changes, with no update. */
function watchWidth(tree) {
  const Observer = tree.doc.defaultView?.ResizeObserver;
  if (typeof Observer !== 'function') return;
  const observer = new Observer(() => { if (!tree.life.dead) titleCutLabels(tree.root); });
  observer.observe(tree.root);
  tree.life.add(() => observer.disconnect());
}

/** Give the row `id` the tab stop, and the focus when asked. */
function moveStop(tree, id, { focus }) {
  const nodes = Array.from(tree.root.querySelectorAll(ROW));
  const node = nodes.find((entry) => entry.getAttribute('data-ui-id') === id) ?? null;
  tree.state.focusId = id;
  setTabStop(nodes, node);
  if (focus) node?.focus();
}

/** Redraw the rows in place. Focus the redraw took from the tree (its row closed, or was moved) goes to the tab stop. */
function draw(tree) {
  const { doc, root, state } = tree;
  const had = root.contains(doc.activeElement);
  const before = Array.from(root.querySelectorAll(ROW));
  reconcileKeyedList(root, state.rows, {
    key: (row) => row.id,
    create: () => rowNode(doc),
    update: (node, row) => writeRow(node, row, state)
  });
  dropBadges(before, root);
  moveStop(tree, state.focusId, { focus: had && !root.contains(doc.activeElement) });
  titleCutLabels(root);
}

/** What `key` does on the row at `index`: move the focus, report a toggle, activate - or null when the key is not the tree's. */
function keyAction(key, index, rows) {
  const row = rows[index];
  if (key === 'Enter') return { activate: row.id };
  if (key === 'ArrowRight') {
    if (!row.hasChildren) return null;
    return row.expanded ? { focus: rows[index + 1].id } : { toggle: row.id, expanded: true };
  }
  if (key === 'ArrowLeft') {
    if (row.expanded) return { toggle: row.id, expanded: false };
    return row.parentId === null ? null : { focus: row.parentId };
  }
  const to = nextIndex(key, index, rows.length, { orientation: 'vertical' });
  return to === null ? null : { focus: rows[to].id };
}

function bindTree(tree) {
  const { root, state, callbacks } = tree;
  const rowOf = (event) => {
    const node = event.target.closest?.(ROW);
    const index = node && root.contains(node) ? state.rows.findIndex((row) => row.id === node.getAttribute('data-ui-id')) : -1;
    return index;
  };
  tree.life.on(root, 'keydown', (event) => {
    const index = rowOf(event);
    const action = index < 0 ? null : keyAction(event.key, index, state.rows);
    if (!action) return;
    event.preventDefault();
    if (action.focus !== undefined) moveStop(tree, action.focus, { focus: true });
    else if (action.toggle !== undefined) callbacks.onToggle?.(action.toggle, action.expanded);
    else callbacks.onActivate?.(action.activate);
  });
  tree.life.on(root, 'click', (event) => {
    const row = state.rows[rowOf(event)];
    if (!row) return;
    moveStop(tree, row.id, { focus: false });
    if (row.hasChildren && event.target.closest?.(`.${CLASS}-twisty`)) callbacks.onToggle?.(row.id, !row.expanded);
    else callbacks.onActivate?.(row.id);
  });
}

/**
 * A row dragged onto another asks for that row as its parent (`onMove(id, parentId)`): the row in hand is
 * marked, the row under the pointer lit, and a release anywhere else asks nothing.
 */
function bindMove(tree) {
  const { root, doc, callbacks } = tree;
  let drag = null;
  root.setAttribute('data-movable', '');
  trackDrag(tree.life, root, {
    selector: ROW,
    onStart(row) {
      drag = { id: row.getAttribute('data-ui-id'), row, target: null };
      row.classList.add('is-dragging');
    },
    onMove(point) {
      if (!drag) return;
      const hit = doc.elementFromPoint?.(point.x, point.y)?.closest?.(ROW) ?? null;
      setDropTarget(drag, hit && root.contains(hit) && hit !== drag.row ? hit : null);
    },
    onEnd(point) {
      if (!drag) return;
      const { id, row, target } = drag;
      setDropTarget(drag, null);
      drag = null;
      row.classList.remove('is-dragging');
      if (point && target) callbacks.onMove(id, target.getAttribute('data-ui-id'));
    }
  });
}

/**
 * @param {HTMLElement} host
 * @param {{onActivate?: (id: string) => void, onToggle?: (id: string, expanded: boolean) => void,
 *   onMove?: (id: string, parentId: string) => void, labels?: {noMatches?: string}}} [callbacks]
 * @returns {{update(model: {label?: string, items?: Array<{id: string, parentId?: string, label?: string, count?: number,
 *   badge?: number|object, tone?: string}>, expanded?: string[], selectedId?: string, query?: string}): void, destroy(): void}}
 */
export function createTree(host, callbacks = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  // A control (`data-cc-control`): the canvas under the page leaves this view's drags to it, so a host marks nothing.
  const root = el(doc, 'div', { className: CLASS, attrs: { role: 'tree', [CONTROL_ATTR]: true } });
  host.append(root);
  // A polite live region of its own beside the tree - a tree holds only its items - there before it says anything. It is no
  // `role="status"`: a host that looks for the first status of its own page must not find the tree's.
  const status = el(doc, 'p', { className: `${CLASS}-status`, attrs: { 'aria-live': 'polite' } });
  host.append(status);
  const labels = { ...TREE_LABELS, ...callbacks.labels };
  const tree = { doc, root, life, callbacks, state: { rows: [], focusId: null, selectedId: null, query: '', nothingMatches: false } };
  const statusText = textNode(doc, status);
  bindTree(tree);
  watchWidth(tree);
  if (typeof callbacks.onMove === 'function') bindMove(tree);
  return {
    update(model = {}) {
      if (life.dead) return;
      const children = forestOf(uniqueItems(model.items ?? [], 'tree'));
      const selectedId = model.selectedId ?? null;
      if (selectedId !== null && selectedId !== tree.state.selectedId) tree.state.focusId = selectedId;
      tree.state.selectedId = selectedId;
      tree.state.query = String(model.query ?? '');
      tree.state.nothingMatches = searched(tree.state.query) && !(model.items ?? []).some((item) => matchesQuery(item.label ?? item.id, tree.state.query));
      writeText(statusText, tree.state.nothingMatches ? labels.noMatches.replace('{query}', tree.state.query.trim()) : '');
      tree.state.rows = visibleRows(children, new Set((model.expanded ?? []).map(String)));
      tree.state.focusId = tabStopId(tree.state, children);
      root.setAttribute('aria-label', String(model.label ?? 'Tree'));
      draw(tree);
    },
    destroy() {
      if (!life.destroy()) return;
      dropBadges(Array.from(root.querySelectorAll(ROW)));
      root.remove();
      status.remove();
    }
  };
}
