/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * cursors: the focus reticle, the selection ring and the activation brackets,
 * drawn in screen space in one `<svg>` on the root's overlay.
 *
 *   blit.use({ cursors });
 *   blit('#app').set({ cursors: true });
 *
 * A cursor is a record with a `target` and one persistent `<g data-cursor>`.
 * It redraws only when its inputs moved - a different target, a moved camera,
 * or a target whose own box moved - so an idle frame writes nothing; and a
 * target that is not on screen withdraws the drawing but keeps the target.
 *
 * On a core root the targets follow the bubbling signals: `select`,
 * `focus:change` (`./focus.js`), `activate` / `deactivate`. Options are keyed
 * by cursor name: `{ 'cursor-focus': { showFrustum: false } }`.
 */
import { schedule } from '../core/frame.js';
import { stateOf } from '../core/state.js';
import {
  createFocusCursorSVG,
  createFrustumProjectionSVG,
  safeColor,
  safeNumber
} from '../graphics/primitives/primitives.js';
import { defineTrait, titleOf } from './trait.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const CURSOR_FOCUS = 'cursor-focus';
export const CURSOR_SELECTED = 'cursor-selected';
export const CURSOR_ACTIVATED = 'cursor-activated';

/** The three cursors, in attach order. */
export const CURSOR_TRAIT_NAMES = /* @__PURE__ */ Object.freeze([CURSOR_FOCUS, CURSOR_SELECTED, CURSOR_ACTIVATED]);

/** Class of the shared, pointer-transparent `<svg>` the cursors draw into. */
export const CURSOR_LAYER_CLASS = 'cloudcanvas-cursor-layer';

/*
 * Cursor colours are custom-property reads written out in full, because they
 * are interpolated into SVG attributes rather than matched by a rule. The inner
 * fallback ties the reticle to `--cc-focus`.
 */
export const CURSOR_FOCUS_COLOR = 'var(--cc-cursor-focus, var(--cc-focus, #833446))';
export const CURSOR_SELECTED_COLOR = 'var(--cc-cursor-selected, #38bdf8)';
export const CURSOR_ACTIVATED_COLOR = 'var(--cc-cursor-activated, #34d399)';

/** Caption colour: text with a contrast floor the focus red cannot clear. */
export const CURSOR_LABEL_COLOR = 'var(--cc-cursor-label, var(--cc-text, #e2e8f0))';

/** Never a real camera version: "never drawn". */
const NO_VERSION = -1;

const DEFAULT_HOST_RECT = /* @__PURE__ */ Object.freeze({ width: 800, height: 600, left: 0, top: 0 });
const LAYER_STYLE = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';

/** Per cursor: its colour, padding and caption default. */
export const CURSOR_DEFAULTS = /* @__PURE__ */ Object.freeze({
  [CURSOR_FOCUS]: /* @__PURE__ */ Object.freeze({ name: CURSOR_FOCUS, color: CURSOR_FOCUS_COLOR, padding: 8, label: '' }),
  [CURSOR_SELECTED]: /* @__PURE__ */ Object.freeze({ name: CURSOR_SELECTED, color: CURSOR_SELECTED_COLOR, padding: 6 }),
  [CURSOR_ACTIVATED]: /* @__PURE__ */ Object.freeze({ name: CURSOR_ACTIVATED, color: CURSOR_ACTIVATED_COLOR, padding: 4 })
});

/** The one `<svg>` every cursor group lives in, inside `overlay`; an existing one is reused. */
export function createCursorLayer(overlay) {
  if (!overlay || typeof document === 'undefined') return null;
  const existing = overlay.querySelector(`svg.${CURSOR_LAYER_CLASS}`);
  if (existing) return existing;

  const layer = document.createElementNS(SVG_NS, 'svg');
  layer.setAttribute('class', CURSOR_LAYER_CLASS);
  layer.setAttribute('style', LAYER_STYLE);
  layer.setAttribute('aria-hidden', 'true');
  overlay.appendChild(layer);
  return layer;
}

