/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * widget: a type that renders its contents. The type's `<template>` is the
 * structure; a trait of the same name (camel-cased: `task-card` is `taskCard`)
 * holds the contents as its options and renders them into the instance, so
 * writing the key re-renders:
 *
 *   widget({ name: 'progress', html, keys: ['value', 'label'], bind, render });
 *   const bar = app.blit({ type: 'progress', progress: { value: 40 } });
 *   bar.set({ progress: { value: 80 } });     // or setContent(bar, 'value', 80)
 *
 *   bind(el, on, dismiss)             the instance's nodes; idempotent (it runs on every write)
 *   render(bindings, contents, cache) `contents` (a Map) into them, diff-first through `cache`,
 *                                     which lives as long as the element
 *
 * A key the widget does not take is refused by `setContents`, and dropped with a
 * warning when it arrives some other way. An open edit (`./edit.js`)
 * defers the render and replays the last one. `dismiss()` is the widget asking
 * to go: a cancelable `dismiss` event whose default action removes the blit.
 * The DOM writes every render shares - `setText`, `setVisible`, `setAttr`,
 * `setSlot` - are exported for a consumer's own widgets.
 */
import { blit, type } from '../core/blit.js';
import { camelCase } from '../core/spec.js';
import { findType } from '../core/type.js';
import { createLogger } from '../log.js';
import { deferRender } from './edit.js';

const logger = /* @__PURE__ */ createLogger('widget');

/** Keys no contents may carry: copying one would rebind a prototype. */
const PROTOTYPE_KEYS = /* @__PURE__ */ new Set(['__proto__', 'constructor', 'prototype']);

/** @type {Map<string, object>} name -> the spec it was defined with */
const DEFINED = /* @__PURE__ */ new Map();

/** @type {WeakMap<Element, object>} element -> its render cache */
const CACHES = /* @__PURE__ */ new WeakMap();

/** Write a Text node only when the text moved. */
export function setText(node, value) {
  const text = value === undefined || value === null ? '' : String(value);
  if (node.data !== text) node.data = text;
}

/** Show or hide an element through `hidden`, so no inline style is needed. */
export function setVisible(element, visible) {
  if (element.hidden !== !visible) element.hidden = !visible;
}

/** Write an attribute only when its value moved (`img.src` re-fetches). */
export function setAttr(element, name, value, cache, key) {
  if (cache[key] === value) return;
  cache[key] = value;
  element.setAttribute(name, value);
}

/** Re-render an SVG string slot only when its inputs changed. */
export function setSlot(slot, markup, cache, key, signature) {
  if (cache[key] === signature) return;
  cache[key] = signature;
  slot.innerHTML = markup;
}

/** The Text node leading `element`, made on first ask: the write target `setText` updates. */
export function leadingText(element) {
  const first = element.firstChild;
  if (first && first.nodeType === 3) return first;
  return element.insertBefore(document.createTextNode(''), first);
}

/** Whether a widget takes `key`: one it declares, or with `keys: null` any but a prototype key. */
function permits(keys, key) {
  return keys ? keys.has(key) : !PROTOTYPE_KEYS.has(key);
}

/**
 * A trait's options as contents: none is empty. The trait renders what it is given, so a key the widget
 * does not take is dropped with a warning here - never thrown, which would leave the blit's other traits
 * unable to start. `setContents` is where a bad key is refused.
 */
function contentsOf(name, keys, options) {
  if (options === true || options === undefined || options === null || options === '') return new Map();
  if (typeof options !== 'object' || Array.isArray(options)) {
    logger.warn(`${name}: expected {key: value} contents; rendering none`);
    return new Map();
  }
  const contents = new Map();
  for (const [key, value] of Object.entries(options)) {
    if (permits(keys, key)) contents.set(key, value);
    else logger.warn(`${name}: key "${key}" not permitted`);
  }
  return contents;
}

/** Emit a cancelable `dismiss`, then remove the blit unless a listener prevented it. */
function dismiss(b) {
  if (b.emit('dismiss').defaultPrevented) return false;
  b.remove();
  return true;
}

/** The selector of a template's first element (its classes, else its tag): how an instance's structure is recognised. */
function structureSelector(template) {
  const first = template?.content.firstElementChild;
  if (!first) return null;
  // By class when it has one: a render may swap the element for another tag (text's `as`) but keeps its class.
  const classes = Array.from(first.classList, (name) => `.${CSS.escape(name)}`).join('');
  return classes || first.localName;
}

/**
 * An instance adopted from markup that already had children (so the core cloned nothing) gets the widget's
 * structure put in front of them: `bind` can rely on it however the element was made.
 */
