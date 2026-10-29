/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Menu: a short list of commands that opens where it is asked for - a context
 * menu at a point, or a menu below the control that owns it.
 *
 *   const menu = createMenu(host, { onSelect: (id) => run(id), onClose: () => setOpen(false) });
 *   menu.update({ open: true, label: 'Tab actions', at: { x: event.clientX, y: event.clientY }, anchor: tab,
 *     items: [{ id: 'rename', label: 'Rename' }, { id: 'move', label: 'Move to', items: [{ id: 'left', label: 'Left' }] },
 *       { id: 'close', label: 'Close tab', danger: true, separatorBefore: true }] });
 *
 * A `role="menu"` of `menuitem` buttons, named by `label`. An item may be
 * `disabled`, may be `danger`, may ask for a separator before it, and may hold
 * `items` of its own: ONE LEVEL of submenu, no deeper. Ids are unique across
 * the menu and its submenus.
 *
 * A SECTION OF ITS OWN. A menu opens over the page, most often from the
 * document's body, where it is part of no section the page has. So the box
 * that holds it is one: a `role="region"` with the menu's name, there only
 * while the menu is open. Wherever a host mounts it, an open menu is inside a
 * landmark, as all of a page's content should be, and it is still a `menu`.
 *
 * IT OPENS BY THE MODEL AND CLOSES ITSELF. `open: true` shows it - at `at`
 * (client coordinates), else below `anchor`, else below what had focus - held
 * inside the visual viewport (`./menu/place.js`), and focus goes to its first
 * enabled item. It then closes on its own, and `onClose(reason)` says why:
 * 'select', 'escape', 'tab', 'outside' (a press anywhere but on the menu), or
 * 'update' (the model said closed, or left it nothing to offer). `destroy` is
 * not a close: it reports nothing. A press on the anchor is a press outside
 * too, and closes the menu as that press begins: a host whose anchor toggles
 * the menu must not open it again on the click the same press ends in.
 *
 * A CHOICE IS REPORTED ONCE, AFTER THE CLOSE. By the time `onSelect(id)` runs
 * the menu is off the page, focus is back and `onClose('select')` has been
 * heard, so a host that keeps `open` in its own state has already cleared it,
 * and whatever the choice opens next takes focus from where it belongs.
 *
 * THE KEYS. Up and Down, Home and End move among the enabled items and wrap.
 * Enter or Space chooses. Right, Enter or Space on an item with a submenu
 * opens it, and Left or Escape closes it back to that item. Escape closes the
 * menu, and so does Tab, which goes nowhere else. The pointer moves focus, so
 * there is one current item, not one for the hand and one for the keys.
 *
 * FOCUS GOES BACK. On close, focus the menu held returns to `anchor`, or with
 * none - or one that has left the page - to what had it before the menu
 * opened. Focus that is elsewhere by then is not the menu's to move.
 */
import { createLife, documentOf, el } from './dom.js';
import { MENU_CLASS, MENU_ITEM, createPanel, isParent, menuItems } from './menu/panel.js';
import { placeAt, placeBeside } from './menu/place.js';
import { keepFocus } from './render.js';
import { nextIndex } from './roving.js';
import { injectUiStyles } from './styles.js';

/**
 * The menu's nodes: a box that draws nothing, holding the menu's own panel and the panel of its one submenu, shut. The
 * box is the section the menu is, named by its panel, so it has the menu's name without a second copy to keep.
 */
function menuNodes(doc) {
  const panel = createPanel(doc, `${MENU_CLASS}-panel`);
  const root = el(doc, 'div', { className: MENU_CLASS, attrs: { hidden: true, role: 'region', 'aria-labelledby': panel.node.id, 'data-cc-control': true } });
  const flyout = createPanel(doc, `${MENU_CLASS}-panel is-submenu`);
  flyout.node.hidden = true;
  root.append(panel.node, flyout.node);
  return { root, panel, flyout };
}

/** Whether `node` can hold focus where it is: on the page, enabled, and not inside something hidden. */
function usable(node) {
  return Boolean(node?.isConnected) && node.disabled !== true && !node.closest('[hidden]');
}

/** Give `node` focus without scrolling: a menu is placed in the viewport, and the page behind it stays where it is. */
function giveFocus(node) {
  node?.focus({ preventScroll: true });
}