/** A blit's canvas box `{minX minY maxX maxY width height}`. */
function canvasBoxOf(target) {
  const { x, y, w, h } = target.bounds;
  return { minX: x, minY: y, maxX: x + w, maxY: y + h, width: w, height: h };
}

/**
 * A target's canvas box projected into host-relative screen pixels (unprojected without a viewport): the box
 * around its four corners, so a tilted camera's quad is enclosed; null when every corner is behind the viewer.
 */
export function screenBoundsOf(target, context = {}) {
  const hostRect = context.hostRect || DEFAULT_HOST_RECT;
  const viewport = context.viewport;
  const bounds = canvasBoxOf(target);
  if (!viewport || typeof viewport.canvasToScreen !== 'function') return bounds;

  const corners = [[bounds.minX, bounds.minY], [bounds.maxX, bounds.minY], [bounds.minX, bounds.maxY], [bounds.maxX, bounds.maxY]]
    .map(([x, y]) => viewport.canvasToScreen(x, y, hostRect)).filter(Boolean);
  if (corners.length === 0) return null;
  const xs = corners.map((corner) => corner.x - (hostRect.left || 0));
  const ys = corners.map((corner) => corner.y - (hostRect.top || 0));
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Whether a target is drawable: in the document, not inside a hidden branch (a promotion hides one), participating. */
export function isTargetVisible(target, context = {}) {
  if (!target || target.active === false) return false;
  const element = target.element ?? target.el ?? null;
  if (element && (element.isConnected === false || element.closest?.('[hidden]'))) return false;
  const participates = context.participates;
  return !(typeof participates === 'function' && !participates(target));
}

/* ------------------ THE RECORD ------------------ */

/**
 * A cursor record's fields. `label`: a string is used verbatim, `''` falls back
 * to the target's title, `null` is no caption.
 */
export function cursorFields(options, fixed) {
  return {
    layer: options.layer || null,
    color: safeColor(options.color, fixed.color),
    padding: safeNumber(options.padding !== undefined ? options.padding : fixed.padding, 8),
    label: options.label !== undefined ? options.label : (fixed.label || ''),
    target: null,
    _group: null,
    _shape: null,
    _drawnTarget: undefined,
    _drawnVersion: NO_VERSION,
    _visible: false
  };
}

/**
 * What every cursor does, as methods over its own record, which inherits them.
 * `draw(group, screenBounds, context)` is each kind's own.
 */
export const CURSOR_METHODS = {
  /** Point at a target, or clear with null. @returns {boolean} whether it changed */
  setTarget(target) {
    const next = target || null;
    if (next === this.target) return false;
    this.target = next;
    return true;
  },

  /** Re-host in another layer, dropping the old group. */
  setLayer(element) {
    const next = element || null;
    if (next === this.layer) return this.layer;
    this.layer = next;
    this._reset();
    return this.layer;
  },

  /** The target when it is on screen; the target itself survives being off it. */
  visibleTarget(context = {}) {
    return isTargetVisible(this.target, context) ? this.target : null;
  },

  /** Redraw when, and only when, this cursor's inputs moved. @returns {boolean} true when the DOM was written */
  renderCursor(frame) {
    if (!this.layer || !frame || !frame.context) return false;
    const target = this.visibleTarget(frame.context);
    if (!this._changed(target, frame)) return false;

    this._drawnTarget = target;
    this._drawnVersion = frame.viewportVersion;
    if (!target) return this._setVisible(false);

    const box = screenBoundsOf(target, frame.context);
    if (!box) return this._setVisible(false);
    this.draw(this.group(), box, frame.context);
    this._setVisible(true);
    return true;
  },

  /** Whether the drawn output can no longer be trusted. */
  _changed(target, frame) {
    if (this._drawnTarget !== target || this._drawnVersion !== frame.viewportVersion) return true;
    return Boolean(target && typeof frame.isDirty === 'function' && frame.isDirty(target));
  },

  /** The `<g data-cursor>`, made in the layer on first draw. */
  group() {
    if (this._group) return this._group;
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('data-cursor', this.name);
    this.layer.appendChild(group);
    this._group = group;
    return group;
  },

  /** The one persistent shape, made once with its static attributes. */
  shape(tag, attributes = {}) {
    if (this._shape) return this._shape;
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    this.group().appendChild(node);
    this._shape = node;
    return node;
  },

  /** Show or hide the group, writing only on a real change. */
  _setVisible(visible) {
    if (!this._group || this._visible === visible) return false;
    this._group.setAttribute('display', visible ? 'inline' : 'none');
    this._visible = visible;
    return true;
  },

  /** The caption: the label, else the target's name - its `aria-label`, or a `title` in its contents - else nothing. */
  resolveLabel() {
    if (this.label === null) return '';
    if (this.label) return this.label;
    const element = this.target?.el ?? this.target?.element ?? null;
    return element ? titleOf(element) : '';
  },

  /** Forget the drawing: the group, the shape and the gate. */
  _reset() {
    this._group = null;
    this._shape = null;
    this._drawnTarget = undefined;
    this._drawnVersion = NO_VERSION;
    this._visible = false;
  },

  /** Take the group out of the layer and forget the drawing. */
  onDetach() {
    if (this._group) this._group.remove();
    this._reset();
  }
};

/* ------------------ THE THREE KINDS ------------------ */

/** Four corner brackets around a padded box, as one path. */
function bracketPath(bounds, padding, arm) {
  const x = bounds.minX - padding;
  const y = bounds.minY - padding;
  const right = bounds.maxX + padding;
  const bottom = bounds.maxY + padding;
  return [
    `M ${x} ${y + arm} L ${x} ${y} L ${x + arm} ${y}`,
    `M ${right - arm} ${y} L ${right} ${y} L ${right} ${y + arm}`,
    `M ${right} ${bottom - arm} L ${right} ${bottom} L ${right - arm} ${bottom}`,
    `M ${x + arm} ${bottom} L ${x} ${bottom} L ${x} ${bottom - arm}`
  ].join(' ');
}

/** Each kind's options past the shared fields, and its methods. */
export const CURSOR_KINDS = /* @__PURE__ */ Object.freeze({
  [CURSOR_FOCUS]: {
    extra: (options) => ({
      showFrustum: options.showFrustum !== undefined ? Boolean(options.showFrustum) : true,
      labelColor: safeColor(options.labelColor, CURSOR_LABEL_COLOR)
    }),
    methods: {
      /** The reticle and the frustum; markup, so `innerHTML` once per change. */
      draw(group, bounds, context) {
        group.innerHTML = this.frustum(bounds, context)
          + createFocusCursorSVG(bounds, { color: this.color, labelColor: this.labelColor, label: this.resolveLabel(), padding: this.padding });
      },

      /** The spikes from the parent scope's box, or nothing: no option, no parent, or one never measured. */
      frustum(bounds, context) {
        if (!this.showFrustum) return '';
        const parent = this.target ? this.target.parent : null;
        if (!parent) return '';
        const parentBounds = screenBoundsOf(parent, context);
        if (!(parentBounds?.maxX - parentBounds?.minX > 0)) return '';
        return createFrustumProjectionSVG(parentBounds, bounds, { stroke: this.color });
      }
    }
  },
  [CURSOR_SELECTED]: {
    extra: () => ({}),
    methods: {
      /** The selection ring: one retained `<rect>`. */
      draw(group, bounds) {
        const node = this.shape('rect', {
          class: 'cloudcanvas-cursor-selected', fill: 'none', rx: 6, 'stroke-width': 2, 'stroke-dasharray': '3,3'
        });
        node.setAttribute('stroke', this.color);
        node.setAttribute('x', (bounds.minX - this.padding).toFixed(1));
        node.setAttribute('y', (bounds.minY - this.padding).toFixed(1));
        node.setAttribute('width', (bounds.maxX - bounds.minX + this.padding * 2).toFixed(1));
        node.setAttribute('height', (bounds.maxY - bounds.minY + this.padding * 2).toFixed(1));
      }
    }
  },
  [CURSOR_ACTIVATED]: {
    extra: (options) => ({ armLength: safeNumber(options.armLength, 12) }),
    methods: {
      /** The activation brackets: one retained `<path>`. */
      draw(group, bounds) {
        const node = this.shape('path', {
          class: 'cloudcanvas-cursor-activated', fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round'
        });
        node.setAttribute('stroke', this.color);
        node.setAttribute('d', bracketPath(bounds, this.padding, this.armLength));
      }
    }
  }
});

/** A native cursor record: the shared methods, then its kind's, then its fields. */
function createCursor(name, options) {
  const kind = CURSOR_KINDS[name];
  const c = Object.assign(Object.create(CURSOR_METHODS), kind.methods);
  return Object.assign(c, { name }, cursorFields(options, CURSOR_DEFAULTS[name]), kind.extra(options));
}

/* ------------------ THE ROOT TRAIT ------------------ */

/** Which cursor a signal moves, and whether its payload claims or releases it. */
const SIGNALS = /* @__PURE__ */ Object.freeze({
  select: (payload) => [CURSOR_SELECTED, Boolean(payload)],
  'focus:change': (payload) => [CURSOR_FOCUS, Boolean(payload)],
  activate: () => [CURSOR_ACTIVATED, true],
  deactivate: () => [CURSOR_ACTIVATED, false]
});

/** A blit's box as a comparable key: the "target moved" half of the change gate. */
function boxKey(target) {
  const { x, y, w, h } = target.bounds;
  return `${x},${y},${w},${h}`;
}

/** The camera's projection, in the shape `screenBoundsOf` reads. */
function projectionOf(camera) {
  return {
    canvasToScreen: (x, y, rect = {}) => {
      if (!camera.is3d) return { x: x * camera.scale + camera.x + (rect.left || 0), y: y * camera.scale + camera.y + (rect.top || 0) };
      const at = camera.project(x, y, rect);
      return at && { x: at.x + (rect.left || 0), y: at.y + (rect.top || 0) };
    }
  };
}

/** Draw one record if its inputs moved, remembering the box it drew. */
function drawRecord(c, context, version) {
  const frame = { context, viewportVersion: version, isDirty: (target) => boxKey(target) !== c._drawnKey };
  if (c.renderCursor(frame)) c._drawnKey = c._drawnTarget ? boxKey(c._drawnTarget) : undefined;
}

/** Three records on the root's overlay, following the signals, drawn in the write phase. */
function mount(s, b, root) {
  const layer = createCursorLayer(root.overlay);
  const records = CURSOR_TRAIT_NAMES.map((name) => createCursor(name, { ...(s.options[name] || {}), layer }));
  const byName = new Map(records.map((c) => [c.name, c]));
  const viewport = projectionOf(root.camera);
  let version = 0;

  const onSignal = (event) => {
    const target = stateOf(event.target)?.handle;
    if (!target || target.el === root.host) return;
    const [name, claim] = SIGNALS[event.type](event.detail ? event.detail.payload : null);
    const c = byName.get(name);
    if (claim) c.setTarget(target);
    else if (c.target === target) c.setTarget(null);
    schedule(root);
  };
  // A restart (new options) picks up what is focused and selected now, rather than waiting for the next change.
  const seed = (name, selector) => {
    const element = Array.from(root.host.querySelectorAll(selector)).pop();
    const target = element && stateOf(element)?.handle;
    if (target) byName.get(name).setTarget(target);
  };
  seed(CURSOR_FOCUS, '.is-focused');
  seed(CURSOR_SELECTED, '.is-selected');
  const offs = Object.keys(SIGNALS).map((type) => listenOn(root.host, type, onSignal));
  offs.push(b.tick((ctx) => {
    if (ctx.cameraMoved) version += 1;
    const context = { hostRect: ctx.hostRect, viewport };
    for (const c of records) drawRecord(c, context, version);
  }, 'write'));

  return () => {
    for (const off of offs) off();
    for (const c of records) c.onDetach();
  };
}

/** Listen on an element. @returns {() => void} off */
function listenOn(element, type, listener) {
  element.addEventListener(type, listener);
  return () => element.removeEventListener(type, listener);
}

export const cursors = /* @__PURE__ */ defineTrait({
  init: (options) => ({ options }),
  mount
});
