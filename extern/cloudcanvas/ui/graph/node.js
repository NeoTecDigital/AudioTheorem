/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * A graph node's face: a `role="treeitem"` box, one size for every node, with
 * its whole title (two lines, then an ellipsis; the full title is its tooltip
 * and leads its name), a meta line - its status, its time as a `<time>`, and,
 * when it has children, their count, which is also the fold toggle - and a
 * link handle on its right edge.
 *
 * The node's name is everything a reader needs and the parts inside it are
 * hidden from assistive technology: the treeitem says whether it is open and
 * where it is in the tree, and the keys do what the toggle and the handle do
 * for a pointer (Space folds; linking is the host's menu).
 */
import { el } from '../dom.js';
import { NODE_HEIGHT, NODE_WIDTH } from './layout.js';

const PART = 'cloudcanvas-ui-graph';
export const NODE_CLASS = `${PART}-node`;
export const TOGGLE_CLASS = `${PART}-toggle`;
export const HANDLE_CLASS = `${PART}-handle`;

/** A node's element, empty: `writeNode` fills it. */
export function nodeElement(doc) {
  const node = el(doc, 'div', { className: NODE_CLASS, attrs: { role: 'treeitem', tabindex: '-1' } });
  const meta = el(doc, 'span', { className: `${PART}-node-meta`, attrs: { 'aria-hidden': 'true' } });
  meta.append(el(doc, 'span', { className: `${PART}-status` }), el(doc, 'time', { className: `${PART}-time` }),
    el(doc, 'span', { className: TOGGLE_CLASS }));
  node.append(el(doc, 'span', { className: `${PART}-node-label`, attrs: { 'aria-hidden': 'true' } }), meta,
    el(doc, 'span', { className: HANDLE_CLASS, attrs: { 'aria-hidden': 'true' } }));
  return node;
}

/** `phrase` with `{count}` filled in: "1 child", "3 children". */
function counted(labels, count) {
  return (count === 1 ? labels.child : labels.children).replace('{count}', String(count));
}

/** What a node's links say, grouped: what it depends on, what needs it, what it is related to. */
function relationsOf(g, id) {
  const name = (other) => g.byId.get(other)?.label ?? other;
  const groups = { dependsOn: [], neededBy: [], relatedTo: [] };
  for (const edge of g.state.edges) {
    if (edge.kind === 'parent' || (edge.from !== id && edge.to !== id)) continue;
    const other = edge.from === id ? edge.to : edge.from;
    if (edge.kind === 'related') groups.relatedTo.push(name(other));
    else groups[edge.from === id ? 'dependsOn' : 'neededBy'].push(name(other));
  }
  return Object.entries(groups).filter(([, names]) => names.length > 0).map(([phrase, names]) => `${g.labels[phrase]} ${names.join(', ')}`);
}

/** The node's whole name: its title, detail, status, time, children and links. */
export function describeNode(g, node, count) {
  const parts = [node.label, node.detail, node.status, node.time?.text, count > 0 ? counted(g.labels, count) : ''];
  return [...parts.filter(Boolean), ...relationsOf(g, node.id)].join('; ');
}

/** A chip that shows `value`, or hides when there is none. */
function writeChip(chip, value) {
  chip.textContent = value;
  chip.hidden = value === '';
}

function writeTime(element, time) {
  element.textContent = time?.text ?? '';
  element.hidden = !time;
  for (const [name, value] of [['datetime', time?.iso], ['title', time?.title]]) {
    if (value) element.setAttribute(name, value);
    else element.removeAttribute(name);
  }
}

function writeToggle(g, toggle, node, count) {
  writeChip(toggle, count > 0 ? String(count) : '');
  toggle.setAttribute('title', node.collapsed ? g.labels.expand : g.labels.collapse);
}

function writeTree(element, row, node, count) {
  element.setAttribute('aria-level', String(row.level));
  element.setAttribute('aria-posinset', String(row.position));
  element.setAttribute('aria-setsize', String(row.size));
  if (count > 0) element.setAttribute('aria-expanded', String(!node.collapsed));
  else element.removeAttribute('aria-expanded');
}

/** Put a node's element at `point`, at the size every node is. */
export function placeNode(element, point) {
  element.style.setProperty('--graph-x', `${point.x}px`);
  element.style.setProperty('--graph-y', `${point.y}px`);
  element.style.setProperty('width', `${NODE_WIDTH}px`);
  element.style.setProperty('height', `${NODE_HEIGHT}px`);
}

/** Fill a node's element from the model: its face, its name, its place in the tree and in the world. */
export function writeNode(g, element, row) {
  const node = g.byId.get(row.id);
  const count = g.countOf(row.id);
  const [label, meta, handle] = element.children;
  const [status, time, toggle] = meta.children;
  element.setAttribute('data-ui-id', node.id);
  element.setAttribute('title', node.label);
  element.setAttribute('aria-label', describeNode(g, node, count));
  writeTree(element, row, node, count);
  if (node.tone) element.setAttribute('data-tone', node.tone);
  else element.removeAttribute('data-tone');
  label.textContent = node.label;
  writeChip(status, node.status);
  writeTime(time, node.time);
  writeToggle(g, toggle, node, count);
  handle.setAttribute('title', g.labels.link);
  placeNode(element, g.positions.get(row.id));
}
