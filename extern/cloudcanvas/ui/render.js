/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * In-place render helpers, for a view the host redraws from its model: a
 * render writes only what moved, never takes a control out of the user's hands,
 * and reorders rows without rebuilding them.
 *
 *   const rows = rowCache({ create: buildRow, update: writeRow });
 *   const active = doc.activeElement;
 *   placeChildren(list, rows.sync(items));
 *   keepFocus(list, active);
 *
 * WHICH RECONCILER. `reconcileKeyedList` (`../addons/keyed-list.js`, exported by
 * the `cloudcanvas` entry) is the one for a single container whose elements are
 * the whole state: the key lives on the element. `rowCache` is for the two
 * cases that cannot be: a row that holds references beside its element (the
 * entry `create` returns), and a row that moves between containers - a card
 * changing lanes - and must arrive as the same node, with the caret and the
 * scroll position it had. The cache owns the entries; `placeChildren` puts
 * their nodes wherever the view wants them.
 */

/**
 * Write `value` into a field unless the user is in it: a focused control's
 * value is the user's until focus leaves, and the next render reads the model
 * again. An unchanged value is not written.
 * @param {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} control
 * @param {unknown} value null and undefined write the empty string
 * @returns {boolean} whether the value was written
 */
export function setValue(control, value) {
  const next = String(value ?? '');
  if (control.ownerDocument.activeElement === control || control.value === next) return false;
  control.value = next;
  return true;
}

/**
 * Name a control: `aria-label` for assistive technology and `title` for the
 * pointer, each written only when it moved.
 * @param {Element} node
 * @param {unknown} label null and undefined write the empty string
 * @returns {boolean} whether either attribute was written
 */
export function setLabel(node, label) {
  const next = String(label ?? '');
  let written = false;
  for (const name of ['aria-label', 'title']) {
    if (node.getAttribute(name) === next) continue;
    node.setAttribute(name, next);
    written = true;
  }
  return written;
}

/**
 * Show or hide a node through `hidden`, written only when it moved.
 * @param {HTMLElement} node
 * @param {unknown} visible truthy shows the node
 * @returns {boolean} whether `hidden` was written
 */
export function show(node, visible) {
  const hidden = !visible;
  if (node.hidden === hidden) return false;
  node.hidden = hidden;
  return true;
}

/**
 * Return focus to `active` - the element that had it before a reorder - when
 * the reorder took it: moving a node blurs whatever is focused inside it. Only a
 * control still inside `scope` is refocused; anything else is not this render's.
 * @param {Element} scope the region the render owns
 * @param {Element|null} active `document.activeElement`, read before the reorder
 * @returns {boolean} whether focus was moved
 */
export function keepFocus(scope, active) {
  if (!active || typeof active.focus !== 'function' || !scope.contains(active)) return false;
  if (active.ownerDocument.activeElement === active) return false;
  active.focus();
  return true;
}

/**
 * Make `container`'s children exactly `nodes`, in order. A node already in
 * place is not touched, so an unchanged row - and the focus inside it - stays
 * attached; a child that is not listed is removed.
 * @param {Element} container
 * @param {Node[]} nodes
 */
export function placeChildren(container, nodes) {
  nodes.forEach((node, index) => {
    const at = container.childNodes[index] ?? null;
    if (at !== node) container.insertBefore(node, at);
  });
  while (container.childNodes.length > nodes.length) container.lastChild.remove();
}

/** The entry for `item`: the one cached under `key`, or a new one that must carry its node. */
function entryFor(entries, create, item, key) {
  if (entries.has(key)) return entries.get(key);
  const entry = create(item);
  if (!entry?.node) throw new TypeError(`rowCache: create() returned no node for key "${key}"`);
  entries.set(key, entry);
  return entry;
}

/**
 * One persistent entry per key. `create(item)` builds an entry - any object
 * with its element as `node` - once; `update(entry, item)` writes the item into
 * it on every sync.
 * @param {{create: (item: any) => {node: Element}, update?: (entry: any, item: any) => void,
 *   key?: (item: any) => string}} [options] `key` defaults to the item's `id`
 * @returns {{sync(items: Iterable<any>): Element[], get(key: string): object|null}} `sync` returns the
 *   nodes in list order and forgets every key not listed; `get` is the entry for a key, or null
 */
export function rowCache({ create, update, key = (item) => item.id } = {}) {
  if (typeof create !== 'function') throw new TypeError('rowCache: create must be a function');
  const entries = new Map();
  return {
    sync(items) {
      const seen = new Set();
      const nodes = [];
      for (const item of items) {
        const id = String(key(item));
        if (seen.has(id)) throw new TypeError(`Duplicate row key: ${id}`);
        seen.add(id);
        const entry = entryFor(entries, create, item, id);
        update?.(entry, item);
        nodes.push(entry.node);
      }
      for (const id of [...entries.keys()]) if (!seen.has(id)) entries.delete(id);
      return nodes;
    },
    get: (id) => entries.get(String(id)) ?? null
  };
}
