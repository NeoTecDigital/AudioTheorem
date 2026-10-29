/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The UI kit's DOM helpers: one element builder, its SVG twin, one button, one
 * field, the box of the page that can be seen, and the lifecycle every control
 * is torn down through.
 *
 * NOTHING TOUCHES A DOCUMENT AT IMPORT. Each helper takes the document it
 * builds in - a control mounts into a host and uses `host.ownerDocument` - so
 * the kit loads on a server and works inside an iframe.
 *
 * OPTIONS OBJECTS, NEVER POSITIONAL TEXT. `el(doc, 'p', { className, text })`
 * cannot confuse a class for a label the way `el(doc, 'p', 'a', 'b')` can.
 *
 * ONE LIFE PER CONTROL. `createLife()` hands out an `AbortSignal` every
 * listener is registered with, and tracks every timer and extra disposer, so
 * `destroy()` is a single `life.destroy()` that leaves nothing behind.
 *
 * WHICH ITEM AN ELEMENT BELONGS TO is asked, never read. A control writes an
 * item's id on the item's own face, and on a part that stands for the item
 * without being it (the label beside a timeline bar, a tab's close control);
 * `itemIdOf(element)` answers for either, and for anything inside them. The
 * attributes are the kit's own to change.
 */

/** The document a host lives in; a missing host or document is a caller error. */
export function documentOf(host) {
  const doc = host?.ownerDocument ?? null;
  if (!host || typeof host.append !== 'function' || !doc?.createElement) {
    throw new TypeError('A host element attached to a document is required');
  }
  return doc;
}

/** Apply `attrs` (null and false are skipped, true writes an empty value). */
function applyAttrs(node, attrs) {
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
}

/**
 * Create an element.
 * @param {Document} doc
 * @param {string} tag
 * @param {{className?: string, text?: unknown, attrs?: Record<string, unknown>}} [options]
 * @returns {HTMLElement}
 */
export function el(doc, tag, { className = '', text, attrs } = {}) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.append(doc.createTextNode(String(text)));
  applyAttrs(node, attrs);
  return node;
}

/** The namespace every vector element is created in: `createElement('path')` is an unknown HTML element that draws nothing. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Create an SVG element with `attrs`, each written as its string. */
export function svg(doc, tag, attrs = {}) {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

/** Append a text node to `parent` and return it, so the text can be rewritten in place. */
export function textNode(doc, parent, value = '') {
  const node = doc.createTextNode(String(value ?? ''));
  parent.append(node);
  return node;
}

/** Rewrite a text node only when its value moved. */
export function writeText(node, value) {
  const next = String(value ?? '');
  if (node.data !== next) node.data = next;
}

/** The class every kit button carries, so one rule styles them all. */
export const BUTTON_CLASS = 'cloudcanvas-ui-button';

/** Whether a control is off: unavailable for now, and still on the page, in the tab order and read out. */
export function isOff(node) {
  return node.getAttribute('aria-disabled') === 'true';
}

/**
 * Turn a control off or on again. `disabled` would take the focus from a control that was just pressed and drop the
 * reader at the top of the page; off says `aria-disabled` instead, so the control keeps focus and its place, is
 * read as unavailable, is drawn so (`./css/controls.js`), and reports no press (`button`).
 */
export function setOff(node, off) {
  if (off) node.setAttribute('aria-disabled', 'true');
  else node.removeAttribute('aria-disabled');
}

/**
 * A `<button type="button">` in the kit's look (`cloudcanvas-ui-button`, plus
 * `className`). `onClick` is bound with `signal` when one is given, so a
 * control's life removes it. `off` makes it unavailable for now and leaves it
 * focusable (`setOff` changes it later): its press is not reported while it is
 * off. `disabled` is the other thing - not focusable, not read as a control.
 */
export function button(doc, { label, className = '', ariaLabel, title, disabled = false, off = false, onClick, signal, attrs } = {}) {
  const node = el(doc, 'button', { className: className ? `${BUTTON_CLASS} ${className}` : BUTTON_CLASS, text: label, attrs });
  node.type = 'button';
  if (ariaLabel) node.setAttribute('aria-label', ariaLabel);
  if (title) node.title = title;
  node.disabled = Boolean(disabled);
  setOff(node, off);
  if (typeof onClick === 'function') {
    node.addEventListener('click', (event) => { if (!isOff(node)) onClick(event); }, signal ? { signal } : undefined);
  }
  return node;
}

/** The class every kit field carries. */
export const FIELD_CLASS = 'cloudcanvas-ui-field';

/**
 * The class that hides text from the eye and keeps it for assistive technology:
 * what a badge's capped figure or a breadcrumb's ellipsis stands for is said in
 * full beside it.
 */
export const SR_ONLY_CLASS = 'cloudcanvas-ui-sr-only';

/**
 * An `<input>` (or `<textarea>` with `type: 'textarea'`) that always has an
 * accessible name: `label` becomes `aria-label` unless the caller labels it.
 */
export function input(doc, options = {}) {
  const { type = 'text', label, value, placeholder, name, className = '', required = false } = options;
  const classes = className ? `${FIELD_CLASS} ${className}` : FIELD_CLASS;
  const node = el(doc, type === 'textarea' ? 'textarea' : 'input', { className: classes, attrs: options.attrs });
  if (type !== 'textarea') node.type = type;
  if (label && !node.hasAttribute('aria-labelledby')) node.setAttribute('aria-label', String(label));
  if (placeholder) node.placeholder = String(placeholder);
  if (name) node.name = String(name);
  if (value !== undefined && value !== null) node.value = String(value);
  node.required = Boolean(required);
  if (typeof options.onInput === 'function') {
    node.addEventListener('input', () => options.onInput(node.value), options.signal ? { signal: options.signal } : undefined);
  }
  return node;
}

/** `value` held to `[min, max]`. */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * The box that can be seen, in client coordinates: the visual viewport - which
 * a pinch or an on-screen keyboard makes smaller than the layout viewport, and
 * moves inside it - or, where the platform has none, the window.
 * @param {Window} view
 * @returns {{left: number, top: number, width: number, height: number}}
 */
export function visualBox(view) {
  const viewport = view.visualViewport;
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? view.innerWidth,
    height: viewport?.height ?? view.innerHeight
  };
}

