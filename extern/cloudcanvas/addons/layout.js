/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * layout: how a blit arranges its children, and the scope well that holds them.
 *
 *   blit.use({ layout, gap });
 *   const list = app.blit({ layout: 'row', gap: 16 });
 *
 * `free` (or `true`) keeps every child placed by its own transform; `row`,
 * `column` and `grid` lay the scope container out with flex or grid. A flow
 * child switches to the `flow` port, which writes its declared size and no
 * transform (outside a flow container it places like the default port), and
 * carries `is-flow-child`; leaving flow restores its port and its transform.
 * Its real position is the one flex/grid gives it: every frame a read tick
 * stores each flow child's offset in its scope container as its flow origin
 * (`fx`/`fy`), which the core's `bounds` read over the author's `x`/`y` (those
 * still round-trip through the spec); leaving flow clears it. A container whose
 * flow children moved or resized is re-measured, since flex/grid sized it.
 *
 * The well: a container's scope has no intrinsic height (its children are
 * absolute), so each frame that moved one of its children a read tick folds the
 * children's extent and a write tick writes it - `min-height` from the furthest
 * live bottom edge (a flow container sizes itself instead) and `cc-populated`
 * while any live child is inside. A written well is re-measured next frame, one
 * level per frame. `reorder(b, before)` moves a child within its container.
 */
import { stateOf, parentElementOf, parentNodeOf, rootOf, scopeContainerOf, sizeOf } from '../core/state.js';
import { schedule } from '../core/frame.js';
import { defaultPort, forgetPlacement } from '../core/port.js';
import { use } from '../core/use.js';
import { LAYOUT_CSS } from '../graphics/css/layout.js';
import { nodeOf } from './park.js';
import { injectAddonCss } from './trait.js';

/** The four modes; `free` is placement by transform. */
export const LAYOUT_MODES = /* @__PURE__ */ Object.freeze({ FREE: 'free', ROW: 'row', COLUMN: 'column', GRID: 'grid' });

const LAYOUT_VALUES = /* @__PURE__ */ new Set(/* @__PURE__ */ Object.values(LAYOUT_MODES));

/** The scope-container class each flow mode is expressed by. */
export const LAYOUT_CLASS = /* @__PURE__ */ Object.freeze({ row: 'is-layout-row', column: 'is-layout-column', grid: 'is-layout-grid' });

/** The class a child carries while its container lays it out in flow. */
export const FLOW_CHILD_CLASS = 'is-flow-child';

/** The custom property `gap` writes; every flow mode reads it. */
export const LAYOUT_GAP_PROPERTY = '--cc-layout-gap';

/** The class granting a scope well its box: written only while a live child is inside. */
export const SCOPE_POPULATED_CLASS = 'cc-populated';

/** @type {WeakMap<Element, string>} container blit element -> its mode */
const CONTAINERS = /* @__PURE__ */ new WeakMap();


/** @type {WeakMap<object, object>} root -> its layout record */
const RECORDS = /* @__PURE__ */ new WeakMap();

/** Whether a mode places children by flow rather than by their own transforms. */
export function isFlowLayout(mode) {
  return Boolean(mode) && mode !== LAYOUT_MODES.FREE;
}

/** A declared mode: `true`/none is free; an unknown one throws. */
export function layoutModeOf(value) {
  if (value === undefined || value === null || value === true) return LAYOUT_MODES.FREE;
  if (!LAYOUT_VALUES.has(value)) {
    throw new TypeError(`layout: unknown mode "${value}"; expected one of ${Array.from(LAYOUT_VALUES).join(', ')}`);
  }
  return value;
}

/** Write one well: `min-height` unless it flows or is empty, and the populated class. */
export function writeWell(scope, { height, populated, flow }) {
  scope.style.minHeight = populated && !flow ? `${height}px` : '';
  scope.classList.toggle(SCOPE_POPULATED_CLASS, populated);
}

/** The first element whose main-axis midpoint `point` has not reached, or null to append. */
export function siblingBefore(elements, point, horizontal) {
  if (!Number.isFinite(point)) return null;
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    const mid = horizontal ? (rect.left + rect.right) / 2 : (rect.top + rect.bottom) / 2;
    if (point < mid) return element;
  }
  return null;
}

/** The node a blit's children live in: a root's plane, else its scope container. */
function containerOf(state) {
  return state.root ? state.root.plane : scopeContainerOf(state.el);
}

/**
 * The `flow` port: a flow child's declared size and no transform. A blit that
 * carries it outside a flow container (a spec saved mid-flow) places as usual.
 * The port it stands in for is held in `state.heldPort` (the spec names that
 * one); a held port that declares `inFlow` still runs, with `ctx.flow` set, for
 * its work beyond placement - the `gpu` port keeps drawing a flow child.
 */
