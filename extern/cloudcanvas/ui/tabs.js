/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Tabs: an ARIA tablist with one tab stop, drawn as a quiet row of underlined
 * tabs or as a row of folder tabs, with optional close buttons, a pinned tab,
 * the parent scopes behind each tab, and tabs the user can move.
 *
 *   const tabs = createTabs(host, { face: 'folder', onSelect: (id) => show(id), onClose: (id) => drop(id),
 *     onLayer: (id, layer) => up(id, layer), onReorder: (id, beforeId) => move(id, beforeId) });
 *   tabs.update({ label: 'Views', activeId: 'today', items: [{ id: 'home', label: 'Home', pinned: true },
 *     { id: 'today', label: 'Today', closable: true, layers: [{ id: 'work', label: 'Work' }] }] });
 *
 * Arrows (and Home/End) rove; with `activation: 'auto'` (the default) the tab
 * that receives focus is selected, with 'manual' Enter or Space selects it.
 * Delete closes a closable tab. Close buttons sit beside their tab (a button
 * inside a tab is invalid ARIA) and are skipped by Tab: Delete is their keyboard
 * path. The labelled tablist owns its ordered tabs through `aria-owns`, outside
 * the visual rows so close buttons are not tablist children. `panelId` on an
 * item becomes the tab's `aria-controls`. In the page a close button is beside
 * its tab; the sheet stands it inside the tab's face, and it says which tab it
 * belongs to (`itemIdOf`).
 *
 * THE LOOK IS A CHOICE, made once: `face`, beside the callbacks. `'line'`, the
 * default, is the quiet strip for a row of tabs inside a page - a label, and a
 * line under the tab that is selected. `'folder'` is the row of folder tabs a
 * host's contexts live in: every tab a folder, the active one in front, each
 * tab's layers stacked behind it. The strip says which it wears (`data-face`),
 * and `./css/tabs.js` draws both. Either way the row of the active tab carries
 * `is-active`, and layers work: on a line strip they are read in line.
 *
 * A LABEL has an element of its own, first in its tab and whole; the sheet cuts
 * a long one there with an ellipsis, badge or no badge. The pointer gets it
 * whole in a `title`: the tab's, or - where a badge makes the tab's name say
 * more than its label - the label's own, so nothing is said twice.
 *
 * `icon` on an item is a mark before its label - a kit icon name (`./icons.js`) or an element of the host's own,
 * drawn once and kept across redraws - hidden from assistive technology, so the tab's name is its label (and its
 * badge) and nothing more. An item that names none has no slot for one: its label is first in its tab.
 *
 * `badge` on an item is the kit badge (`./badge.js`) inside its tab, after the
 * label: the model the nav bar takes, or a bare number for the count. What it
 * says is part of the tab's name. An item that names none has none.
 *
 * `activeId: null` selects nothing: every tab is `aria-selected="false"`, and
 * the tab stop rests on the first tab that can take focus, so the list is
 * still one Tab away. When the active tab changes, or its layers do, the strip
 * scrolls it into view (`./tabs-reveal.js`).
 *
 * `pinned: true` on an item marks its tab `data-pinned="true"`, which the sheet
 * draws quietly, and takes its close control off the page, `closable` or not:
 * Delete does not close it either. The strip does not move a pinned tab; the
 * order is the model's.
 *
 * `layers` on an item are the parent scopes its tab stands in front of,
 * outermost first: buttons beside the tab (`./tabs-layers.js`), at most three,
 * the rest folded into a menu, drawn as folder tabs stacked behind it. A press
 * on one reports `onLayer(tabId, layerId)` and selects nothing: going up is
 * the host's to answer. A strip with any stack carries `data-layered`.
 *
 * `onReorder(id, beforeId | null)` makes the tabs movable (`./tabs-reorder.js`):
 * a drag shows where a tab would land and a drop reports it, and so do
 * Alt+ArrowLeft and Alt+ArrowRight. A pinned tab does not move and nothing
 * lands before one. The strip moves nothing itself: the caller answers with
 * the model in its new order.
 *
 * A REDRAW KEEPS FOCUS. A tab or a layer the model still names stays where it
 * is, so focus on it is never lost, and a reorder hands focus back to what had
 * it. Focus on something that went - a layer, a fold, a close control - moves
 * to the tab it stood beside, and with that tab gone too, to the tab stop.
 */
