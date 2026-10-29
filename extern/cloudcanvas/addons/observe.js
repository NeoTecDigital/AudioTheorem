/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * observe: an opt-in MutationObserver on a root. A `[data-blit]` element an
 * author adds with plain DOM calls (`appendChild`, an `innerHTML` write) joins
 * the root - indexed, its named traits running - and one taken out is released:
 * its traits stop and it leaves the frame and the id index. A changed `id` is
 * re-indexed. Each microtask's batch of records is settled once, by every
 * element's final place, so a move is not a removal; a parked element
 * (`./park.js`) is not a removal either.
 *
 *   blit.use({ observe });      // then <div id="app" data-observe>
 *   const off = observe(blit('#app'));
 */
import { blit } from '../core/blit.js';
import { attachBlit, indexBlit, releaseBlits } from '../core/root.js';
import { BLIT_ATTR, isWithin, stateOf } from '../core/state.js';
import { parkedStateOf } from './park.js';

/** What the observer watches: the tree under the host, and ids. */
const OPTIONS = /* @__PURE__ */ Object.freeze({ childList: true, subtree: true, attributeFilter: ['id'] });

/**
 * Watch a root collection until the returned function is called. Also a trait:
 * `(b, opts, root) => off`, run on the host.
 * @param {import('../core/blit.js').Blit} b the root collection, `blit('#app')`
 * @returns {() => void} disconnect: pending records are dropped, nothing settles after it
 */
export function observe(b, _options, root = stateOf(b.el)?.root) {
  if (!root || root.host !== b.el) throw new TypeError("observe: expected a root collection, blit('#app')");

  const observer = new MutationObserver((records) => settle(root, records));
  observer.observe(root.host, OPTIONS);
  // Whatever an author put there since the root's own scan joins now.
  join(root, blitsIn(root.host));
  return () => {
    observer.takeRecords();
    observer.disconnect();
  };
}

/** One batch: what left is released, what arrived joins, what was renamed is re-indexed. */
function settle(root, records) {
  const added = [];
  const removed = [];
  const renamed = new Set();
  for (const record of records) {
    if (record.type === 'attributes') renamed.add(record.target);
    removed.push(...record.removedNodes);
    added.push(...record.addedNodes);
  }
  leave(root, removed);
  join(root, new Set(added.flatMap(blitsIn)));
  for (const element of renamed) {
    if (stateOf(element) && isWithin(root.host, element)) indexBlit(root, element);
  }
}

/**
 * Release every removed node that is out of the root: not moved within it, nor
 * parked in it. A parked blit whose anchor left with the node leaves too.
 */
function leave(root, nodes) {
  for (const node of nodes) {
    if (node.nodeType === 1 && !root.host.contains(node) && !isWithin(root.host, node)) releaseBlits(root, node);
    for (const parked of parkedIn(node)) {
      if (!isWithin(root.host, parked)) releaseBlits(root, parked);
    }
  }
}

/** The parked elements whose anchors are `node` or sit inside it. */
function parkedIn(node) {
  const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_COMMENT);
  const found = [];
  for (let each = node; each; each = walker.nextNode()) found.push(parkedStateOf(each)?.el);
  return found.filter(Boolean);
}

/** Every element, ancestors first, still under the host joins: a new one is adopted, a known one re-attached. */
function join(root, elements) {
  for (const element of elements) {
    const state = stateOf(element);
    if (element === root.host || !root.host.contains(element) || state?.anchor) continue;
    if (state) attachBlit(state);
    else blit(element);
  }
}

/** The `[data-blit]` elements in and under a node, in document order; none for a text or comment node. */
function blitsIn(node) {
  if (node.nodeType !== 1) return [];
  const inside = Array.from(node.querySelectorAll(`[${BLIT_ATTR}]`));
  return node.matches(`[${BLIT_ATTR}]`) ? [node, ...inside] : inside;
}
