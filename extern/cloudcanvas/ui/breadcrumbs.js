/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Breadcrumbs: an item's ancestors, root first, then the item itself.
 *
 *   const trail = createBreadcrumbs(host, { onOpen: (id) => open(id) });
 *   trail.update({ label: 'Folder path', items: [{ id: 'p', label: 'Projects' }], current: 'Plan' });
 *
 * A `<nav>` landmark over an ordered list. Each ancestor is a button that
 * reports `onOpen(id, item)` - `item` is the object the model gave; without an
 * `onOpen` the ancestors are text, because a button that opens nothing is a
 * lie. `current` closes the trail and carries `aria-current="page"`.
 *
 * A TRAIL NEVER PASSES FOR MORE THAN IT IS. One that was cut short
 * (`complete: false`) opens with an ellipsis whose meaning is spoken
 * (`moreLabel`); one that could not be read shows `message` in place of a
 * partial path; and with no ancestors there is no trail, so the landmark is
 * hidden. Entries are reconciled by id: a redraw keeps the crumb that has focus.
 */
import { SR_ONLY_CLASS, createLife, documentOf, el, textNode, uniqueItems, writeText } from './dom.js';
import { injectUiStyles } from './styles.js';
import { reconcileKeyedList } from '../addons/keyed-list.js';

const CLASS = 'cloudcanvas-ui-breadcrumbs';

/** The ancestors, each with a unique id and a label: a crumb with no words is a button with no name. */
function ancestorsOf(model) {
  const items = uniqueItems(model.items ?? [], 'breadcrumb');
  for (const item of items) {
    if (String(item.label ?? '').trim() === '') throw new TypeError(`A breadcrumb needs a label: ${item.id}`);
  }
  return items;
}

/** The trail's entries in order: what was cut, each ancestor, the current item - or the one message. */
function entriesOf(state) {
  if (state.message) return [{ kind: 'message', key: 'message', label: state.message }];
  if (state.items.length === 0) return [];
  const entries = state.items.map((item) => ({ kind: 'crumb', key: `crumb:${item.id}`, id: item.id, label: item.label }));
  if (!state.complete) entries.unshift({ kind: 'more', key: 'more', label: state.moreLabel });
  if (state.current) entries.push({ kind: 'current', key: 'current', label: state.current });
  return entries;
}

/**
 * The list item for one entry. Its kind is part of its key, so a node never
 * changes shape; `_uiText` is the text node a redraw rewrites.
 */
function entryNode(doc, entry, opens) {
  const node = el(doc, 'li', { className: `${CLASS}-item` });
  let holder = node;
  if (entry.kind === 'more') {
    node.append(el(doc, 'span', { text: '…', attrs: { 'aria-hidden': 'true' } }));
    holder = el(doc, 'span', { className: SR_ONLY_CLASS });
  } else if (entry.kind === 'crumb' && opens) {
    holder = el(doc, 'button', { className: `${CLASS}-open`, attrs: { type: 'button', 'data-ui-id': entry.id } });
  } else if (entry.kind === 'current') {
    node.setAttribute('aria-current', 'page');
  }
  if (holder !== node) node.append(holder);
  node._uiText = textNode(doc, holder);
  return node;
}

function writeModel(root, state, model) {
  state.items = ancestorsOf(model);
  state.current = String(model.current ?? '');
  state.complete = model.complete !== false;
  state.message = String(model.message ?? '');
  state.moreLabel = String(model.moreLabel ?? 'Earlier levels are not shown');
  root.setAttribute('aria-label', String(model.label ?? 'Breadcrumb'));
}

/**
 * @param {HTMLElement} host
 * @param {{onOpen?: (id: string, item: object) => void}} [callbacks]
 * @returns {{update(model: {label?: string, items?: Array<{id: string, label: string}>, current?: string,
 *   complete?: boolean, moreLabel?: string, message?: string}): void, destroy(): void}}
 */
export function createBreadcrumbs(host, { onOpen } = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const opens = typeof onOpen === 'function';
  const root = el(doc, 'nav', { className: CLASS, attrs: { hidden: true } });
  const list = el(doc, 'ol', { className: `${CLASS}-list` });
  root.append(list);
  host.append(root);
  const state = { items: [], current: '', complete: true, message: '', moreLabel: '' };
  if (opens) {
    life.on(list, 'click', (event) => {
      // The crumb's own class, and inside this list: a host that carries `data-ui-id` itself is not a crumb.
      const crumb = event.target.closest?.(`.${CLASS}-open`);
      if (!crumb || !list.contains(crumb)) return;
      const id = crumb.getAttribute('data-ui-id');
      onOpen(id, state.items.find((item) => item.id === id));
    });
  }
  return {
    update(model = {}) {
      if (life.dead) return;
      writeModel(root, state, model);
      const entries = entriesOf(state);
      root.hidden = entries.length === 0;
      reconcileKeyedList(list, entries, {
        key: (entry) => entry.key,
        create: (entry) => entryNode(doc, entry, opens),
        update: (node, entry) => writeText(node._uiText, entry.label)
      });
    },
    destroy() {
      if (life.destroy()) root.remove();
    }
  };
}