import { syncBadge } from './badge.js';
import { createLife, documentOf, el, SR_ONLY_CLASS, textNode, uniqueId, uniqueItems, writeText } from './dom.js';
import { ICON_NAMES, iconSlot, writeIcon } from './icons.js';
import { keepFocus, placeChildren } from './render.js';
import { nextIndex, setTabStop } from './roving.js';
import { injectUiStyles } from './styles.js';
import { createFold, layersOf, writeLayers } from './tabs-layers.js';
import { createReorder } from './tabs-reorder.js';
import { createReveal } from './tabs-reveal.js';

const CLASS = 'cloudcanvas-ui-tabs';

/** The faces a strip can wear, the first being the one it wears unasked. */
const FACES = /* @__PURE__ */ Object.freeze(['line', 'folder']);

/**
 * The face a strip was asked for, checked before anything is mounted.
 * @param {unknown} face `'line'`, `'folder'`, or nothing (undefined or null) for the default
 * @returns {'line'|'folder'}
 * @throws {TypeError} for anything else: a strip does not guess a look
 */
function faceOf(face) {
  const asked = face ?? FACES[0];
  if (!FACES.includes(asked)) throw new TypeError(`A tab strip's face is 'line' or 'folder', not ${String(asked)}`);
  return asked;
}

/** One tab's nodes: its row, the tab with its label in an element of its own (`label` is that element's text), and the close control beside it. */
function tabView(doc) {
  const row = el(doc, 'div', { className: `${CLASS}-item`, attrs: { role: 'presentation' } });
  const tab = el(doc, 'button', { className: `${CLASS}-tab`, attrs: { id: uniqueId('ui-tab'), role: 'tab', type: 'button' } });
  const name = el(doc, 'span', { className: `${CLASS}-label` });
  tab.append(name);
  const close = el(doc, 'button', { className: `${CLASS}-close`, text: '×', attrs: { type: 'button', tabindex: '-1' } });
  row.append(tab, close);
  return { row, tab, name, label: textNode(doc, name), close, icon: null, badge: null, layers: null };
}

/** The tab's icon: a slot before the label while the item names one, none at all when it does not, so a tab without an icon starts with its label. */
function writeTabIcon(doc, view, source) {
  if (source === undefined || source === null || source === '') {
    view.icon?.remove();
    return;
  }
  view.icon ??= iconSlot(doc, `${CLASS}-icon`);
  writeIcon(view.icon, source);
  if (view.icon.parentNode !== view.tab) view.tab.prepend(view.icon);
}

/** Whether `item`'s tab can be closed: it says so, and it is not pinned. */
function closes(item) {
  return item?.closable === true && item.pinned !== true;
}

/**
 * The close control is beside its tab, shown when the tab can be closed; a
 * pinned tab has none on the page at all. The row says which it is, so the
 * sheet can keep room for the control inside the tab's face, and the control
 * says which tab it is a part of.
 */
function writeClose(view, item, closeLabel) {
  view.close.setAttribute('data-ui-close', item.id);
  view.close.setAttribute('data-ui-for', item.id);
  view.close.setAttribute('aria-label', `${closeLabel} ${String(item.label)}`);
  view.close.hidden = !closes(item);
  view.row.classList.toggle('is-closable', closes(item));
  if (item.pinned === true) view.close.remove();
  else if (view.close.parentNode !== view.row) view.row.append(view.close);
}

/** The tab's badge, kept across redraws (`syncBadge`); the tab says whether it holds one, so the sheet can lay the two side by side. */
function writeBadge(view, badge) {
  view.badge = syncBadge(view.badge, view.tab, badge);
  view.tab.classList.toggle('is-badged', view.badge !== null);
}

/** Say `text` in `node`'s title, or - given null - say nothing there. */
function writeTitle(node, text) {
  if (text === null) node.removeAttribute('title');
  else node.title = text;
}

/**
 * The tab's label: its own text, whole, and whole again for the pointer where
 * the sheet may cut it - in the tab's title, or in the label's own when a badge
 * makes the tab's name more than its label.
 */
function writeLabel(view, item) {
  const whole = String(item.label ?? '');
  writeText(view.label, whole);
  writeTitle(view.tab, view.badge === null ? whole : null);
  writeTitle(view.name, view.badge === null ? null : whole);
}

function writeTab(doc, view, item, state) {
  const active = item.id === state.activeId;
  view.tab.setAttribute('data-ui-id', item.id);
  view.tab.setAttribute('aria-selected', String(active));
  view.row.classList.toggle('is-active', active);
  if (item.panelId) view.tab.setAttribute('aria-controls', String(item.panelId));
  else view.tab.removeAttribute('aria-controls');
  if (item.pinned === true) view.tab.setAttribute('data-pinned', 'true');
  else view.tab.removeAttribute('data-pinned');
  view.tab.disabled = item.disabled === true;
  writeTabIcon(doc, view, item.icon);
  writeBadge(view, item.badge);
  writeLabel(view, item);
  writeClose(view, item, state.closeLabel);
  writeLayers(doc, view, item, active);
}