function ensureStructure(element, name) {
  const template = findType(name);
  const selector = structureSelector(template);
  if (selector && !element.querySelector(`:scope > ${selector}`)) element.prepend(template.content.cloneNode(true));
}

/** The widget's trait: bind the instance, render its options (deferred while edited), stop listening on cleanup. */
function traitOf({ name, bind, render }, keys) {
  return (b, options) => {
    const contents = contentsOf(name, keys, options);
    ensureStructure(b.el, name);
    const offs = [];
    const on = (target, eventType, listener) => {
      target.addEventListener(eventType, listener);
      offs.push(() => target.removeEventListener(eventType, listener));
    };
    const bindings = bind(b.el, on, () => dismiss(b));
    if (!CACHES.has(b.el)) CACHES.set(b.el, {});
    const paint = () => render(bindings, contents, CACHES.get(b.el));
    if (!deferRender(b, paint)) paint();
    return () => { for (const off of offs) off(); };
  };
}

/**
 * Define a widget: its type and its same-named trait, once. The same spec again is a no-op; another spec
 * under a taken name throws. @param {{name: string, html: string, keys: string[]|null, bind: Function,
 * render: Function, defaults?: object}} spec `html` is constant markup, never data; `keys` are the contents
 * it takes (`null`: any key but a prototype key); `defaults` are spec keys every instance starts with (a
 * container's `layout: 'free'`, say)
 * @returns {object} the type's potential blit
 */
export function widget(spec) {
  const { name, html, keys } = spec;
  const known = DEFINED.get(name);
  if (known && known !== spec) throw new TypeError(`widget: "${name}" is already defined`);
  if (!known) {
    const key = camelCase(name);
    blit.use({ [key]: traitOf(spec, keys ? new Set(keys) : null) });
    type(name, { html, defaults: { ...spec.defaults, [key]: true } });
    DEFINED.set(name, spec);
  }
  return type(name);
}

/** Every defined widget's content key: spec keys that carry contents, never a behaviour. */
export function contentKeys() {
  return Array.from(DEFINED.keys(), (name) => camelCase(name));
}

/** Whether `name` is a defined widget. */
export function isWidget(name) {
  return DEFINED.has(name);
}

/** The keys a widget declares: none for an unknown name, null for one that takes any key. */
export function widgetKeys(name) {
  return DEFINED.has(name) ? DEFINED.get(name).keys : [];
}

/** The spec key a widget blit keeps its contents under, or null when `b` is no widget. */
export function contentKeyOf(b) {
  const name = b.el.getAttribute('data-type');
  return name && DEFINED.has(name) ? camelCase(name) : null;
}

/** A widget blit's contents as a plain object (its type's trait options); {} for anything else. */
export function contentOf(b) {
  const key = contentKeyOf(b);
  const options = key ? b.spec[key] : null;
  return options && typeof options === 'object' ? { ...options } : {};
}

/** Write contents over a widget blit's own; a key set to undefined is removed, one it does not declare is
 * refused before anything is written. @returns {object} the blit */
export function setContents(b, patch) {
  const key = contentKeyOf(b);
  const name = b.el.getAttribute('data-type');
  if (!key) throw new TypeError(`setContents: "${name}" is not a widget`);
  // Refused before anything is written, so a bad key never reaches the element.
  const { keys } = DEFINED.get(name);
  const declared = keys ? new Set(keys) : null;
  for (const each of Object.keys(patch)) {
    if (!permits(declared, each)) throw new TypeError(`${name}: key "${each}" not permitted`);
  }
  const next = { ...contentOf(b), ...patch };
  for (const each of Object.keys(next)) if (next[each] === undefined) delete next[each];
  return b.set({ [key]: Object.keys(next).length > 0 ? next : true });
}

/** Write one content key. */
export function setContent(b, key, value) {
  return setContents(b, { [key]: value });
}

/**
 * A spec for `parent.blit()` of widget `name`: `options` split into its contents (its declared keys, plus any
 * `contents` object) and everything else, which stays spec. @returns {object}
 */
export function widgetSpec(name, options = {}) {
  const defined = DEFINED.get(name);
  if (!defined) throw new TypeError(`widgetSpec: "${name}" is not a widget`);
  const keys = new Set(defined.keys ?? []);
  const contents = { ...(options.contents ?? {}) };
  const spec = {};
  for (const [key, value] of Object.entries(options)) {
    if (key === 'contents' || value === undefined) continue;
    if (keys.has(key)) contents[key] = value;
    else spec[key] = value;
  }
  spec.type = name;
  if (Object.keys(contents).length > 0) spec[camelCase(name)] = contents;
  return spec;
}
