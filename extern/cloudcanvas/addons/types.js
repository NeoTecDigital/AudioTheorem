/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The display types as widgets (`./widget.js`): `card`, `media`,
 * `vector-pointer` and `raw`, each a type whose same-named trait holds its
 * contents and renders them - text through Text nodes, the badge, needle and
 * meter as SVG from the primitives, a media `src` through `safeUrl`. `raw`, and
 * a card given the `html` key, render markup: the one deliberate opt-in.
 *
 *   registerDisplayTypes();
 *   const card = app.blit({ type: 'card', card: { title: 'Hi', body: 'Text' } });
 *   setContent(card, 'badge', { text: 'new', color: '#22c55e' });
 *
 * Every type but `raw` holds its children in a `[data-scope]` well after its
 * content, sized to them by the layout add-on (`layout: 'free'` is a type
 * default). Registration is a call, never an import side effect. `mountType`
 * clones any type's structure into an element (a consumer's own renderer).
 */
import { SLOT_ATTR } from '../core/state.js';
import { findType, isTemplate } from '../core/type.js';
import {
  createBadgeSVG, createGradientMeterSVG, createPlaceholderDataURI, createVectorPointerSVG, safeColor, safeUrl
} from '../graphics/primitives/primitives.js';
import { CARD_CSS } from '../graphics/css/card.js';
import { injectAddonCss } from './trait.js';
import { leadingText, setAttr, setSlot, setText, setVisible, widget } from './widget.js';

/**
 * Every class name the display types carry. Public API twice over: consumers
 * style them and the display widgets' chunk (`../graphics/css/card.js`)
 * matches them. `GAUGE_ROW` is the modifier the vector-pointer body carries
 * beside `BODY`.
 */
export const CLS = /* @__PURE__ */ Object.freeze({
  HEADER: 'cloudcanvas-card-header',
  TITLE: 'cloudcanvas-card-title',
  BADGE_SLOT: 'cloudcanvas-card-badge-slot',
  BODY: 'cloudcanvas-card-body',
  GAUGE_ROW: 'cloudcanvas-card-gauge-row',
  FOOTER: 'cloudcanvas-card-footer',
  AUTHOR: 'cloudcanvas-card-author',
  ACTION_BTN: 'cloudcanvas-card-action-btn',
  NEEDLE_SLOT: 'cloudcanvas-card-needle-slot',
  GAUGE: 'cloudcanvas-card-gauge',
  LABEL: 'cloudcanvas-card-label',
  METER_SLOT: 'cloudcanvas-card-meter-slot',
  MEDIA: 'cloudcanvas-card-media',
  CAPTION: 'cloudcanvas-card-caption',
  HTML: 'cloudcanvas-card-html',
  SCOPE: 'cloudcanvas-card-scope'
});

/**
 * Clone a type's content into `into`, replacing its children: the build half of
 * rendering through a type. `type` is a registered name or a `<template>`.
 * @returns {Record<string, Element>} the clone's slots by name, first wins (a null-prototype object)
 * @throws {TypeError} when the name is not a registered type
 */
export function mountType(type, into) {
  const template = typeof type === 'string' ? findType(type) : type;
  if (!template || !isTemplate(template)) throw new TypeError(`types: no type "${String(type)}"`);
  into.replaceChildren(template.content.cloneNode(true));
  const slots = Object.create(null);
  for (const slot of into.querySelectorAll(`[${SLOT_ATTR}]`)) slots[slot.getAttribute(SLOT_ATTR)] ??= slot;
  return slots;
}

/* ------------------ WIDGETS ------------------ */

const ACCENT = '#38bdf8';
const NEEDLE_SIZE = 36;
const METER_MIN = 0;
const METER_MAX = 100;

/** One element as markup, classed; constants only. */
const el = (name, className, inner = '', extra = '') => `<${name} class="${className}"${extra}>${inner}</${name}>`;
const HEADER = el('div', CLS.HEADER, el('div', CLS.TITLE) + el('span', CLS.BADGE_SLOT), ' data-drag-handle');
const HTML = el('div', CLS.HTML, '', ' hidden');
const SCOPE = el('div', CLS.SCOPE, '', ' data-scope');

/** The first `.name` under `root` that is `root`'s own, not a nested blit's. */
function own(root, className) {
  for (const found of root.querySelectorAll(`.${className}`)) {
    if (found.closest('[data-blit]') === root) return found;
  }
  return null;
}

/** The `badge` content value, a string or `{text, color}`. */
function badgeOf(value, fallbackColor) {
  if (value === undefined || value === null) return { text: '', color: fallbackColor };
  if (typeof value === 'object') return { text: value.text == null ? '' : String(value.text), color: safeColor(value.color, fallbackColor) };
  return { text: String(value), color: fallbackColor };
}

/** The header every type but `raw` opens with: title text, and the badge drawn only when it has text. */
function renderHeader(b, contents, cache, badge = badgeOf(contents.get('badge'), ACCENT)) {
  setText(b.title, contents.get('title'));
  setSlot(b.badge, badge.text ? createBadgeSVG(badge.text, badge.color) : '', cache, 'badge', `${badge.text}|${badge.color}`);
  setVisible(b.badge, Boolean(badge.text));
}

