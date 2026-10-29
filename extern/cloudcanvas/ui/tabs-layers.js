/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * A tab's layers: the parent scopes it stands in front of, drawn as folder
 * tabs stacked behind it (`./tabs.js` owns the strip; this is the part beside
 * each tab, and `./css/tabs-layers.js` is how it is drawn).
 *
 * `layers` on an item runs outermost parent first, nearest parent last. Each
 * is a real button named "Up to {label}", its label drawn - cut short by the
 * sheet, whole in `title` - in a `role="group"` named "Parent scopes of {tab
 * label}". The group sits before its tab in the tab's row and never inside the
 * tab: a button in a tab is invalid ARIA, and the tablist owns only tabs.
 *
 * A STACK, NOT A TRAIL. The button is a layer's place in the row and its
 * target; its label is on a face inside it, which the sheet is free to draw
 * wider than that place and tucked behind the next. Each button says how many
 * steps behind the tab it stands (`data-depth`, 1 for the nearest parent), and
 * the page's own order - outermost first, the tab last - is the stack's.
 *
 * AT MOST THREE SHOW. With more, the outermost fold into a single "…" layer,
 * which is one of the three, and that opens a kit menu (`./menu.js`) listing
 * them, outermost first. A layer chosen there is reported exactly as one
 * pressed in the strip. One menu serves the whole strip; it is made the first
 * time a fold is pressed and mounted beside the strip, so it is no child of
 * the tablist and no scrolling strip clips it.
 *
 * TAB STOPS. The layers of the active tab are tab stops, in order, before the
 * tab; every other tab's layers carry `tabindex="-1"`. The arrows are the
 * tabs' own and step over layers.
 */
import { createLife, el, textNode, uniqueItems, writeText } from './dom.js';
import { createMenu } from './menu.js';
import { placeChildren, rowCache } from './render.js';

const CLASS = 'cloudcanvas-ui-tabs';

/** The most layers a tab shows. With more, the fold is one of them. */
const MAX_LAYERS = 3;

/**
 * An item's layers, checked before anything is drawn: none is none, and ids
 * are unique within one tab.
 * @param {{layers?: Array<{id: string, label?: string}>}} item
 * @returns {Array<{id: string, label?: string}>}
 * @throws {TypeError}
 */
export function layersOf(item) {
  return uniqueItems(item.layers ?? [], 'tab layer');
}

/** `layers` as the ones folded away and the ones shown: all of them shown while they fit. */
function split(layers) {
  if (layers.length <= MAX_LAYERS) return { folded: [], shown: layers };
  return { folded: layers.slice(0, 1 - MAX_LAYERS), shown: layers.slice(1 - MAX_LAYERS) };
}

const labelOf = (layer) => String(layer.label ?? layer.id);

/** A layer's button and the face on it that carries what is read; `text` is the face's text node. */
function layerButton(doc, className, attrs) {
  const node = el(doc, 'button', { className, attrs: { type: 'button', ...attrs } });
  const face = el(doc, 'span', { className: `${CLASS}-layer-face` });
  node.append(face);
  return { node, text: textNode(doc, face) };
}

/** Name a layer's button: what it does for the ear, its whole label for the pointer, the label itself for the eye. */
function writeLayer(entry, layer) {
  writeText(entry.text, labelOf(layer));
  entry.node.setAttribute('aria-label', `Up to ${labelOf(layer)}`);
  entry.node.title = labelOf(layer);
}