/** Whether `node` is an item that opens a submenu. */
function opensSub(node) {
  return node?.getAttribute('aria-haspopup') === 'menu';
}

/** Put focus on the first item of `panel` the keys can reach, or on the panel itself, so the keys are heard either way. */
function enter(panel) {
  giveFocus(panel.reachable()[0] ?? panel.node);
}

/** Where focus goes back to, and what the menu opens below when it is given no point: the anchor, else what had focus before. */
function origin(state) {
  return [state.anchor, state.previous].find((node) => node?.isConnected && typeof node.focus === 'function') ?? null;
}

/** Shut the submenu and return the item it hung from, if that is still there. */
function shutSub({ nodes, state }) {
  const parent = nodes.panel.item(state.sub);
  state.sub = null;
  nodes.flyout.node.hidden = true;
  parent?.setAttribute('aria-expanded', 'false');
  return parent;
}

/** Close the submenu: focus it held goes back to the item it hung from. */
function closeSub(menu) {
  const held = menu.nodes.flyout.node.contains(menu.doc.activeElement);
  const parent = shutSub(menu);
  if (held) giveFocus(parent);
}

/** Draw the open submenu from its item and put it beside that item. */
function drawSub({ nodes, state }) {
  const item = state.items.find((entry) => entry.id === state.sub);
  const parent = nodes.panel.item(item.id);
  nodes.flyout.draw(item.label ?? item.id, item.items);
  nodes.flyout.node.hidden = false;
  parent.setAttribute('aria-expanded', 'true');
  parent.setAttribute('aria-controls', nodes.flyout.node.id);
  placeBeside(nodes.flyout.node, parent);
}

/** Open the submenu of the item `id`, in place of any other, with focus on its first item. */
function openSub(menu, id) {
  if (menu.state.sub !== null) shutSub(menu);
  menu.state.sub = id;
  drawSub(menu);
  enter(menu.nodes.flyout);
}

/**
 * Take the menu off the page. Its press listener ends with the opening, and
 * focus the menu held goes back where it came from.
 */
function hide(menu) {
  const { doc, nodes, state } = menu;
  const held = nodes.root.contains(doc.activeElement);
  const back = origin(state);
  if (state.sub !== null) shutSub(menu);
  state.opening.destroy();
  Object.assign(state, { open: false, opening: null, anchor: null, previous: null });
  nodes.root.hidden = true;
  if (held) giveFocus(back);
}

/** Close, say why, and - when the close is a choice - report it last, to a host that already knows the menu is gone. */
function close(menu, reason, chosen) {
  hide(menu);
  menu.callbacks.onClose?.(reason);
  if (chosen !== undefined) menu.callbacks.onSelect?.(chosen);
}

/**
 * Put the menu on the page. For as long as it is open, a press anywhere but on
 * it closes it: heard on the way down, so nothing under the press can keep it
 * from the menu.
 */
function show(menu) {
  const { doc, nodes, state } = menu;
  // Focus resting on the page itself is focus nowhere: there is nothing there to go back to, or to open below.
  const previous = doc.activeElement === doc.body ? null : doc.activeElement;
  Object.assign(state, { open: true, previous, opening: createLife() });
  nodes.root.hidden = false;
  state.opening.on(doc, 'pointerdown', (event) => {
    if (!nodes.root.contains(event.target)) close(menu, 'outside');
  }, { capture: true });
}

/**
 * Leave focus right after a redraw. `held` is what had it inside the menu
 * before: none, and focus is not the menu's to move. A reorder that took it
 * gives it back; when its item went, or can no longer be chosen, the first
 * enabled item of the panel in front takes it.
 */
function refocus(menu, held) {
  const { doc, nodes, state } = menu;
  if (!held) return;
  if (usable(held) && keepFocus(nodes.root, held)) return;
  if (nodes.root.contains(doc.activeElement) && usable(doc.activeElement)) return;
  enter(state.sub === null ? nodes.panel : nodes.flyout);
}

/** Draw `model` on an open menu, or open it with `model`: rows in place, panels placed, focus where it belongs. */
function draw(menu, model, items) {
  const { doc, nodes, state } = menu;
  const opening = !state.open;
  if (opening) show(menu);
  const parent = items.find((item) => item.id === state.sub);
  // A submenu whose item went, was disabled, or has no items any more closes first, while that item can still take its focus.
  if (state.sub !== null && !(isParent(parent) && parent.disabled !== true)) closeSub(menu);
  const held = nodes.root.contains(doc.activeElement) ? doc.activeElement : null;
  state.items = items;
  state.anchor = model.anchor ?? null;
  nodes.panel.draw(model.label ?? 'Menu', items);
  placeAt(nodes.panel.node, model.at, origin(state));
  if (state.sub !== null) drawSub(menu);
  if (opening) enter(nodes.panel);
  else refocus(menu, held);
}