/** The header's nodes, plus the markup region a card's `html` key renders into. */
function bindHeader(root) {
  return {
    header: own(root, CLS.HEADER), title: leadingText(own(root, CLS.TITLE)), badge: own(root, CLS.BADGE_SLOT),
    html: own(root, CLS.HTML)
  };
}

/** Markup in place of the template, or back: the one opt-in, and only for a key the caller set. */
function renderMarkup(b, contents, cache, sections) {
  const markup = contents.has('html') ? String(contents.get('html') ?? '') : null;
  for (const section of sections) if (section) setVisible(section, markup === null);
  if (!b.html) return false;
  setVisible(b.html, markup !== null);
  if (markup !== null) setSlot(b.html, markup, cache, 'html', markup);
  return markup !== null;
}

/** A container's children sit in its well, which the layout add-on sizes to them (`free`: by their own placement). */
const CONTAINER = Object.freeze({ layout: 'free' });

const CARD = {
  name: 'card',
  defaults: CONTAINER,
  html: HEADER + el('div', CLS.BODY) + el('div', CLS.FOOTER, el('span', CLS.AUTHOR)
    + el('button', CLS.ACTION_BTN, '', ' type="button"')) + HTML + SCOPE,
  // Open: a card holds any contents (a custom type's own fields among them); it renders the ones it knows.
  keys: null,
  bind: (root) => {
    const b = { ...bindHeader(root), body: own(root, CLS.BODY), footer: own(root, CLS.FOOTER), action: own(root, CLS.ACTION_BTN) };
    return { ...b, bodyText: leadingText(b.body), authorText: leadingText(own(root, CLS.AUTHOR)), actionText: leadingText(b.action) };
  },
  render(b, contents, cache) {
    if (renderMarkup(b, contents, cache, [b.header, b.body, b.footer])) return;
    renderHeader(b, contents, cache);
    const body = contents.get('body') ?? '';
    const author = contents.get('author') ?? '';
    const action = contents.get('actionText') ?? '';
    setText(b.bodyText, body);
    setVisible(b.body, body !== '');
    setText(b.authorText, author);
    setText(b.actionText, action);
    setAttr(b.action, 'data-action', String(action), cache, 'action');
    setVisible(b.action, action !== '');
    setVisible(b.footer, author !== '' || action !== '');
  }
};

const MEDIA = {
  name: 'media',
  defaults: CONTAINER,
  html: HEADER + el('div', CLS.BODY, `<img class="${CLS.MEDIA}">` + el('p', CLS.CAPTION)) + SCOPE,
  keys: ['title', 'badge', 'src', 'alt', 'caption'],
  bind: (root) => {
    const caption = own(root, CLS.CAPTION);
    return { ...bindHeader(root), image: own(root, CLS.MEDIA), caption, captionText: leadingText(caption) };
  },
  render(b, contents, cache) {
    renderHeader(b, contents, cache);
    setAttr(b.image, 'src', safeUrl(contents.get('src'), createPlaceholderDataURI()), cache, 'src');
    setAttr(b.image, 'alt', String(contents.get('alt') ?? ''), cache, 'alt');
    const caption = contents.get('caption') ?? '';
    setText(b.captionText, caption);
    setVisible(b.caption, caption !== '');
  }
};

const VECTOR_POINTER = {
  name: 'vector-pointer',
  defaults: CONTAINER,
  html: HEADER + el('div', `${CLS.BODY} ${CLS.GAUGE_ROW}`, el('div', CLS.NEEDLE_SLOT)
    + el('div', CLS.GAUGE, el('div', CLS.LABEL) + el('div', CLS.METER_SLOT))) + SCOPE,
  keys: ['title', 'angle', 'magnitude', 'color', 'label'],
  bind: (root) => ({
    ...bindHeader(root), needle: own(root, CLS.NEEDLE_SLOT), label: leadingText(own(root, CLS.LABEL)), meter: own(root, CLS.METER_SLOT)
  }),
  render(b, contents, cache) {
    const angle = Number(contents.get('angle')) || 0;
    const magnitude = Number(contents.get('magnitude')) || 0;
    const color = safeColor(contents.get('color'), ACCENT);
    renderHeader(b, contents, cache, { text: `${angle.toFixed(0)}°`, color });
    setSlot(b.needle, createVectorPointerSVG(angle, { color, size: NEEDLE_SIZE }), cache, 'needle', `${angle}|${color}`);
    setText(b.label, contents.get('label') ?? `Mag: ${magnitude.toFixed(1)}`);
    setSlot(b.meter, createGradientMeterSVG(magnitude, METER_MIN, METER_MAX, { color }), cache, 'meter', `${magnitude}|${color}`);
  }
};

const RAW = {
  name: 'raw',
  html: el('div', CLS.HTML),
  keys: ['html'],
  bind: (root) => ({ html: own(root, CLS.HTML) }),
  render: (b, contents, cache) => {
    const markup = String(contents.get('html') ?? '');
    setSlot(b.html, markup, cache, 'html', markup);
  }
};

/** The display widgets, in registration order. */
const WIDGETS = /* @__PURE__ */ Object.freeze([CARD, MEDIA, VECTOR_POINTER, RAW]);

/**
 * Register the display types as widgets; a second call is a no-op.
 * @returns {string[]} the names registered
 */
export function registerDisplayTypes() {
  injectAddonCss('card', CARD_CSS);
  for (const spec of WIDGETS) widget(spec);
  return WIDGETS.map((spec) => spec.name);
}
