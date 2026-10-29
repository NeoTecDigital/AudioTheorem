/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * One panel of a menu: a `role="menu"` element and the rows in it - a button
 * per item, and a separator where an item asks for one. Rows are kept by id,
 * so a redraw writes what moved and never takes the item the user is on out of
 * the page. The menu itself (`../menu.js`) has two of these: the menu, and the
 * one submenu it can show.
 */
import { el, textNode, uniqueId, uniqueItems, writeText } from '../dom.js';
import { iconSlot, writeIcon } from '../icons.js';
import { placeChildren, rowCache } from '../render.js';

export const MENU_CLASS = 'cloudcanvas-ui-menu';

/** Matches an item's button, in either panel. */
export const MENU_ITEM = '[role="menuitem"]';

/** Whether `item` opens a submenu: it names items of its own. */
export function isParent(item) {
  return Array.isArray(item?.items) && item.items.length > 0;
}

/**
 * The model's items, checked before anything is drawn: ids are unique across
 * the menu and its submenus - a choice is reported by id alone - and a submenu
 * holds no submenu.
 * @param {Array<object>} items
 * @returns {Array<object>} `items`
 * @throws {TypeError}
 */
export function menuItems(items) {
  const nested = uniqueItems(items, 'menu').flatMap((item) => item.items ?? []);
  if (nested.some(isParent)) throw new TypeError('A menu has one level of submenu: an item inside one cannot have items of its own');
  uniqueItems([...items, ...nested], 'menu');
  return items;
}

/** The rows `items` make: each item, behind a separator where it asks for one and has an item to be separated from. */
function rowsOf(items) {
  return items.flatMap((item, index) => {
    const row = { key: `item:${item.id}`, item };
    return item.separatorBefore === true && index > 0 ? [{ key: `separator:${item.id}`, item: null }, row] : [row];
  });
}

/** Build one row: a separator, or an item's button with its label's text node. */
function buildRow(doc, row) {
  if (!row.item) return { node: el(doc, 'div', { className: `${MENU_CLASS}-separator`, attrs: { role: 'separator' } }) };
  const node = el(doc, 'button', { className: `${MENU_CLASS}-item`,
    attrs: { type: 'button', role: 'menuitem', tabindex: '-1', 'data-ui-id': row.item.id } });
  const slot = iconSlot(doc, `${MENU_CLASS}-icon`);
  const label = el(doc, 'span', { className: `${MENU_CLASS}-label` });
  node.append(slot, label);
  return { node, slot, text: textNode(doc, label) };
}

/** Say on `node` whether it opens a submenu. One that does starts shut; one that stays one keeps the state it has. */
function writeParent(node, parent) {
  if (!parent) {
    for (const name of ['aria-haspopup', 'aria-expanded', 'aria-controls']) node.removeAttribute(name);
    return;
  }
  node.setAttribute('aria-haspopup', 'menu');
  if (!node.hasAttribute('aria-expanded')) node.setAttribute('aria-expanded', 'false');
}

/** Write an item into its row. A separator has nothing to write. */
function writeRow(entry, { item }) {
  if (!item) return;
  writeText(entry.text, item.label ?? item.id);
  writeIcon(entry.slot, item.icon);
  if (item.title) entry.node.setAttribute('title', String(item.title));
  else entry.node.removeAttribute('title');
  entry.node.disabled = item.disabled === true;
  if (item.danger === true) entry.node.setAttribute('data-tone', 'danger');
  else entry.node.removeAttribute('data-tone');
  writeParent(entry.node, isParent(item));
}

/**
 * @param {Document} doc
 * @param {string} className
 * @returns {{node: HTMLElement, draw(label: unknown, items: Array<object>): void, item(id: string|null): HTMLButtonElement|null,
 *   reachable(): HTMLButtonElement[]}} `node` is the `role="menu"` element, which can take focus itself when it
 *   has no item that can; `draw` names it and redraws its rows in place; `item` is the button of an item, or null;
 *   `reachable` is the items the keys can move to - the enabled ones, in order
 */
export function createPanel(doc, className) {
  const node = el(doc, 'div', { className, attrs: { id: uniqueId(MENU_CLASS), role: 'menu', tabindex: '-1' } });
  const rows = rowCache({ key: (row) => row.key, create: (row) => buildRow(doc, row), update: writeRow });
  return {
    node,
    draw(label, items) {
      node.setAttribute('aria-label', String(label));
      placeChildren(node, rows.sync(rowsOf(items)));
    },
    item: (id) => rows.get(`item:${id}`)?.node ?? null,
    reachable: () => [...node.querySelectorAll(MENU_ITEM)].filter((item) => !item.disabled)
  };
}
