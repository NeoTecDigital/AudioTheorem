/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * xml: blits from XML. `fromXml(parent, source)` parses with `DOMParser` as XML - never as HTML, and no parsed
 * node ever enters the document - and builds one blit under `parent` per child of the document element. A tag
 * names a registered type (`blit` is a plain blit); attributes are spec keys (`data-` optional; placement numbers,
 * anything else decoded like a `data-*` value); a child element named for one of the type's slots fills it as text, text
 * straight inside fills a type's only slot, and any other child element is a child blit. Nothing is built until
 * the whole document has been read and checked, so a bad one builds nothing.
 *
 *   fromXml(app, '<board><card x="40" y="40" drag="true"><title>Hi</title></card></board>');
 */
import { camelCase, decodeAttribute } from '../core/spec.js';
import { MAX_DEPTH, SLOT_ATTR, SLOT_HTML_ATTR } from '../core/state.js';
import { findType } from '../core/type.js';
import { createLogger } from '../log.js';

const logger = /* @__PURE__ */ createLogger('xml');

/** The tag of a blit with no type. */
export const PLAIN_TAG = 'blit';

/** The most elements one document may build: a guard against a hostile one. */
export const XML_LIMIT = 10000;

const PLACEMENT = /* @__PURE__ */ new Set(['x', 'y', 'z', 'w', 'h']);

/** Keys XML never sets: prototype names, and the ones that take code or structure rather than data. */
const REFUSED = /* @__PURE__ */ new Set(['__proto__', 'constructor', 'prototype', 'type', 'fill', 'with']);

/** Whether an attribute may set a key: `port` only to a name the caller allows (a port and a trait share one
 * namespace, so an open `port` could run any trait as a port). */
function allowed(key, value, options) {
  if (REFUSED.has(key)) return false;
  if (key === 'port') return options.ports.includes(value);
  return PLACEMENT.has(key) || !options.keys || options.keys.includes(key);
}

/** Parse XML text; a malformed document throws with the parser's message. @returns {XMLDocument} */
export function parseXml(source) {
  if (typeof source !== 'string') throw new TypeError('xml: expected a string');
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  const error = doc.getElementsByTagName('parsererror')[0];
  // Chromium wraps the message in a <div> between headings; Firefox's is the first line.
  if (error) throw new TypeError(`xml: ${(error.querySelector('div') ?? error).textContent.trim().split('\n')[0]}`);
  return doc;
}

/** A type's slots: name -> whether the template lets it take markup. */
function slotsOf(template) {
  const slots = new Map();
  for (const slot of template ? template.content.querySelectorAll(`[${SLOT_ATTR}]`) : []) {
    slots.set(slot.getAttribute(SLOT_ATTR), slot.hasAttribute(SLOT_HTML_ATTR));
  }
  return slots;
}

/** One attribute as a spec value: placement is a number (a bad one throws), `id` stays text. */
function valueOf(key, value, tag) {
  if (PLACEMENT.has(key)) {
    const number = Number(value);
    if (value.trim() === '' || !Number.isFinite(number)) throw new TypeError(`xml: <${tag}> ${key}="${value}" is not a number`);
    return number;
  }
  return key === 'id' ? value : decodeAttribute(value, key);
}

/** Read one element into `{spec, children}`, children read too; `count` guards the size. */
function read(node, options, count, depth) {
  const tag = node.localName;
  if (depth > MAX_DEPTH) throw new TypeError(`xml: nested deeper than ${MAX_DEPTH}`);
  if ((count.n += 1) > options.limit) throw new TypeError(`xml: more than ${options.limit} elements`);
  const template = tag === PLAIN_TAG ? null : findType(tag);
  if (tag !== PLAIN_TAG && (!template || (options.types && !options.types.includes(tag)))) {
    throw new TypeError(`xml: <${tag}> is not a type this document may build`);
  }

  const spec = template ? { type: tag } : {};
  for (const { name, value } of Array.from(node.attributes)) {
    const key = camelCase(name.replace(/^data-/, ''));
    if (name.startsWith('xmlns') || !allowed(key, value, options)) {
      logger.warn(`<${tag}> ${name}: not a key XML may set; skipped`);
      continue;
    }
    spec[key] = valueOf(key, value, tag);
  }

  const slots = slotsOf(template);
  const fill = {};
  const children = [];
  let text = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3 || child.nodeType === 4) text += child.nodeValue;
    else if (child.nodeType !== 1) continue;
    else if (slots.has(child.localName) && child.children.length === 0) fill[child.localName] = child.textContent;
    else children.push(read(child, options, count, depth + 1));
  }
  if (text.trim() && slots.size === 1) fill[slots.keys().next().value] ??= text.trim();
  for (const name of Object.keys(fill)) {
    if (slots.get(name) && !options.html) {
      logger.warn(`<${tag}> ${name}: an html slot takes no XML unless {html: true}; skipped`);
      delete fill[name];
    }
  }
  if (Object.keys(fill).length > 0) spec.fill = fill;
  return { spec, children };
}

function build(parent, nodes) {
  return nodes.map(({ spec, children }) => {
    const b = parent.blit(spec);
    build(b, children);
    return b;
  });
}

/**
 * Build the blits an XML document describes under `parent`.
 * @param {object} parent a root or a blit
 * @param {string|XMLDocument} source XML text, or a document already parsed
 * @param {{types?: string[], keys?: string[], ports?: string[], html?: boolean, limit?: number}} [options] `types`
 *   and `keys` narrow which tags and (non-placement) attributes a document may use; `ports` names the ports a
 *   `port` attribute may choose (none by default); `html: true` lets text into html slots (as markup - only for
 *   documents you trust); `limit` caps the element count (XML_LIMIT)
 * @returns {object[]} the top-level blits built
 * @throws {TypeError} on malformed XML, an unknown or disallowed tag, a bad placement number, or too many elements
 */
export function fromXml(parent, source, options = {}) {
  const doc = typeof source === 'string' ? parseXml(source) : source;
  if (!doc?.documentElement) throw new TypeError('xml: expected XML text or an XMLDocument');
  const settings = {
    types: options.types ?? null, keys: options.keys ?? null, ports: options.ports ?? [], html: options.html === true,
    limit: options.limit ?? XML_LIMIT
  };
  const count = { n: 0 };
  const nodes = Array.from(doc.documentElement.children, (node) => read(node, settings, count, 1));
  return build(parent, nodes);
}
