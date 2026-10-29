/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The kit's icons: a small set of line drawings for the places a control takes one - a menu item, a nav bar item, an
 * empty state - so a host that has no icon set of its own still has something to say with. An icon is decoration:
 * it is hidden from assistive technology, and the label beside it is the name. It is drawn in the colour of the text
 * around it, so a danger item, a hovered item and a dimmed one carry it along.
 *
 *   createIcon(doc, 'plus')            an SVG element
 *   menu.update({ items: [{ id: 'add', label: 'Add', icon: 'plus' }] })
 *   menu.update({ items: [{ id: 'add', label: 'Add', icon: myOwnSvg }] })   a host's own element is used as it is
 *
 * A name the kit does not have is a TypeError, not a blank: a typo is found when it is written.
 */
import { el, svg } from './dom.js';

/** The drawings: each icon's paths on a 24-unit square. */
const PATHS = /* @__PURE__ */ Object.freeze({
  back: ['m12 19-7-7 7-7', 'M19 12H5'],
  check: ['M20 6 9 17l-5-5'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  empty: ['M22 12h-6l-2 3h-4l-2-3H2', 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'],
  error: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z', 'M12 8v4', 'M12 16h.01'],
  info: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z', 'M12 16v-4', 'M12 8h.01'],
  loading: ['M21 12a9 9 0 1 1-6.219-8.56'],
  locked: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  more: ['M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z', 'M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z', 'M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z'],
  open: ['M7 7h10v10', 'M7 17 17 7'],
  plus: ['M12 5v14', 'M5 12h14'],
  search: ['M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z', 'm21 21-4.34-4.34']
});

/** The names the kit draws. */
export const ICON_NAMES = /* @__PURE__ */ Object.freeze(Object.keys(PATHS));

/** The class every kit icon carries, so one rule sizes them all. */
export const ICON_CLASS = 'cloudcanvas-ui-icon';

/**
 * A kit icon as an SVG element, drawn in the current text colour and hidden from assistive technology.
 * @param {Document} doc
 * @param {string} name one of `ICON_NAMES`
 * @returns {SVGElement}
 * @throws {TypeError} a name the kit does not draw
 */
export function createIcon(doc, name) {
  const paths = PATHS[name];
  if (!Object.hasOwn(PATHS, name)) throw new TypeError(`The kit has no icon named ${String(name)}`);
  const icon = svg(doc, 'svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round',
    'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: ICON_CLASS, 'data-icon': name });
  for (const d of paths) icon.append(svg(doc, 'path', { d }));
  return icon;
}

/** The icon each slot shows, as given: the name or the element, so an update that gives the same one draws nothing. */
const SHOWN = /* @__PURE__ */ new WeakMap();

/** A slot for an item's icon: hidden from readers, and out of the way until it holds one. */
export function iconSlot(doc, className) {
  return el(doc, 'span', { className, attrs: { 'aria-hidden': 'true', hidden: true } });
}

/**
 * Show `source` in `slot`: a kit icon by name, or an element as given; nothing clears it, and the slot is hidden.
 * What is already shown is left alone.
 * @param {HTMLElement} slot made by `iconSlot`
 * @param {string|Element|null|undefined} source
 * @throws {TypeError} a name the kit does not draw, or a source that is neither a name nor an element
 */
export function writeIcon(slot, source) {
  const next = source === undefined || source === '' ? null : source;
  if (next === (SHOWN.get(slot) ?? null)) return;
  if (next !== null && typeof next !== 'string' && typeof next !== 'object') throw new TypeError('An icon is a kit icon name or an element');
  const node = typeof next === 'string' ? createIcon(slot.ownerDocument, next) : next;
  if (node) slot.replaceChildren(node);
  else slot.replaceChildren();
  SHOWN.set(slot, next);
  slot.hidden = node === null;
}
