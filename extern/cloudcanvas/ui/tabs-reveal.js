/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Bringing the active tab into view (`./tabs.js` owns the strip; this is the
 * part that scrolls it).
 *
 * WHEN. The strip scrolls when the active tab changes, and when the active
 * tab's layers do - a scope entered or left moves the tab along the strip. A
 * redraw that changes neither leaves the strip where the user put it.
 *
 * WHAT. The tab, to the end of its row - a close control is the far end of the
 * same tab - and the layer right behind it. When the two are wider than the
 * strip the tab is the one kept whole; a tab wider than the strip shows its
 * start, where its label is. The strip moves by the least that shows them.
 *
 * HOW. The strip scrolls itself (`scrollTo`), never `scrollIntoView`, which
 * would move every scroller around it and the page with them. It eases there,
 * unless the user asked for less motion, or it is the first tab the strip
 * shows and there is nowhere to ease from. A strip with no width is not laid
 * out yet: it is left for the next draw that finds it so.
 */
import { prefersReducedMotion } from '../addons/motion.js';

/** What decides whether the strip must show its active tab again: which tab that is, and the layers it stands in front of. */
function shownAs(state) {
  const item = state.items.find((entry) => entry.id === state.activeId);
  return item ? JSON.stringify([item.id, ...(item.layers ?? []).map((layer) => layer.id)]) : null;
}

/** How far a strip `width` wide must scroll to hold `[start, end]`, measured from its near edge: the least that does, the start winning when both cannot show. */
function shift(start, end, width) {
  if (start >= 0 && end <= width) return 0;
  return start < 0 || end - start > width ? start : end - width;
}

/** How far `root` must scroll to show the tab of `view` with its nearest layer, or the tab alone when the two are too wide. */
function shiftFor(root, view) {
  const edge = root.getBoundingClientRect().left;
  const width = root.clientWidth;
  const end = view.row.getBoundingClientRect().right - edge;
  const tab = view.tab.getBoundingClientRect().left - edge;
  const nearest = view.layers?.group.lastElementChild ?? null;
  const layer = nearest ? nearest.getBoundingClientRect().left - edge : tab;
  return shift(end - layer <= width ? layer : tab, end, width);
}

/**
 * The reveal for one strip.
 * @param {HTMLElement} root the strip, which is what scrolls
 * @param {Map<string, {row: HTMLElement, tab: HTMLElement, layers: {group: HTMLElement}|null}>} views the strip's tabs, by id
 * @returns {{sync(state: {items: object[], activeId: string|null}): void}} `sync` follows a redraw
 */
export function createReveal(root, views) {
  let shown;
  let eases = false;
  return {
    sync(state) {
      const next = shownAs(state);
      if (next === shown) return;
      const view = views.get(state.activeId);
      if (view && root.clientWidth <= 0) return;
      shown = next;
      if (!view) return;
      const by = shiftFor(root, view);
      if (by !== 0) root.scrollTo({ left: root.scrollLeft + by, behavior: eases && !prefersReducedMotion() ? 'smooth' : 'instant' });
      eases = true;
    }
  };
}
