/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Parking: an element that leaves the document while its blit stays in the
 * tree leaves a Comment anchor in its place. The anchor keeps the element's
 * logical ancestry readable (`parentElementOf` walks through it) and its
 * position among its siblings, so the element returns to exactly where it was.
 * A blit's traits stop on the way out and run again on the way back
 * (`state.traits`, set by `../core/use.js` once it is indexed). A blit and
 * the blits inside it are (re)indexed under their current ids on the way out, so
 * their root still finds them.
 */
import { BLIT_ATTR, holdPlace, parkedStateOf, rootOf, stateOf } from '../core/state.js';
import { indexBlit } from '../core/root.js';

/** The record an anchor node holds a place for, or undefined for any other node (kept by the core). */
export { parkedStateOf };

/**
 * Take the element out, leaving an anchor where it was; its traits stop unless `keepTraits` (offload's
 * virtualisation keeps them). @returns {boolean} whether it moved
 */
export function park(state, keepTraits = false) {
  const element = state.el;
  if (state.anchor || !element.parentNode) return false;

  const root = rootOf(state);
  if (root) {
    for (const each of [element, ...element.querySelectorAll(`[${BLIT_ATTR}]`)]) indexBlit(root, each);
  }
  // Two plain moves rather than `replaceChild`: the same two writes the frame's
  // read/write discipline is observed at, so a park is never an invisible one.
  if (!keepTraits) state.traits?.(state, false);
  const anchor = element.ownerDocument.createComment(`blit ${element.id || ''}`);
  element.parentNode.insertBefore(anchor, element);
  element.parentNode.removeChild(element);
  state.anchor = anchor;
  holdPlace(anchor, state);
  return true;
}

/** Put the element back at its anchor. @returns {boolean} false when there was no live anchor */
export function unpark(state, keepTraits = false) {
  const anchor = state.anchor;
  if (!anchor) return false;

  state.anchor = null;
  holdPlace(anchor, null);
  if (!anchor.parentNode) return false;
  anchor.parentNode.insertBefore(state.el, anchor);
  anchor.parentNode.removeChild(anchor);
  if (!keepTraits) state.traits?.(state, true);
  return true;
}

/** Forget the anchor and take it out of the tree; the element stays where it is. */
export function dropAnchor(state) {
  const anchor = state.anchor;
  if (!anchor) return false;

  state.anchor = null;
  holdPlace(anchor, null);
  if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
  return true;
}

/**
 * Put the element in `container`: back at its anchor when the anchor is there,
 * otherwise appended (any anchor elsewhere is dropped).
 * @returns {boolean} whether the element moved
 */
export function place(state, container) {
  if (state.el.parentNode === container) return false;
  if (state.anchor && state.anchor.parentNode === container) return unpark(state);

  dropAnchor(state);
  container.appendChild(state.el);
  state.traits?.(state, true);
  return true;
}

/** Leave the tree entirely: the element out, and no anchor left behind. */
export function detach(state) {
  dropAnchor(state);
  if (!state.el.parentNode) return false;
  state.traits?.(state, false);
  state.el.parentNode.removeChild(state.el);
  return true;
}

/** The node standing for an element in its parent: the anchor while parked, else the element. */
export function nodeOf(element) {
  const state = stateOf(element);
  return state && state.anchor ? state.anchor : element;
}
