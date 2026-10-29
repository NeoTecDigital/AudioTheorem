// Written by Richard Christopher, Copyright 2026 NeoTec, LLC
/**
 * A DOCUMENT, BY HAND, for the renderer tests that run under `node`.
 *
 * It was the top third of the storyboard renderer's suite until the Gantt cases
 * put that file past the 500-line limit, and it moved here rather than the
 * limit moving. The three behaviours the storyboard rules turned on are kept
 * exactly: `append`/`insertBefore` MOVE a node the way the real ones do (that
 * is what makes reconciliation observable as element identity), `dispatchEvent`
 * and `fire` bubble to ancestors unless a handler stopped them, and
 * `replaceChildren` clamps BOTH scroll offsets to 0 on the node and every
 * ancestor - the one browser fact the scroll cases are about: a scroll
 * container emptied and refilled has lost its position, and appending the new
 * content back does not restore it.
 *
 * THE EVENT PATH IS FIXED BEFORE THE FIRST HANDLER RUNS, as the real one is: a
 * handler that detaches its own element does not thereby stop the event
 * reaching the ancestors it had at dispatch. Walked lazily, a toggle that
 * rebuilt its row's head could never be caught bubbling into it.
 *
 * `style.setProperty` and `clientWidth` are here for the Gantt: the axis width
 * and the now-line are custom properties the sheet carries, and "Today" needs
 * a viewport to centre on. `style.getPropertyValue` and `style.removeProperty`
 * are here for the "more" button of the timeline and the calendar, which stands
 * where its item does by the geometry the item carries.
 *
 * WHAT THE CLOUDCANVAS UI KIT ASKS OF A DOCUMENT is here too, and
 * `tests/unit/ui-testing-cycle.test.js` is what holds it there: a node answers with its
 * `ownerDocument`, whether it `isConnected`, its first and last child and its
 * element children; the document finds a node by `id` and makes fragments and
 * namespaced nodes; a text area starts with an empty `value`; a listener added
 * with `{signal}` leaves when the signal aborts; and with no layout, every box
 * is the empty one. Each is the real behaviour and no more of it than the kit
 * uses. A `<dialog>` has no `showModal` here, and the kit opens one by its
 * `open` attribute instead.
 *
 * THE ELEMENT SIBLINGS EITHER SIDE OF A NODE are here for a list that is
 * redrawn: CloudCanvas's keyed reconciliation asks a row for its
 * `nextElementSibling`, and with no answer every redraw built the rows after
 * the first again and left the old ones standing. The breadcrumb case in
 * `tests/unified-notes.test.js` is what holds the walk forward here; the
 * sibling behind a node is its mirror, answered the same way. Before either
 * was here, a three-entry trail redrawn after a rename read
 *   AssertionError: expected [ 'Main Notebook', …(10) ] to deeply equal [ Array(3) ]
 *
 * `parentElement` IS HERE FOR THE KIT'S TAB LAYERS: a press on a layer is told
 * which tab it stands behind by the group it is in. The layer case in
 * `tests/tab-hierarchy.test.js` is what holds it. Before it was here, a layer
 * pressed read
 *   TypeError: Cannot read properties of undefined (reading 'getAttribute')
 *
 * `focus` TELLS THE NODE'S ANCESTORS, with the `focusin` a browser sends when
 * the focus moves: the kit's timeline, board and graph keep which item holds
 * the focus by hearing it, and return the focus there after a redraw. The
 * "View in" case of `tests/board-gestures.test.js` is what holds it. Before
 * `focus` said anything, an item focused in the timeline lost the focus to the
 * first bar at the next redraw, and that case read
 *   AssertionError: expected [ 'timeline', …(2) ] to deeply equal [ 'timeline', …(2) ]
 *
 * `matches` IS HERE FOR THE KIT CALENDAR, which asks the element that holds
 * focus whether it is one of its events before it redraws. The "View in" case
 * of `tests/board-gestures.test.js` is what holds it: it moves the focus to an
 * item and then shows the calendar. Before it was here, that case read
 *   TypeError: held.matches is not a function
 *
 * `localName`, `replaceWith` AND A TAG WITH ITS CLASSES IN `matches` ARE HERE
 * FOR THE KIT BOARD (kit `11cf55c`). A column that stands for an item has a
 * button for its heading's label: the board asks the label what it is, puts
 * the other kind in its place when the model changes, and asks a focused
 * heading whether it is still that button before it redraws. The heading
 * case in `tests/unit/ui-testing-cycle.test.js` is what holds all three, and says what
 * each read without it. Before any was here, every board mounted on this
 * document read
 *   TypeError: heading.firstChild.replaceWith is not a function
 *
 * `after` IS HERE FOR THE KIT COMBOBOX, which places its list right behind
 * the field it is given. The `after` case of `tests/unit/ui-testing-dom.test.js`
 * is what holds the placing itself, and the mention case of Momentum's
 * `tests/feed-logger-shared.test.js` the combobox on this document. Before it
 * was here, mounting the combobox read
 *   TypeError: input.after is not a function
 *
 * `prepend` IS HERE FOR THE KIT TABS: a tab's icon stands in a slot of its own before the label, and the
 * tab puts it there with `prepend`. Where a node's children go - `append`, `prepend`, `insertBefore`,
 * `after`, `replaceWith`, `replaceChildren` and `remove` - is in `place.js`. The tab-icon cases of
 * `tests/unit/ui-testing-mounts.test.js` and `tests/unit/ui-testing-dom.test.js` hold it. Before it was
 * here, a tab drawn with an icon on this document read
 *   TypeError [Error]: view.tab.prepend is not a function
 */

