/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * What the graph and the tree mark the same way: whether an item's label
 * holds the search (what does not is dimmed), and the one item a drag is over
 * (lit as its drop target). The tree takes them from here, so the two cannot
 * drift apart.
 */

/** Whether `label` holds `query`, case aside; an empty query matches everything. */
export function matchesQuery(label, query) {
  const wanted = String(query ?? '').trim().toLowerCase();
  return wanted === '' || String(label).toLowerCase().includes(wanted);
}

/** Light `target` as the drop target of `drag` (`{target}`), and only it; null lights none. */
export function setDropTarget(drag, target) {
  if (target === drag.target) return;
  drag.target?.classList.remove('is-drop-target');
  target?.classList.add('is-drop-target');
  drag.target = target;
}