/** The attribute an item's own face carries its id in, and the one a part that stands for an item carries it in. */
const ITEM_ID = 'data-ui-id';
const ITEM_PART = 'data-ui-for';

/**
 * The nearest element, at `element` or above it, that says which item it
 * belongs to: the item's face, or a part that stands for it.
 * @param {unknown} element an element, or a text node inside one; anything else belongs to no item
 * @param {Element|null} [root] look no further out than this: a control asks about its own items only
 * @returns {Element|null}
 */
export function itemNodeOf(element, root = null) {
  const from = element?.nodeType === 3 ? element.parentElement : element;
  const node = from?.closest?.(`[${ITEM_ID}], [${ITEM_PART}]`) ?? null;
  return node && (root === null || root.contains(node)) ? node : null;
}

/**
 * Which item `element` belongs to: the id of the nearest kit item it is, is
 * inside, or stands for - a card, a chip, a bar or the label beside it, a
 * node, a tab or its close control, a tree row, a heading that stands for an
 * item - or null for an element that belongs to none.
 * @param {unknown} element an event's target, as it comes
 * @returns {string|null}
 */
export function itemIdOf(element) {
  const node = itemNodeOf(element);
  return node ? node.getAttribute(ITEM_ID) ?? node.getAttribute(ITEM_PART) : null;
}

/**
 * Mark `node` as the selected item, or as not: for the eye by a class the
 * sheet draws (`is-selected`), for assistive technology by `aria-current`.
 * Focus is not touched.
 * @param {Element} node an item's face
 * @param {boolean} selected
 */
export function markSelected(node, selected) {
  node.classList.toggle('is-selected', selected);
  if (selected) node.setAttribute('aria-current', 'true');
  else node.removeAttribute('aria-current');
}

/** A list of items whose `id`s are non-empty and unique, or a TypeError naming `kind`. */
export function uniqueItems(items, kind) {
  if (!Array.isArray(items)) throw new TypeError(`${kind} items must be an array`);
  const ids = new Set();
  for (const item of items) {
    const id = item?.id;
    if (typeof id !== 'string' || id.trim() === '' || ids.has(id)) {
      throw new TypeError(`Invalid or duplicate ${kind} id: ${String(id)}`);
    }
    ids.add(id);
  }
  return items;
}

/** Tabbable descendants of `root`, in document order. */
export function focusablesIn(root) {
  const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll(selector))
    .filter((node) => !node.disabled && !node.closest('[hidden]') && node.getAttribute('tabindex') !== '-1');
}

let sequence = 0;

/** A document-unique id with `prefix`, for `aria-labelledby` and friends. */
export function uniqueId(prefix) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

/**
 * One control's lifetime: listeners, timers and disposers that all end at
 * `destroy()`. After it, `on` and `later` do nothing and `dead` is true.
 */
export function createLife() {
  const controller = new AbortController();
  const timers = new Set();
  const disposers = [];
  return {
    get signal() { return controller.signal; },
    get dead() { return controller.signal.aborted; },
    on(target, type, handler, options = {}) {
      if (!controller.signal.aborted) target.addEventListener(type, handler, { ...options, signal: controller.signal });
    },
    later(fn, ms) {
      if (controller.signal.aborted) return () => {};
      const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
      timers.add(id);
      return () => { clearTimeout(id); timers.delete(id); };
    },
    add(dispose) { disposers.push(dispose); },
    destroy() {
      if (controller.signal.aborted) return false;
      controller.abort();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const dispose of disposers.splice(0).reverse()) dispose();
      return true;
    }
  };
}
