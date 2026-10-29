/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The graph's "more" button (`../item-more.js`): one, inside the selected node, at its top right corner, drawn only
 * while the host takes a menu and no node is in hand. The node keeps the room for it (the sheet reserves it at the end
 * of a selected node's title), so it covers neither the title nor the link handle nor the fold toggle.
 */
import { MORE_CLASS, belowMore, isMore, moreButton, nameMore } from '../item-more.js';

const PART = 'cloudcanvas-ui-graph';

/** The element drawn for node `id`, or null. */
function elementOf(g, id) {
  return Array.from(g.nodeLayer.children).find((node) => node.getAttribute('data-ui-id') === id) ?? null;
}

/** Put the button on the selected node, or take it away: no menu to ask, nothing selected, or a node in hand. */
export function syncMore(g) {
  const id = g.state.selectedId;
  const node = id !== null && typeof g.callbacks.onMenu === 'function' && g.drag === null ? elementOf(g, id) : null;
  if (!node) {
    g.more?.remove();
    return;
  }
  g.more ??= moreButton(g.doc, `${PART}-more`);
  nameMore(g.more, g.labels.more, g.byId.get(id).label);
  if (g.more.parentElement !== node) node.append(g.more);
}

/** A press on the button: the menu of the node it stands on, under it. True when it was the button's. */
export function pressMore(g, target) {
  if (!isMore(target)) return false;
  const node = target.closest(`.${PART}-node`);
  g.callbacks.onMenu?.(node.getAttribute('data-ui-id'), belowMore(target.closest(`.${MORE_CLASS}`)));
  return true;
}