export function flow(b, ctx) {
  const element = b.el;
  if (!isFlowLayout(CONTAINERS.get(parentElementOf(element)))) return defaultPort(b);
  const state = stateOf(element);
  const { w, h } = state;
  if (w !== null && (ctx.first || ctx.changed.has('w'))) element.style.width = `${w}px`;
  if (h !== null && (ctx.first || ctx.changed.has('h'))) element.style.height = `${h}px`;
  if (state.heldPort?.inFlow) state.heldPort(b, { ...ctx, flow: true });
  return false;
}

/** Put a child on the flow port (no DOM write): the port it had is kept to hand back. */
function enterFlowPort(state) {
  if (state.port === flow) return false;
  state.heldPort = state.port;
  state.port = flow;
  return true;
}

/** Hand a child its own port back and queue its transform. @returns {boolean} whether it was in flow */
function leaveFlowPort(state, root) {
  state.fx = null;
  state.fy = null;
  if (state.port !== flow) return false;
  state.port = state.heldPort ?? null;
  state.heldPort = null;
  forgetPlacement(state.el);
  state.changed.add('x');
  if (root) {
    root.dirty.add(state);
    schedule(root);
  }
  return true;
}

/** The DOM half of a flow switch: the class, and no leftover transform on entry. */
function writeFlowChild(state, inFlow) {
  const element = state.el;
  if (element.classList.contains(FLOW_CHILD_CLASS) === inFlow) return;
  element.classList.toggle(FLOW_CHILD_CLASS, inFlow);
  if (inFlow) element.style.transform = '';
  forgetPlacement(element);
}

/** Bring one child into line with its container's mode, now. */
function syncChild(state, inFlow, root) {
  if (inFlow) enterFlowPort(state);
  else leaveFlowPort(state, root);
  writeFlowChild(state, inFlow);
}

/** The direct child blit states of a container element. */
function childStates(element) {
  const container = containerOf(stateOf(element));
  return Array.from(container.querySelectorAll('[data-blit]'))
    .filter((child) => parentElementOf(child) === element)
    .map(stateOf)
    .filter(Boolean);
}

/** A container's well from its live children: the extent rounded up, whether any is inside. */
function wellOf(element) {
  let extent = 0;
  let populated = false;
  for (const child of childStates(element)) {
    if (!child.el.isConnected || child.el.hidden) continue;
    populated = true;
    extent = Math.max(extent, child.y + sizeOf(child).h);
  }
  return { height: Math.ceil(extent), populated, flow: isFlowLayout(CONTAINERS.get(element)) };
}

/**
 * Read tick: every container a painted child moved in or out of owes its well; new flow children switch port;
 * then every flow child's origin is read (`readFlowOrigins`).
 */
function readPass(record, root) {
  for (const state of root.dirty) {
    const parent = parentElementOf(state.el);
    const previous = record.parentOf.get(state.el);
    if (previous !== parent) {
      if (previous) record.invalidated.add(previous);
      record.parentOf.set(state.el, parent);
    }
    if (CONTAINERS.has(parent)) record.invalidated.add(parent);
    const inFlow = isFlowLayout(CONTAINERS.get(parent));
    if (inFlow) enterFlowPort(state);
    if (inFlow || state.port === flow) record.flowSync.push([state, inFlow]);
  }
  for (const element of record.invalidated) {
    if (CONTAINERS.has(element) && element.isConnected && !stateOf(element).root) record.wells.push([element, wellOf(element)]);
  }
  record.invalidated.clear();
  readFlowOrigins(record, root);
}

/** Store each flow child's offset (layout space) as its flow origin. @returns {string} the children's boxes */
function readFlowChildren(element) {
  const boxes = [];
  for (const child of childStates(element)) {
    const node = child.el;
    if (!node.isConnected || node.hidden || !node.classList.contains(FLOW_CHILD_CLASS)) continue;
    child.fx = Number(node.offsetLeft) || 0;
    child.fy = Number(node.offsetTop) || 0;
    boxes.push(child.fx, child.fy, child.mw, child.mh);
  }
  return boxes.join();
}

/** Every flow container's children read; one whose children moved or resized is re-measured next frame. */
function readFlowOrigins(record, root) {
  for (const element of record.containers) {
    if (!isFlowLayout(CONTAINERS.get(element)) || !element.isConnected) continue;
    const boxes = readFlowChildren(element);
    if (record.boxes.get(element) === boxes) continue;
    record.boxes.set(element, boxes);
    const state = stateOf(element);
    if (!state.root) root.measure.add(state);
    schedule(root);
  }
}

/** Write tick: flow classes, then each well that changed; a written well is re-measured next frame. */
function writePass(record, root) {
  for (const [state, inFlow] of record.flowSync) {
    if (!inFlow) leaveFlowPort(state, root);
    writeFlowChild(state, inFlow);
  }
  // What was just painted in flow is laid out by the browser now; its origin is read next frame.
  if (record.flowSync.length > 0) schedule(root);
  record.flowSync.length = 0;
  for (const [element, well] of record.wells) {
    const applied = record.applied.get(element);
    if (applied && applied.height === well.height && applied.populated === well.populated && applied.flow === well.flow) continue;
    record.applied.set(element, well);
    const state = stateOf(element);
    writeWell(containerOf(state), well);
    root.measure.add(state);
    schedule(root);
  }
  record.wells.length = 0;
}

