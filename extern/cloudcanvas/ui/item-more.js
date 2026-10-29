/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The "more" button of the item views (graph, timeline, calendar).
 *
 * An item's menu - Link to, Move to, Unlink, Set status, Remind me, View in, Collapse - was reached by a right-click,
 * Shift+F10 or a long press, and nothing on the screen said so: a reader who was never told never found it. The
 * selected item now wears one button, the kit's ellipsis, named "More actions for <title>", that asks for the very
 * menu those gestures ask for (`onMenu(id, point)`), the point under the button as the menu key's is under its item.
 *
 * ONE BUTTON PER VIEW, moved to the selected item and drawn only while the host takes a menu and nothing is in hand
 * (a drag or a pick-up), and only where the item has room for it: never more than a third of the item's width, so a
 * title is never left with none (`roomForMore`; the menu is still the right-click, Shift+F10 and the held touch, and the
 * hint says so). It is a button of its own beside the item (inside it only where the item is no button), so the item is
 * never a button holding a button; it stands in the tab order straight after its item, and it is no part of the item: a
 * press on it opens nothing and starts no drag, and the item's own keys do not hear it. Where it stands is the view's
 * sheet: each view's own rules place it where it covers neither the title nor a handle.
 */
import { el } from './dom.js';
import { createIcon } from './icons.js';

/** The class every view's button carries. */
export const MORE_CLASS = 'cloudcanvas-ui-item-more';

/** The words a name is made of, `{title}` filled in. */
export const MORE_WORDS = 'More actions for {title}';

/** What a hint says of the menu when the item has no button for it (`roomForMore`): the ways there still are, the touch one first. */
export const MORE_HELD_WORDS = 'Touch and hold, Shift+F10 or right-click for more';

/** The share of an item its button may take: a third. */
const MORE_SHARE = 3;

/**
 * Whether an item `itemWidth` wide has room for a button `buttonWidth` wide: the button takes a third of it at most, so what is
 * left holds the title. An item with no width measured (0: nothing is laid out, or it is not in the page yet) is given the
 * button as it always was.
 */
export function roomForMore(itemWidth, buttonWidth) {
  return !(itemWidth > 0 && buttonWidth * MORE_SHARE > itemWidth);
}

/** The button, empty of a name: `nameMore` gives it one. `className` is the view's own, which places it. */
export function moreButton(doc, className) {
  const node = el(doc, 'button', { className: `${MORE_CLASS} ${className}`, attrs: { type: 'button' } });
  node.append(createIcon(doc, 'more'));
  return node;
}

/** Name `node` for the item it is on: its accessible name and its tooltip. */
export function nameMore(node, words, title) {
  const name = words.replace('{title}', title);
  node.setAttribute('aria-label', name);
  node.setAttribute('title', name);
}

/** Whether `target` is, or is inside, a view's "more" button. */
export function isMore(target) {
  return Boolean(target?.closest?.(`.${MORE_CLASS}`));
}

/** Where the menu a "more" button asks for opens: under the button's start edge. */
export function belowMore(node) {
  const rect = node.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom };
}