/** Enter, Space or a press on an item: one with a submenu opens it - or shuts it when it is open - and any other is the choice. */
function activate(menu, node) {
  const id = node.getAttribute('data-ui-id');
  if (!opensSub(node)) close(menu, 'select', id);
  else if (menu.state.sub === id) closeSub(menu);
  else openSub(menu, id);
}

/** Move focus among the items of `panel` the keys can reach. Returns whether `key` moved it. */
function move(panel, from, key) {
  const items = panel.reachable();
  const to = nextIndex(key, items.indexOf(from), items.length, { orientation: 'vertical', wrap: true });
  if (to === null) return false;
  giveFocus(items[to]);
  return true;
}

/** The enabled item `event` happened on, or null: a disabled item, like the space between items, answers nothing. */
function itemOf(event) {
  const item = event.target.closest?.(MENU_ITEM) ?? null;
  return item && !item.disabled ? item : null;
}

/** Answer a key pressed in the menu. Returns whether it was the menu's, and so goes no further. */
function onKey(menu, event) {
  const { panel, flyout } = menu.nodes;
  const { key } = event;
  const inSub = flyout.node.contains(event.target);
  const item = itemOf(event);
  if (key === 'Tab') close(menu, 'tab');
  else if (inSub && (key === 'Escape' || key === 'ArrowLeft')) closeSub(menu);
  else if (key === 'Escape') close(menu, 'escape');
  else if (key === 'ArrowRight' && opensSub(item)) openSub(menu, item.getAttribute('data-ui-id'));
  else if (item && (key === 'Enter' || key === ' ')) activate(menu, item);
  else return move(inSub ? flyout : panel, item, key);
  return true;
}

/** Hear the menu's own keys, presses and pointer, all on its own box, and only while it is open. */
function bindMenu(life, menu) {
  const { nodes, state } = menu;
  life.on(nodes.root, 'keydown', (event) => {
    if (!state.open || !onKey(menu, event)) return;
    event.preventDefault();
    event.stopPropagation();
  });
  life.on(nodes.root, 'click', (event) => {
    const item = itemOf(event);
    if (state.open && item) activate(menu, item);
  });
  // Behind an open submenu the pointer only passes: focus stays in the submenu until a press says otherwise.
  life.on(nodes.root, 'pointerover', (event) => {
    const item = itemOf(event);
    if (!state.open || !item || (state.sub !== null && nodes.panel.node.contains(item))) return;
    giveFocus(item);
  });
}

/**
 * @param {HTMLElement} host where the menu is mounted; its panels are placed in the viewport, not in the host's flow
 * @param {{onSelect?: (id: string) => void, onClose?: (reason: 'select'|'escape'|'outside'|'tab'|'update') => void}} [callbacks]
 * @returns {{update(model: {open?: boolean, label?: string, at?: {x: number, y: number}, anchor?: Element|null,
 *   items?: Array<{id: string, label?: string, icon?: string|Element, title?: string, disabled?: boolean, danger?: boolean, separatorBefore?: boolean,
 *   items?: Array<{id: string, label?: string, icon?: string|Element, title?: string, disabled?: boolean, danger?: boolean, separatorBefore?: boolean}>}>}): void,
 *   destroy(): void}}
 */
export function createMenu(host, { onSelect, onClose } = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const nodes = menuNodes(doc);
  host.append(nodes.root);
  const state = { open: false, items: [], sub: null, anchor: null, previous: null, opening: null };
  const menu = { doc, nodes, state, callbacks: { onSelect, onClose } };
  bindMenu(life, menu);
  return {
    update(model = {}) {
      if (life.dead) return;
      const items = model.open ? menuItems(model.items ?? []) : [];
      if (items.length > 0) draw(menu, model, items);
      else if (state.open) close(menu, 'update');
    },
    destroy() {
      if (life.dead) return;
      if (state.open) hide(menu);
      life.destroy();
      nodes.root.remove();
    }
  };
}
