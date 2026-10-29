/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * `h()`: the one namespace-aware element factory for building live DOM and SVG
 * subtrees.
 *
 * It is the *build* primitive: it knows the SVG namespace, takes attributes and
 * children in one call, and is meant to run once, while a subtree is built -
 * never on every frame. So it is deliberately not a diff: it assigns what it is
 * given and returns the node, and the updates that follow go through the
 * diffing helpers (`setAttr` and `setText` in `../../addons/widget.js`,
 * `reconcileKeyedList` in `../../addons/keyed-list.js`). Build with `h()`,
 * mutate with the helpers - which is what lets an HTML template and an SVG
 * group (the connect and svg-state add-ons) be written the same way.
 */

/** The SVG namespace every vector tag is created in. */
export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Tags that must be created in the SVG namespace.
 *
 * The list is the set of SVG element names that overlap in spelling with, or are
 * routinely built alongside, HTML - a plain `createElement('circle')` yields an
 * unknown *HTML* element that renders nothing, so the namespace is not optional.
 * A tag outside this set is treated as HTML; a caller building an exotic SVG or
 * MathML element that is not listed reaches for `document.createElementNS`
 * directly, which is the honest escape hatch rather than an ever-growing table.
 */
export const SVG_TAGS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'marker', 'clipPath', 'mask', 'pattern',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath', 'foreignObject',
  'linearGradient', 'radialGradient', 'stop',
  'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix', 'feMerge', 'feMergeNode',
  'title', 'desc', 'image'
]);

/** Create the element for `tag` in the right namespace. */
function createFor(tag) {
  return SVG_TAGS.has(tag)
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);
}

/**
 * Apply one `attrs` entry to `element`.
 *
 * The special cases are the ones a bare `setAttribute` gets wrong:
 *   - `class`/`className` both mean the class list, and `class` (via
 *     `setAttribute`) is the one that works on an SVG element too, where the
 *     `className` *property* is a read-only `SVGAnimatedString`.
 *   - `style` may be a string (assigned whole) or an object (each property set on
 *     the element's `style`, so a caller can pass computed values without
 *     stringifying them).
 *   - an `on*` key whose value is a function is a listener, bound with
 *     `addEventListener` under the lower-cased event name (`onPointerDown` ->
 *     `pointerdown`) rather than an `onclick`-style property, so several handlers
 *     and non-HTML targets both work.
 *   - a boolean value toggles the attribute's *presence* (`disabled`,
 *     `hidden`), which is what the HTML boolean-attribute contract expects; a
 *     `false` writes nothing rather than the string `"false"`.
 *   - `null`/`undefined` is skipped, so an absent option is simply absent.
 */
function applyAttr(element, name, value) {
  if (value === null || value === undefined) return;

  if (name === 'class' || name === 'className') {
    element.setAttribute('class', String(value));
    return;
  }
  if (name === 'style') {
    applyStyle(element, value);
    return;
  }
  if (name.length > 2 && name.startsWith('on') && typeof value === 'function') {
    element.addEventListener(name.slice(2).toLowerCase(), value);
    return;
  }
  if (typeof value === 'boolean') {
    if (value) element.setAttribute(name, '');
    else element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, String(value));
}

/** Write a `style` attr: a string whole, an object property by property. */
function applyStyle(element, value) {
  if (typeof value === 'string') {
    element.setAttribute('style', value);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [property, entry] of Object.entries(value)) {
      if (entry === null || entry === undefined) continue;
      element.style.setProperty(property, String(entry));
    }
  }
}

/**
 * Append one child, flattening as it goes.
 *
 * An array is spread (so a mapped list of children needs no `...`), a string or
 * number becomes a text node (the DOM escapes it, so a caller cannot inject
 * markup through a child), a Node is appended as-is, and `null`/`undefined`/
 * `false`/`true` are skipped - which is what makes `condition && h(...)` and
 * `list.map(...)` drop cleanly into the child list.
 */
function appendChild(element, child) {
  if (child === null || child === undefined || child === false || child === true) return;

  if (Array.isArray(child)) {
    for (const entry of child) appendChild(element, entry);
    return;
  }
  if (typeof child === 'string' || typeof child === 'number') {
    element.appendChild(document.createTextNode(String(child)));
    return;
  }
  if (child && typeof child.nodeType === 'number') {
    element.appendChild(child);
  }
}

/**
 * Build an element with attributes and children in one call.
 *
 * @param {string} tag element name; an entry of {@link SVG_TAGS} is created in
 *   the SVG namespace, everything else as HTML
 * @param {object|null} [attrs] attribute/property map; see {@link applyAttr} for
 *   the `class`, `style`, `on*` and boolean special cases
 * @param {...*} children strings/numbers (text), Nodes (appended), arrays
 *   (flattened) and nullish/boolean (skipped)
 * @returns {Element} the constructed element
 */
export function h(tag, attrs, ...children) {
  const element = createFor(tag);

  if (attrs && typeof attrs === 'object') {
    for (const [name, value] of Object.entries(attrs)) applyAttr(element, name, value);
  }

  for (const child of children) appendChild(element, child);
  return element;
}