/** Take a tab out: its badge ends with it. */
function dropTab(views, id) {
  const view = views.get(id);
  view.badge?.destroy();
  view.row.remove();
  views.delete(id);
}

function selectable(state) {
  return state.items.filter((item) => item.disabled !== true);
}

/** Where the tab stop rests when the keys have not placed it: the selected tab, or - with none selected - the first that can take focus. */
function restingId(state) {
  const active = state.items.find((item) => item.id === state.activeId);
  return (active ?? selectable(state)[0] ?? state.items[0])?.id ?? null;
}

function render(root, doc, views, state) {
  const keep = new Set(state.items.map((item) => item.id));
  for (const id of [...views.keys()]) if (!keep.has(id)) dropTab(views, id);
  // A strip says whether any of its tabs has a stack. The sheet draws the same folders either way.
  if (state.items.some((item) => (item.layers ?? []).length > 0)) root.setAttribute('data-layered', 'true');
  else root.removeAttribute('data-layered');
  placeChildren(root, state.items.map((item) => {
    if (!views.has(item.id)) views.set(item.id, tabView(doc));
    const view = views.get(item.id);
    writeTab(doc, view, item, state);
    return view.row;
  }));
  if (!views.has(state.focusId)) state.focusId = restingId(state);
  setTabStop([...views.values()].map((view) => view.tab), views.get(state.focusId)?.tab ?? null);
}

/**
 * What has focus inside the tabs before a redraw, and the tab it stands
 * beside. Focus in the fold's menu counts as focus on the fold: that is where
 * the menu gives it back to.
 */
function heldBefore(root, doc, fold) {
  const active = doc.activeElement;
  const inMenu = fold.holds(active);
  const inStrip = root.contains(active) ? active : null;
  const node = inMenu ? fold.button() : inStrip;
  const beside = node?.closest(`.${CLASS}-item`)?.querySelector('[role="tab"]') ?? null;
  return { node, inMenu, tabId: beside?.getAttribute('data-ui-id') ?? null };
}

/**
 * Put focus right after a redraw. What held it and is still there gets it
 * back if a reorder took it. What held it and went - a layer, a fold, a close
 * control - hands it to the tab it stood beside, which takes the tab stop too,
 * so focus and the stop stay together; with that tab gone, or disabled, focus
 * goes to the tab stop. Focus outside the tabs is not theirs, and focus in a
 * menu that is still open is the menu's.
 */
function restoreFocus(root, views, state, fold, held) {
  if (!held.node || (held.inMenu && fold.open)) return;
  if (root.contains(held.node)) {
    keepFocus(root, held.node);
    return;
  }
  const beside = views.get(held.tabId)?.tab;
  if (beside && !beside.disabled) {
    state.focusId = held.tabId;
    setTabStop([...views.values()].map((view) => view.tab), beside);
  }
  views.get(state.focusId)?.tab.focus();
}

function ownTabs(list, views, state, label) {
  const ids = state.items.map((item) => views.get(item.id).tab.id);
  list.setAttribute('aria-label', label);
  list.setAttribute('aria-orientation', 'horizontal');
  list.hidden = ids.length === 0;
  if (ids.length) list.setAttribute('aria-owns', ids.join(' '));
  else list.removeAttribute('aria-owns');
}

function onKey(event, views, state, reorder, callbacks) {
  const tab = event.target.closest?.('[role="tab"]');
  if (!tab) return;
  const id = tab.getAttribute('data-ui-id');
  if (reorder.key(event, id)) {
    event.preventDefault();
    return;
  }
  const items = selectable(state);
  const item = state.items.find((entry) => entry.id === id);
  if (event.key === 'Delete' && closes(item)) {
    event.preventDefault();
    callbacks.onClose?.(id);
    return;
  }
  if ((event.key === 'Enter' || event.key === ' ') && item?.disabled !== true) {
    event.preventDefault();
    if (id !== state.activeId) callbacks.onSelect?.(id);
    return;
  }
  const to = nextIndex(event.key, items.findIndex((entry) => entry.id === id), items.length,
    { orientation: 'horizontal', wrap: true });
  if (to === null) return;
  event.preventDefault();
  state.focusId = items[to].id;
  setTabStop([...views.values()].map((view) => view.tab), views.get(state.focusId).tab);
  views.get(state.focusId).tab.focus();
  if (state.activation === 'auto' && state.focusId !== state.activeId) callbacks.onSelect?.(state.focusId);
}

