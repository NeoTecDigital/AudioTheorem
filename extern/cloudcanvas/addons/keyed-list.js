/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Keyed list: the one list reconciler, owned by the add-on side.
 *
 * The connect add-on and every widget that renders a list reconcile a
 * container's children against a keyed list; this is the single implementation.
 */

/**
 * The attribute `reconcileKeyedList` tags its children with.
 *
 * A data attribute rather than a WeakMap or an expando: the DOM is the state, so
 * a reconciled list survives anything that keeps the elements (a re-entrant
 * render, a detached-and-reattached subtree) and needs no parallel bookkeeping
 * to be torn down.
 */
export const KEY_ATTR = 'data-cc-key';

/**
 * The key of an item when the caller did not supply a reader: its own `id`, then
 * its own `key`, then its position - which makes an unkeyed list index-keyed,
 * the correct answer for a list that never reorders.
 */
function defaultKey(item, index) {
  if (item && typeof item === 'object') {
    if (item.id !== undefined && item.id !== null) return item.id;
    if (item.key !== undefined && item.key !== null) return item.key;
  }
  return index;
}

/** The first keyed child of `container`, skipping anything the caller owns. */
function firstKeyed(container) {
  let node = container.firstElementChild;
  while (node && !node.hasAttribute(KEY_ATTR)) node = node.nextElementSibling;
  return node;
}

/** The next keyed sibling after `node`, or null. */
function nextKeyed(node) {
  let next = node ? node.nextElementSibling : null;
  while (next && !next.hasAttribute(KEY_ATTR)) next = next.nextElementSibling;
  return next;
}

/**
 * Index the container's existing keyed children.
 * The first element wins a duplicated key; the rest become leftovers and are
 * removed, so a list with duplicate keys converges instead of growing.
 */
function indexByKey(container) {
  const existing = new Map();
  for (let node = firstKeyed(container); node; node = nextKeyed(node)) {
    const key = node.getAttribute(KEY_ATTR);
    if (!existing.has(key)) existing.set(key, node);
  }
  return existing;
}

/**
 * Reconcile a container's keyed children against `items`, in place.
 *
 * The list is DOM-as-state: the children carry their own keys, so there is no
 * shadow array to keep in sync and no state to lose when a widget re-renders. Each
 * pass reuses the element already holding an item's key, creates one only for a
 * key that is genuinely new, moves an element only when it is not already in the
 * right place, and removes what is left over.
 *
 * `items` is read, never written: no expando key is stamped onto an item and no
 * property is set, so a frozen array of frozen records reconciles exactly like a
 * mutable one. The key lives on the element, which is the thing the reconciler
 * actually owns.
 *
 * Children the caller built themselves (a header, a footer) are untouched:
 * only elements carrying `data-cc-key` participate. New elements land before the
 * next keyed sibling, or at the end of the container when the list grows.
 *
 * @param {Element} container parent of the keyed children
 * @param {Iterable<*>} items the desired list, in order
 * @param {object} options
 * @param {(item: *, index: number) => string|number} [options.key] key reader;
 *        defaults to `item.id`, then `item.key`, then the index
 * @param {(item: *, index: number) => Element} options.create builds the element
 *        for a new key; must return an Element
 * @param {(node: Element, item: *, index: number) => void} [options.update]
 *        writes an item into its element, on every pass
 * @returns {Element[]} the reconciled children, in list order
 */
export function reconcileKeyedList(container, items, options = {}) {
  if (!container || typeof container.insertBefore !== 'function') return [];
  if (typeof options.create !== 'function') {
    throw new TypeError('reconcileKeyedList: options.create must be a function');
  }

  const keyOf = typeof options.key === 'function' ? options.key : defaultKey;
  const update = typeof options.update === 'function' ? options.update : null;
  const existing = indexByKey(container);
  const nodes = [];
  let cursor = firstKeyed(container);
  let index = 0;

  for (const item of items || []) {
    const key = String(keyOf(item, index));
    const node = existing.get(key) || createKeyed(options.create, item, index, key);
    existing.delete(key);

    if (update) update(node, item, index);
    if (node === cursor) cursor = nextKeyed(cursor);
    else container.insertBefore(node, cursor);

    nodes.push(node);
    index += 1;
  }

  for (const leftover of existing.values()) leftover.remove();
  return nodes;
}

/** Build one new child and stamp its key; a factory that returns nothing is a bug. */
function createKeyed(create, item, index, key) {
  const node = create(item, index);
  if (!node || typeof node.setAttribute !== 'function') {
    throw new TypeError(`reconcileKeyedList: create() returned no element for key "${key}"`);
  }
  node.setAttribute(KEY_ATTR, key);
  return node;
}