/** One tab's group, its fold, and the buttons of the layers that show, kept by layer id. */
function layersView(doc, tabId) {
  const group = el(doc, 'div', { className: `${CLASS}-layers`, attrs: { role: 'group', 'data-ui-layers': tabId } });
  const fold = layerButton(doc, `${CLASS}-layer is-fold`, { 'data-ui-fold': tabId, 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  writeText(fold.text, '…');
  const rows = rowCache({ create: (layer) => layerButton(doc, `${CLASS}-layer`, { 'data-ui-layer': layer.id }), update: writeLayer });
  return { group, fold: fold.node, rows };
}

/**
 * Draw `item`'s layers in its tab's row, in place: a layer the model still
 * names is the button it was. An item with none has no group at all.
 * @param {Document} doc
 * @param {{row: HTMLElement, tab: HTMLElement, layers: object|null}} view the tab's nodes; `layers` is kept on it
 * @param {object} item
 * @param {boolean} active whether this is the active tab, whose layers are tab stops
 */
export function writeLayers(doc, view, item, active) {
  const { folded, shown } = split(item.layers ?? []);
  if (shown.length === 0) {
    view.layers?.group.remove();
    view.layers = null;
    return;
  }
  view.layers ??= layersView(doc, item.id);
  const { group, fold, rows } = view.layers;
  group.setAttribute('aria-label', `Parent scopes of ${String(item.label)}`);
  fold.setAttribute('aria-label', `${folded.length} more parent scopes`);
  const nodes = folded.length > 0 ? [fold, ...rows.sync(shown)] : rows.sync(shown);
  placeChildren(group, nodes);
  nodes.forEach((node, index) => {
    node.setAttribute('data-depth', String(nodes.length - index));
    node.setAttribute('tabindex', active ? '0' : '-1');
    node.disabled = item.disabled === true;
  });
  if (group.parentNode !== view.row) view.row.insertBefore(group, view.tab);
}

/** The fold whose menu this is: the one of the tab it was last opened on, while that tab has one. */
function foldButton(fold) {
  return fold.views.get(fold.tabId)?.layers?.fold ?? null;
}

/** Say whether the menu is open, here and on its fold. */
function settle(fold, open) {
  fold.open = open;
  foldButton(fold)?.setAttribute('aria-expanded', String(open));
}

/** Forget the press that shut the menu. */
function forgetPress(fold) {
  fold.shut?.life.destroy();
  fold.shut = null;
}

/**
 * A press outside its menu shut it. When that press is on the fold itself,
 * the click it ends in must not open the menu again - with a mouse or with a
 * finger, whose click is aimed afresh once the press is over. So the press is
 * remembered until its click has been heard, wherever it lands, or - should no
 * click come - until the next press begins.
 */
function rememberPress(fold) {
  forgetPress(fold);
  fold.shut = { tabId: fold.tabId, life: createLife() };
  const doc = fold.host.ownerDocument;
  fold.shut.life.on(doc, 'pointerdown', () => forgetPress(fold), { capture: true });
  fold.shut.life.on(doc, 'click', () => forgetPress(fold));
}

/** Mount the menu beside the strip, the first time a fold is pressed. */
function mountMenu(fold) {
  fold.mount = el(fold.host.ownerDocument, 'div', { className: `${CLASS}-menu` });
  fold.host.append(fold.mount);
  fold.menu = createMenu(fold.mount, {
    onClose(reason) {
      settle(fold, false);
      if (reason === 'outside') rememberPress(fold);
    },
    // A close leaves `tabId` where it is: the choice the menu reports right after is for that tab.
    onSelect: (layerId) => fold.callbacks.onLayer?.(fold.tabId, layerId)
  });
}

/** Make an open menu say what the model now says, or close it when its tab has nothing folded any more. */
function syncFold(fold, items) {
  if (!fold.open) return;
  const item = items.find((entry) => entry.id === fold.tabId);
  const folded = item && item.disabled !== true ? split(item.layers ?? []).folded : [];
  if (folded.length === 0) {
    fold.menu.update({ open: false });
    return;
  }
  settle(fold, true);
  fold.menu.update({ open: true, label: `More parent scopes of ${String(item.label)}`, anchor: foldButton(fold),
    items: folded.map((layer) => ({ id: layer.id, label: labelOf(layer) })) });
}

/** Answer a press on the fold of the tab `tabId`: open its menu, or shut it when it is that tab's menu that is open. */
function pressFold(fold, tabId, items) {
  if (fold.shut?.tabId === tabId) return;
  const shut = fold.open && fold.tabId === tabId;
  if (fold.open) fold.menu.update({ open: false });
  if (shut) return;
  if (!fold.menu) mountMenu(fold);
  Object.assign(fold, { tabId, open: true });
  syncFold(fold, items);
}

/**
 * The fold's menu, for one tab strip.
 * @param {HTMLElement} host where the strip is mounted; the menu is mounted there too, beside it
 * @param {Map<string, {layers: object|null}>} views the strip's tabs, by id
 * @param {{onLayer?: (tabId: string, layerId: string) => void}} callbacks the strip's own: a layer chosen in the menu is reported as one pressed
 * @returns {{readonly open: boolean, holds(node: Element|null): boolean, button(): HTMLElement|null,
 *   press(tabId: string, items: object[]): void, sync(items: object[]): void, destroy(): void}} `holds` is whether
 *   `node` is inside the menu; `button` is the fold whose menu it is; `press` answers a press on a tab's fold;
 *   `sync` follows a redraw
 */
export function createFold(host, views, callbacks) {
  const fold = { host, views, callbacks, mount: null, menu: null, tabId: null, open: false, shut: null };
  return {
    get open() { return fold.open; },
    holds: (node) => Boolean(node) && fold.mount?.contains(node) === true,
    button: () => foldButton(fold),
    press: (tabId, items) => pressFold(fold, tabId, items),
    sync: (items) => syncFold(fold, items),
    destroy() {
      forgetPress(fold);
      fold.menu?.destroy();
      fold.mount?.remove();
    }
  };
}