/** Answer a press in the strip: on a close control, a layer or a fold - each beside a tab - or on a tab. */
function onPress(event, state, fold, callbacks) {
  const hit = (selector) => event.target.closest?.(selector) ?? null;
  const close = hit('[data-ui-close]');
  const layer = hit('[data-ui-layer]');
  const folded = hit('[data-ui-fold]');
  const tab = hit('[role="tab"]');
  const id = tab?.getAttribute('data-ui-id');
  if (close && !close.hidden) callbacks.onClose?.(close.getAttribute('data-ui-close'));
  else if (layer) callbacks.onLayer?.(layer.parentElement.getAttribute('data-ui-layers'), layer.getAttribute('data-ui-layer'));
  else if (folded) fold.press(folded.getAttribute('data-ui-fold'), state.items);
  else if (id && !tab.disabled && id !== state.activeId) callbacks.onSelect?.(id);
}

function bindTabs(life, root, views, state, fold, callbacks) {
  const reorder = createReorder(life, root, state, callbacks);
  life.on(root, 'click', (event) => onPress(event, state, fold, callbacks));
  life.on(root, 'keydown', (event) => onKey(event, views, state, reorder, callbacks));
}

/** An item's icon, checked before anything is drawn: a name the kit draws, an element, or none. */
function checkedIcon({ icon }) {
  const known = icon === undefined || icon === null || icon === '' || typeof icon === 'object' || ICON_NAMES.includes(icon);
  if (!known) throw new TypeError(typeof icon === 'string' ? `The kit has no icon named ${icon}` : 'A tab\'s icon is a kit icon name or an element');
}

/** The model's items, checked before anything is drawn: tab ids unique, each tab's layer ids unique within it, and its icon one the kit can draw. */
function tabItems(items) {
  for (const item of uniqueItems(items, 'tab')) {
    layersOf(item);
    checkedIcon(item);
  }
  return items;
}

/**
 * @param {HTMLElement} host
 * @param {{face?: 'line'|'folder', onSelect?: (id: string) => void, onClose?: (id: string) => void,
 *   onLayer?: (tabId: string, layerId: string) => void,
 *   onReorder?: (id: string, beforeId: string|null) => void}} [callbacks] the strip's callbacks, and beside them the one
 *   thing about it that is decided once: `face`, the look it wears (`'line'` unless `'folder'` is asked for)
 * @throws {TypeError} for a face that is neither
 * @returns {{update(model: {label?: string, activeId?: string|null, activation?: 'auto'|'manual', closeLabel?: string,
 *   items?: Array<{id: string, label?: string, icon?: string|Element, panelId?: string, badge?: number|object, closable?: boolean,
 *   pinned?: boolean, layers?: Array<{id: string, label?: string}>, disabled?: boolean}>}): void, destroy(): void}}
 */
export function createTabs(host, callbacks = {}) {
  const doc = documentOf(host);
  const face = faceOf(callbacks.face);
  injectUiStyles(doc);
  const life = createLife();
  const root = el(doc, 'div', { className: CLASS, attrs: { 'data-face': face } });
  // Ordered tab ownership separates semantics from the adjacent close layout.
  const list = el(doc, 'div', { className: SR_ONLY_CLASS, attrs: { role: 'tablist', hidden: true } });
  host.append(list, root);
  const views = new Map();
  const state = { items: [], activeId: null, focusId: null, activation: 'auto', closeLabel: 'Close' };
  const fold = createFold(host, views, callbacks);
  const reveal = createReveal(root, views);
  bindTabs(life, root, views, state, fold, callbacks);
  return {
    update(model = {}) {
      if (life.dead) return;
      state.items = tabItems(model.items ?? []);
      if (state.activeId !== (model.activeId ?? null)) state.focusId = model.activeId ?? null;
      state.activeId = model.activeId ?? null;
      state.activation = model.activation === 'manual' ? 'manual' : 'auto';
      state.closeLabel = String(model.closeLabel ?? 'Close');
      const held = heldBefore(root, doc, fold);
      render(root, doc, views, state);
      fold.sync(state.items);
      restoreFocus(root, views, state, fold, held);
      ownTabs(list, views, state, String(model.label ?? 'Tabs'));
      reveal.sync(state);
    },
    destroy() {
      if (!life.destroy()) return;
      fold.destroy();
      for (const view of views.values()) view.badge?.destroy();
      views.clear();
      root.remove();
      list.remove();
    }
  };
}
