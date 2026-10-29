// Written by Richard Christopher, Copyright 2026 NeoTec, LLC
/**
 * WHERE A NODE'S CHILDREN GO, for the kit's test document (`dom.js` joins these parts into a node).
 *
 * Every insertion here MOVES what it is given, as the real one does: the node leaves the parent it had
 * first, and a fragment's children go in its place, which also empties the fragment. That is what makes a
 * reconciliation observable as element identity.
 */

/** A document fragment's node type: a parent that is never itself in the tree. */
export const FRAGMENT = 11;

/**
 * What inserting `kid` puts in the tree: the node, or a fragment's children in
 * its place - which is also what empties the fragment, since each is detached
 * from it as it moves.
 * @param {any} kid @returns {any[]}
 */
function inserted(kid) {
  return kid.nodeType === FRAGMENT ? [...kid.childNodes] : [kid];
}

/**
 * A text node holding `value`: the installed document's, when there is one.
 * @param {unknown} value @returns {any}
 */
export function textNode(value) {
  return globalThis.document?.createTextNode(value) || { data: String(value), parentNode: null, childNodes: [] };
}

/**
 * What an insertion takes as a node: a node as it is, anything else as text.
 * @param {any} kid @returns {any}
 */
function asNode(kid) {
  return typeof kid === 'object' && kid !== null ? kid : textNode(kid);
}

/**
 * Putting a node into this one. An insertion MOVES what it is given: the node
 * leaves the parent it had first.
 * @param {any} node @returns {any}
 */
export function placing(node) {
  return {
    /** @param {any} kid */
    detach(kid) {
      if (!kid.parentNode) return;
      const at = kid.parentNode.childNodes.indexOf(kid);
      if (at >= 0) kid.parentNode.childNodes.splice(at, 1);
      kid.parentNode = null;
    },
    /** @param {...any} kids */
    append(...kids) {
      for (const kid of kids.flatMap(inserted)) {
        node.detach(kid);
        kid.parentNode = node;
        node.childNodes.push(kid);
      }
    },
    /**
     * Puts nodes (a string is a text node) before this one's first child, in the order given. Where they go
     * is fixed first, by the first child that is not itself being placed: a node that already is the first
     * child stays the first, and the nodes given are never put before themselves.
     * @param {...any} kids
     */
    prepend(...kids) {
      const placed = kids.map(asNode).flatMap(inserted);
      const before = node.childNodes.find((/** @type {any} */ kid) => !placed.includes(kid)) ?? null;
      for (const kid of placed) node.insertBefore(kid, before);
    },
    /** @param {any} kid */
    appendChild(kid) { node.append(kid); return kid; },
    /** @param {any} kid @param {any} before */
    insertBefore(kid, before) {
      if (before === null || before === undefined) { node.append(kid); return kid; }
      for (const one of inserted(kid)) {
        node.detach(one);
        one.parentNode = node;
        node.childNodes.splice(node.childNodes.indexOf(before), 0, one);
      }
      return kid;
    },
  };
}

/**
 * The sibling after `node` that is not one of `placed`, or null at the end:
 * where nodes placed beside it, or in its place, go before.
 * @param {any} node @param {any[]} placed @returns {any}
 */
function nextNotAmong(node, placed) {
  const kin = node.parentNode.childNodes;
  return kin.slice(kin.indexOf(node) + 1).find((/** @type {any} */ sibling) => !placed.includes(sibling)) ?? null;
}

/**
 * Placing beside a node, in its place, emptying one and taking one out.
 * @param {any} node @returns {any}
 */
export function replacing(node) {
  return {
    /**
     * Puts nodes right after this one in its parent, in the order given, each
     * moved as an insertion moves it. Where they go is fixed first, by the
     * next sibling that is not itself being placed; a node with no parent has
     * nowhere to put them.
     * @param {...any} kids
     */
    after(...kids) {
      const parent = node.parentNode;
      if (!parent) return;
      const placed = kids.flatMap(inserted), before = nextNotAmong(node, placed);
      for (const kid of placed) parent.insertBefore(kid, before);
    },
    /**
     * Puts nodes in this one's place in its parent, in the order given, and
     * takes this one out of the tree. The place is fixed first, as `after`
     * fixes it; a node with no parent has no place to give.
     * @param {...any} kids
     */
    replaceWith(...kids) {
      const parent = node.parentNode;
      if (!parent) return;
      const placed = kids.flatMap(inserted), before = nextNotAmong(node, placed);
      node.detach(node);
      for (const kid of placed) parent.insertBefore(kid, before);
    },
    /** Emptying a scroll container zeroes its position, both axes, and its ancestors'. */
    replaceChildren(/** @type {...any} */ ...kids) {
      for (const old of node.childNodes) old.parentNode = null;
      node.childNodes = [];
      for (/** @type {any} */ let at = node; at; at = at.parentNode) { at.scrollTop = 0; at.scrollLeft = 0; }
      node.append(...kids);
    },
    remove() { node.detach(node); },
  };
}