/** The root's record, its two ticks installed on first use. */
function recordOf(root) {
  let record = RECORDS.get(root);
  if (record) return record;
  record = {
    count: 0, invalidated: new Set(), parentOf: new WeakMap(), applied: new WeakMap(), flowSync: [], wells: [], offs: [],
    containers: new Set(), boxes: new WeakMap()
  };
  const host = stateOf(root.host).handle;
  record.offs.push(host.tick(() => readPass(record, root), 'read'), host.tick(() => writePass(record, root), 'write'));
  RECORDS.set(root, record);
  injectAddonCss('layout', LAYOUT_CSS);
  use({ flow });
  return record;
}

/** Mirror the mode onto the container: one `is-layout-*` class, or none. */
function writeLayoutClass(container, mode) {
  for (const name of Object.values(LAYOUT_CLASS)) container.classList.remove(name);
  if (isFlowLayout(mode)) container.classList.add(LAYOUT_CLASS[mode]);
}

/**
 * The named trait: the blit lays its children out in `mode`. Its existing
 * children switch now; new ones as they are painted. Stopping it frees every
 * child and takes the class and the well off. An unknown mode throws and takes
 * its own `data-layout` with it.
 */
export function layout(b, options, root = rootOf(stateOf(b.el))) {
  let mode;
  try {
    mode = layoutModeOf(options);
  } catch (error) {
    b.el.removeAttribute('data-layout');
    throw error;
  }
  if (!root) throw new TypeError('layout: a potential blit has no root');
  const record = recordOf(root);
  const container = containerOf(stateOf(b.el));
  record.count += 1;
  record.containers.add(b.el);
  CONTAINERS.set(b.el, mode);
  writeLayoutClass(container, mode);
  for (const child of childStates(b.el)) syncChild(child, isFlowLayout(mode), root);
  refresh(b);
  // A child leaving paints nothing, so the well it sat in is recomputed from the event.
  const offRemove = b.on('remove', (event) => { if (event.detail?.source !== b) refresh(b); });
  return () => { offRemove(); stopLayout(b, root, record, container); };
}

/** Undo one container: children freed, class and well off, the ticks gone with the last container. */
function stopLayout(b, root, record, container) {
  CONTAINERS.delete(b.el);
  record.containers.delete(b.el);
  record.boxes.delete(b.el);
  writeLayoutClass(container, LAYOUT_MODES.FREE);
  for (const child of childStates(b.el)) syncChild(child, false, root);
  container.style.minHeight = '';
  container.classList.remove(SCOPE_POPULATED_CLASS);
  record.applied.delete(b.el);
  record.count -= 1;
  if (record.count > 0) return;
  for (const off of record.offs) off();
  RECORDS.delete(root);
}

/** The named trait `gap`: the flow gap in px on the scope container; not a number >= 0 writes nothing. */
export function gap(b, options) {
  const container = containerOf(stateOf(b.el));
  const value = options === null || options === true ? NaN : Number(options);
  if (!Number.isFinite(value) || value < 0) return undefined;
  container.style.setProperty(LAYOUT_GAP_PROPERTY, `${value}px`);
  return () => container.style.removeProperty(LAYOUT_GAP_PROPERTY);
}

/** Recompute a container's well next frame: for a change no painted child shows (a child removed). */
export function refresh(b) {
  const root = rootOf(stateOf(b.el));
  const record = root && RECORDS.get(root);
  if (!record || !CONTAINERS.has(b.el)) return false;
  record.invalidated.add(b.el);
  schedule(root);
  return true;
}

/** The mode a container lays its children out in, or null when it carries no layout. */
export function layoutOf(b) {
  return CONTAINERS.get(b.el) ?? null;
}

/**
 * Move `b` within its container to sit before sibling `before` (null: the end).
 * Only order changes; a parked blit moves by its anchor.
 * @returns {object|null} `b`, or null when `before` is `b` or not a sibling
 */
export function reorder(b, before = null) {
  const parent = parentElementOf(b.el);
  if (!parent || (before && (before.el === b.el || parentElementOf(before.el) !== parent))) return null;
  const scope = parentNodeOf(b.el);
  const ref = before ? nodeOf(before.el) : null;
  scope.insertBefore(nodeOf(b.el), ref && ref.parentNode === scope ? ref : null);
  return b;
}

/** The sibling a drop at client `point` lands `b` before in its container's flow, or null to append. */
export function insertionBefore(b, point) {
  const parent = parentElementOf(b.el);
  if (!parent) return null;
  const horizontal = CONTAINERS.get(parent) === LAYOUT_MODES.ROW;
  const siblings = childStates(parent).map((state) => state.el).filter((element) => element !== b.el);
  const found = siblingBefore(siblings, horizontal ? point?.clientX : point?.clientY, horizontal);
  return found ? stateOf(found).handle : null;
}