import { FRAGMENT, placing, replacing, textNode } from './place.js';

/**
 * One selector - or a comma list of them, which is how a focus trap names the
 * focusable kinds - against one node. One is an attribute, or a tag, classes,
 * or a tag with the classes it must also carry (`button.is-on`).
 * @param {any} node @param {string} selector
 */
function matches(node, selector) {
  return selector.split(',').map((one) => one.trim()).filter(Boolean).some((one) => {
    const attr = one.match(/^\[([a-z0-9-]+)(?:="([^"]*)")?\]$/);
    if (attr) {
      if (node.hasAttribute?.(attr[1]) !== true) return false;
      return attr[2] === undefined || node.getAttribute(attr[1]) === attr[2];
    }
    const [tag, ...classes] = one.split('.');
    if (classes.some((name) => node.classList?.contains(name) !== true)) return false;
    // An HTML node's tag is upper case; one made in another namespace keeps its own.
    return tag === '' || node.tagName === (node.namespaceURI ? tag : tag.toUpperCase());
  });
}

/**
 * The first element at or under `node`, in document order, whose id is `id`.
 * @param {any} node @param {string} id @returns {any}
 */
function withId(node, id) {
  if (node.getAttribute('id') === id) return node;
  for (const kid of node.childNodes) {
    const found = kid.tagName ? withId(kid, id) : null;
    if (found) return found;
  }
  return null;
}

/**
 * One event target's listeners, for a node or for the document.
 *
 * A listener added with `{signal}` leaves when that signal aborts, and is never
 * added under one that already has - as on the real target. It is how the kit's
 * controls let go: what they listen for is added under a signal, and `destroy`
 * aborts it. Ignoring the option would not throw; it would leave a destroyed
 * control listening.
 *
 * @returns {{add: (t: string, fn: Function, options?: any) => void, remove: (t: string, fn: Function) => void,
 *   of: (t: string) => Function[]}}
 */
function listenerList() {
  /** @type {Map<string, Function[]>} */ const listeners = new Map();
  const of = (/** @type {string} */ t) => listeners.get(t) ?? [];
  const remove = (/** @type {string} */ t, /** @type {Function} */ fn) => {
    listeners.set(t, of(t).filter((one) => one !== fn));
  };
  const add = (/** @type {string} */ t, /** @type {Function} */ fn, /** @type {any} */ options) => {
    const signal = options?.signal;
    if (signal?.aborted) return;
    listeners.set(t, [...of(t), fn]);
    signal?.addEventListener('abort', () => remove(t, fn), { once: true });
  };
  return { add, remove, of };
}

/**
 * The nearest sibling of `node` that is an element, `step` places at a time
 * (+1 after it, -1 before it), or null: text between two elements is passed
 * over, and a node with no parent has no siblings.
 * @param {any} node @param {1|-1} step @returns {any}
 */
function elementSibling(node, step) {
  const kin = node.parentNode?.childNodes ?? [];
  for (let at = kin.indexOf(node) + step; at >= 0 && at < kin.length; at += step) {
    if (kin[at].tagName) return kin[at];
  }
  return null;
}
/**
 * A NODE IS MADE IN PARTS. `makeNode` was one function of about 165 lines; each
 * part below is one concern of a node, under the 50-line limit, and `makeNode`
 * joins them BY PROPERTY DESCRIPTOR in the order it lists them. That is what
 * keeps this a split and not a change: an accessor stays an accessor (copying
 * values would fix `firstChild` at what it was when the node was made), and a
 * node's own keys are the same keys in the same order.
 */

/**
 * What a node reads of the tree around it.
 * @param {any} node @returns {any}
 */
function kin(node) {
  return {
    /** The tag as a sheet names it: lower case for an HTML node, as written for one made in another namespace. */
    get localName() { return node.namespaceURI ? node.tagName : node.tagName?.toLowerCase(); },
    /** The parent when it is an element: a fragment and the top of a detached tree are not. */
    get parentElement() { return node.parentNode?.tagName ? node.parentNode : null; },
    get firstChild() { return node.childNodes[0] ?? null; },
    get lastChild() { return node.childNodes[node.childNodes.length - 1] ?? null; },
    /** The children that are elements: text is a child node and not one of these. */
    get children() { return node.childNodes.filter((/** @type {any} */ kid) => kid.tagName); },
    get firstElementChild() { return node.children[0] ?? null; },
    get nextElementSibling() { return elementSibling(node, 1); },
    get previousElementSibling() { return elementSibling(node, -1); },
    /** In the document: the top of its parent chain is the installed document's body or head. */
    get isConnected() {
      /** @type {any} */ let top = node;
      while (top.parentNode) top = top.parentNode;
      const doc = globalThis.document;
      return Boolean(doc) && (top === doc.body || top === doc.head);
    },
    // There is one document, the installed one: `focus` below writes ITS
    // `activeElement`, so this is the document a node answers with.
    get ownerDocument() { return globalThis.document ?? null; },
  };
}

/**
 * What a node holds where a browser would have laid it out: shown, scrolled to
 * the start, no width, and an inline style that takes custom properties.
 * @returns {any}
 */
function surface() {
  /** @type {Record<string, any>} */
  const style = {
    setProperty(k, v) { style[k] = v; },
    getPropertyValue: (k) => (typeof style[k] === 'string' ? style[k] : ''),
    removeProperty(k) { const was = style.getPropertyValue(k); delete style[k]; return was; }
  };
  return {
    hidden: false,
    scrollTop: 0,
    scrollLeft: 0,
    clientWidth: 0,
    style,
  };
}

/**
 * A node's attributes and its classes, each kept in a collection of its own.
 * @returns {any}
 */
function attributes() {
  /** @type {Set<string>} */ const classes = new Set();
  /** @type {Map<string, string>} */ const attrs = new Map();
  return {
    // `id` is the attribute, read and written as a property, which is what
    // lets `getElementById` find a node however its id was given.
    get id() { return attrs.get('id') ?? ''; },
    set id(value) { attrs.set('id', String(value)); },
    get className() { return [...classes].join(' '); },
    set className(value) {
      classes.clear();
      for (const one of String(value).split(/\s+/).filter(Boolean)) classes.add(one);
    },
    classList: {
      add: (/** @type {string} */ n) => classes.add(n),
      remove: (/** @type {string} */ n) => classes.delete(n),
      contains: (/** @type {string} */ n) => classes.has(n),
      toggle: (/** @type {string} */ n, /** @type {boolean|undefined} */ force) => {
        const on = force === undefined ? !classes.has(n) : Boolean(force);
        if (on) classes.add(n); else classes.delete(n);
        return on;
      },
    },
    setAttribute: (/** @type {string} */ k, /** @type {any} */ v) => { attrs.set(k, String(v)); },
    getAttribute: (/** @type {string} */ k) => (attrs.has(k) ? attrs.get(k) : null),
    hasAttribute: (/** @type {string} */ k) => attrs.has(k),
    removeAttribute: (/** @type {string} */ k) => { attrs.delete(k); },
  };
}

/**
 * A node as an event target and as what holds focus.
 * @param {any} node @param {ReturnType<typeof listenerList>} events @returns {any}
 */
function interaction(node, events) {
  return {
    addEventListener: events.add,
    removeEventListener: events.remove,
    // The focus model the dialogs read: `focus` makes the node the document's
    // active element and says so to its ancestors (a node that already holds
    // the focus says nothing), `blur` clears it, `contains` walks the parent
    // chain the way the real one does, and `click` is a bubbling click.
    focus() {
      const doc = globalThis.document;
      if (!doc || doc.activeElement === node) return;
      doc.activeElement = node;
      node.fire('focusin');
    },
    blur() { if (globalThis.document?.activeElement === node) globalThis.document.activeElement = null; },
    contains(/** @type {any} */ other) {
      for (/** @type {any} */ let at = other; at; at = at.parentNode) if (at === node) return true;
      return false;
    },
    click() { node.fire('click'); },
    // Nothing is laid out here, so every box is the empty one the real document
    // answers with for a node it does not render.
    getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    dispatchEvent(/** @type {any} */ event) {
      let stopped = false;
      const original = event.stopPropagation?.bind(event);
      event.stopPropagation = () => { stopped = true; original?.(); };
      /** @type {any[]} */ const path = [];
      for (/** @type {any} */ let at = node; at; at = at.parentNode) path.push(at);
      for (const at of event.bubbles ? path : path.slice(0, 1)) {
        if (stopped) break;
        for (const fn of at.listeners(event.type)) fn(event);
      }
      return !stopped;
    },
    listeners: events.of,
    /** A hand-made event of `type`, bubbling like a click does. */
    fire(/** @type {string} */ type, /** @type {any} */ extra = {}) {
      return node.dispatchEvent({ type, bubbles: true, target: node, preventDefault() {}, ...extra });
    },
  };
}

/**
 * Finding nodes from this one: up the parent chain, or down the tree in
 * document order.
 * @param {any} node @returns {any}
 */
function finding(node) {
  return {
    matches(/** @type {string} */ selector) { return matches(node, selector); },
    closest(/** @type {string} */ selector) {
      for (/** @type {any} */ let at = node; at; at = at.parentNode) if (matches(at, selector)) return at;
      return null;
    },
    querySelector(/** @type {string} */ selector) { return node.querySelectorAll(selector)[0] ?? null; },
    querySelectorAll(/** @type {string} */ selector) {
      /** @type {any[]} */ const found = [];
      const walk = (/** @type {any} */ at) => {
        for (const kid of at.childNodes) {
          if (kid.tagName && matches(kid, selector)) found.push(kid);
          if (kid.tagName) walk(kid);
        }
      };
      walk(node);
      return found;
    },
  };
}

/**
 * A node's text: what its descendants hold when read, one text node when written.
 * @param {any} node @returns {any}
 */
function text(node) {
  return {
    get textContent() {
      return node.childNodes.map((/** @type {any} */ kid) => (kid.tagName ? kid.textContent : kid.data)).join('');
    },
    set textContent(value) {
      node.replaceChildren(textNode(value));
    },
  };
}

/** @param {string} tag @returns {any} */
export function makeNode(tag) {
  /** @type {any} */
  const node = {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    /** @type {any[]} */ childNodes: [],
    /** @type {any} */ parentNode: null,
  };
  const parts = [kin(node), surface(), attributes(), placing(node), replacing(node),
    interaction(node, listenerList()), finding(node), text(node)];
  for (const part of parts) Object.defineProperties(node, Object.getOwnPropertyDescriptors(part));
  // A text area starts with an empty value, not without one: a composer reads
  // its draft before anything has been typed into it.
  return node.tagName === 'TEXTAREA' ? Object.assign(node, { value: '' }) : node;
}

/**
 * Installs the stand-in as `globalThis.document`. Called BEFORE the renderer
 * is imported, because `cloudcanvas`'s template kit reads `document` at call
 * time and the import graph reaches it.
 *
 * It carries what a window-level surface asks of a document beyond the two
 * factories: a `body` and a `head` to mount into, an `activeElement` the focus
 * model above writes, and its own listener list with a `fire`, for the
 * document-level key handlers the dialogs bind and must unbind.
 *
 * @returns {any} the document, for a test that fires on it
 */
export function installDocument() {
  const events = listenerList();
  const doc = /** @type {any} */ ({
    createElement: (/** @type {string} */ tag) => makeNode(tag),
    // Outside HTML a tag keeps the case it was written in: an `svg` is not an `SVG`.
    createElementNS: (/** @type {string} */ namespaceURI, /** @type {string} */ tag) =>
      Object.assign(makeNode(tag), { tagName: tag, namespaceURI }),
    createTextNode: (/** @type {unknown} */ data = '') => ({ data: String(data), parentNode: null, childNodes: [] }),
    // A parent with no tag, which is never itself in the tree: see `inserted` in `place.js`.
    createDocumentFragment: () => Object.assign(makeNode('#document-fragment'), { tagName: undefined, nodeType: FRAGMENT }),
    activeElement: null,
    body: makeNode('body'),
    head: makeNode('head'),
    // Only what is IN the document answers, as with the real one: a node that
    // was made and never attached has an id and is not found by it.
    getElementById: (/** @type {string} */ id) => withId(doc.head, id) ?? withId(doc.body, id),
    addEventListener: events.add,
    removeEventListener: events.remove,
    listeners: events.of,
    fire(/** @type {string} */ type, /** @type {any} */ extra = {}) {
      const event = { type, target: doc, preventDefault() {}, ...extra };
      for (const fn of [...doc.listeners(type)]) fn(event);
      return event;
    },
  });
  globalThis.document = doc;
  return doc;
}
