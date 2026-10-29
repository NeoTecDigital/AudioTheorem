/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * GPU: a root that draws blits on the GPU. `gpu(app, {backend, layer})` puts a `<canvas data-blit-gpu>` in the
 * host (under the plane by default), loads a backend by `import()` only, and draws every blit on the named port
 * `gpu` (`b.set({port: 'gpu'})`) from one scene (`./gpu-scene.js`) in one write-phase pass after the plane's -
 * and draws nothing on a frame where no drawn blit changed and the camera stood still. A gpu blit's element stays
 * where the default port puts it, transparent, as its hit proxy: pointer events, hit-testing, keyboard roving and
 * the accessibility tree work unchanged. What a blit draws is its `tint` (`#rgb`, `#rrggbb` or `#rrggbbaa`) or
 * the content an add-on gives it through `gpuContent(b, ...)`: a textured quad, a mesh, or several parts.
 */
import { multiply } from '../core/camera.js';
import { schedule } from '../core/frame.js';
import { defaultPort } from '../core/port.js';
import { BLIT_ATTR, boundsOf, isWithin, parentElementOf, rootOf, sizeOf, stateOf } from '../core/state.js';
import { use } from '../core/use.js';
import { createLogger } from '../log.js';
import { Scene, clipMatrix } from './gpu-scene.js';

const logger = /* @__PURE__ */ createLogger('gpu');

/** The marker on the canvas a gpu root draws into. */
export const GPU_ATTR = 'data-blit-gpu';

/** @type {WeakMap<object, object>} root -> its gpu controller */
const GPUS = /* @__PURE__ */ new WeakMap();

/** @type {WeakMap<object, object|object[]>} blit state -> the content an add-on gave it */
const CONTENT = /* @__PURE__ */ new WeakMap();

/** @type {WeakMap<object, object[]>} blit state -> the scene keys of its parts, one per content part */
const PARTS = /* @__PURE__ */ new WeakMap();

/** @type {WeakSet<object>} DOM blits wearing `punch`: holes in an `over` canvas */
const PUNCHED = /* @__PURE__ */ new WeakSet();

/** @type {WeakMap<object, object>} member state -> its controller: a port call skips the walk up to the root */
const JOINED = /* @__PURE__ */ new WeakMap();

/** @type {WeakMap<object, [string|null, number[]]>} blit state -> its last `data-tint` and that tint parsed */
const TINTS = /* @__PURE__ */ new WeakMap();

/** @type {WeakSet<object>} gpu blits whose element stays painted (`paintedProxy`) */
const PAINTED = /* @__PURE__ */ new WeakSet();

/** @type {WeakMap<Element, string>} proxy element -> the inline opacity it had before */
const PROXIES = /* @__PURE__ */ new WeakMap();

/** The backends by name, loaded on demand so neither lands in a static chunk. */
const BACKENDS = /* @__PURE__ */ Object.freeze({
  webgpu: () => import('./gpu-webgpu.js'),
  webgl2: () => import('./gpu-webgl2.js')
});

/** A hex tint as straight RGBA in 0..1; anything else is white. */
export function parseTint(value) {
  const hex = typeof value === 'string' ? value.trim().replace(/^#/, '') : '';
  if (!/^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return [1, 1, 1, 1];
  const full = hex.length === 3 ? hex.replace(/./g, '$&$&') : hex;
  const channels = full.match(/../g).map((pair) => parseInt(pair, 16) / 255);
  return channels.length === 3 ? [...channels, 1] : channels;
}

/**
 * The port: the default port places the element (the hit proxy), and the blit's record is queued for the
 * scene. Under a root without `gpu(app)` it is the default port and nothing more. It runs under layout's `flow`
 * port too (`inFlow`), where the layout places the element and the port only draws.
 */
export const gpuPort = /* @__PURE__ */ Object.assign(function gpuPort(b, ctx) {
  if (!ctx?.flow) defaultPort(b);
  const state = stateOf(b.el);
  const joined = state && JOINED.get(state);
  const controller = joined && !joined.destroyed ? joined : state && controllerOf(state);
  if (!controller) return;
  if (!PROXIES.has(b.el) && !PAINTED.has(state)) {
    PROXIES.set(b.el, b.el.style.opacity);
    b.el.style.opacity = '0';
  }
  controller.members.add(state);
  JOINED.set(state, controller);
  controller.touched.add(state);
}, { inFlow: true });

/** Whether a blit is on the gpu port: its own, or held behind a stand-in (layout's `flow`). */
const onGpuPort = (state) => state.port === gpuPort || state.heldPort === gpuPort;

/**
 * Give a blit what it draws; null goes back to its `tint`, and a list draws each part in order. A part is a quad,
 * `{color: [r, g, b, a], texture, uv: [u0, v0, u1, v1], rotation, version}` (a new `version` re-uploads the
 * texture), or a mesh, `{mesh: {vertices, indices}, color, lit}` fitted to the blit one of two ways: a unit shape
 * centred in the box, scaled to it and to `depth` (px; the smaller side by default) and turned by `rotate`
 * (`[x, y, z]` degrees), or path units mapped from `viewBox: [x, y, w, h]` onto the box. A part with no `color`
 * takes the tint. Content add-ons (sprites, text, media, mesh, svg-path) build on this. @returns {object} the blit
 */
export function gpuContent(b, content) {
  const state = stateOf(b.el);
  if (!state) throw new TypeError('gpuContent: not a blit');
  if (content) CONTENT.set(state, content);
  else CONTENT.delete(state);
  const controller = controllerOf(state);
  if (controller) {
    controller.touched.add(state);
    schedule(controller.root);
  }
  return b;
}

/**
 * Keep a gpu blit's element painted instead of transparent (`on`), or let it be a transparent proxy again. For
 * content the browser must paint to capture - HTML-in-Canvas - whose element then shows nothing on screen by
 * itself (`./html-canvas.js` clears its canvas after each capture). @returns {object} the blit
 */
export function paintedProxy(b, on = true) {
  const state = stateOf(b.el);
  if (!state) throw new TypeError('paintedProxy: not a blit');
  if (on) {
    PAINTED.add(state);
    if (PROXIES.has(b.el)) {
      b.el.style.opacity = PROXIES.get(b.el);
      PROXIES.delete(b.el);
    }
  } else {
    PAINTED.delete(state);
    b.set({});
  }
  return b;
}

/**
 * The `punch` trait, for a DOM blit (not on the `gpu` port) that shows under a canvas layered `over` the plane:
 * the GPU clears its box at its `z`, so GPU content below that `z` makes way for the element, and content above
 * it still draws over. Under an `under` canvas it changes nothing visible. @returns {() => void} cleanup
 */
export function punch(b) {
  const state = stateOf(b.el);
  PUNCHED.add(state);
  const controller = controllerOf(state);
  if (controller) join(controller, state);
  return () => {
    PUNCHED.delete(state);
    const current = controllerOf(state);
    if (current) {
      forget(current, state);
      schedule(current.root);
    }
  };
}

/** Whether a blit draws on the GPU: on the port, or a punch that is not. */
const drawsOnGpu = (state) => onGpuPort(state) || PUNCHED.has(state);

/** A blit becomes a member and is recorded next frame. */
function join(controller, state) {
  controller.members.add(state);
  JOINED.set(state, controller);
  controller.touched.add(state);
  schedule(controller.root);
}

/** The controller of the gpu root a blit sits under, or null. */
function controllerOf(state) {
  const root = rootOf(state);
  return (root && GPUS.get(root)) || null;
}

/** CSS `rotateX`, then `rotateY`, then `rotateZ` (degrees), column-major. */
function rotationOf([rx = 0, ry = 0, rz = 0]) {
  const [a, b, c] = [rx, ry, rz].map((deg) => deg * Math.PI / 180);
  const x = [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1];
  const y = [Math.cos(b), 0, -Math.sin(b), 0, 0, 1, 0, 0, Math.sin(b), 0, Math.cos(b), 0, 0, 0, 0, 1];
  const z = [Math.cos(c), Math.sin(c), 0, 0, -Math.sin(c), Math.cos(c), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return multiply(multiply(x, y), z);
}

/** A mesh part's units to canvas px on the box `{x, y, w, h}` at depth `z`: a viewBox mapped, or a unit shape fitted. */
export function meshTransform({ x, y, w, h }, z, part) {
  if (part.viewBox) {
    const [vx, vy, vw, vh] = part.viewBox;
    const [sx, sy] = [w / vw, h / vh];
    return Float64Array.of(sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 1, 0, x - vx * sx, y - vy * sy, z, 1);
  }
  const depth = part.depth ?? Math.min(w, h);
  const place = Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x + w / 2, y + h / 2, z, 1);
  const scale = Float64Array.of(w, 0, 0, 0, 0, h, 0, 0, 0, 0, depth, 0, 0, 0, 0, 1);
  return part.rotate ? multiply(multiply(place, rotationOf(part.rotate)), scale) : multiply(place, scale);
}

/** What the scene draws for one part of a blit on its global box. */
function recordOf(state, box, part, tint) {
  const color = part?.color ?? tint;
  if (part?.mesh) {
    return { mesh: part.mesh, transform: meshTransform(box, state.z, part), z: state.z, color, lit: part.lit !== false };
  }
  return {
    x: box.x, y: box.y, w: box.w, h: box.h, z: state.z, rotation: part?.rotation ?? 0, color,
    texture: part?.texture ?? null, uv: part?.uv, version: part?.version
  };
}

/** Every part a blit draws, in order; `topLevel` (its parent is the root) reads its box without a walk. */
function recordsOf(state, topLevel) {
  const box = topLevel ? { x: state.fx ?? state.x, y: state.fy ?? state.y, ...sizeOf(state) } : boundsOf(state);
  if (!onGpuPort(state)) return [{ ...box, z: state.z, erase: true }];
  const content = CONTENT.get(state);
  const parts = Array.isArray(content) ? content : [content ?? null];
  return parts.map((part) => recordOf(state, box, part, tintOf(state)));
}

/** A blit's tint, parsed once per value of its `data-tint`. */
function tintOf(state) {
  const raw = state.el.getAttribute('data-tint');
  const cached = TINTS.get(state);
  if (cached && cached[0] === raw) return cached[1];
  const tint = parseTint(raw);
  TINTS.set(state, [raw, tint]);
  return tint;
}

/** The scene keys for a blit's first `count` parts, made once and kept. */
function partKeys(state, count) {
  let keys = PARTS.get(state);
  if (!keys) PARTS.set(state, (keys = []));
  while (keys.length < count) keys.push({ state, part: keys.length });
  return keys;
}

/** Whether two values draw the same: equal, or array-likes equal element by element. */
function sameValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a.length !== 'number' || a.length !== b.length || typeof a === 'string') return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Whether two records draw the same (a texture's version included): the fields of their kind, compared. */
function sameRecord(a, b) {
  if (a.mesh !== b.mesh || a.erase !== b.erase || a.z !== b.z || !sameValue(a.color, b.color)) return false;
  if (a.mesh) return a.lit === b.lit && sameValue(a.transform, b.transform);
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.rotation === b.rotation
    && a.texture === b.texture && a.version === b.version && sameValue(a.uv, b.uv);
}

/**
 * Draw a root's gpu blits on the GPU. Idempotent per root: a second call returns the first controller.
 * @param {object} app the root collection (`blit('#app')`)
 * @param {{backend?: 'auto'|'webgpu'|'webgl2'|Function, layer?: 'under'|'over'}} [options] `auto` tries WebGPU, then
 *   WebGL2; a function is a `createBackend(canvas)` of your own (the contract in `./gpu-scene.js`)
 * @returns {{canvas: HTMLCanvasElement, ready: Promise<string>, readonly kind: string|null,
 *   snapshot: () => Promise<{width: number, height: number, data: Uint8Array}>, destroy: () => void}}
 */
export function gpu(app, options = {}) {
  const state = stateOf(app.el);
  const root = state?.root;
  if (!root) throw new TypeError('gpu: expected a root, blit(host)');
  if (GPUS.has(root)) return GPUS.get(root).api;
  use({ gpu: gpuPort });

  const controller = {
    root, backend: null, canvas: null, scene: new Scene(), members: new Set(), touched: new Set(), records: new Map(),
    loose: new Set(),
    sweep: true, redraw: true, view: root.view, destroyed: false, offs: []
  };
  const layer = options.layer === 'over' ? 'over' : 'under';
  controller.ready = loadBackend(controller, options.backend || 'auto', layer).then((backend) => {
    if (controller.destroyed) {
      backend.destroy();
      controller.canvas?.remove();
      controller.canvas = null;
      return backend.kind;
    }
    controller.backend = backend;
    controller.redraw = true;
    schedule(root);
    return backend.kind;
  });
  controller.ready.catch((error) => logger.warn('no GPU backend; gpu blits stay invisible proxies', error));

  controller.offs.push(
    app.tick(() => readPass(controller), 'read'),
    app.tick((ctx) => drawPass(controller, ctx), 'write'),
    app.on('remove', () => { controller.sweep = true; schedule(root); })
  );
  // A blit hidden by hand, parked or moved out without `remove()` changes the tree or `hidden`: the next frame
  // sweeps. Moves change neither, so they never cost a sweep.
  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(() => {
      controller.sweep = true;
      schedule(root);
    });
    observer.observe(root.host, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
    controller.offs.push(() => observer.disconnect());
  }

  controller.api = {
    get canvas() { return controller.canvas; },
    get kind() { return controller.backend?.kind ?? null; },
    ready: controller.ready,
    snapshot: () => snapshot(controller),
    destroy: () => destroy(controller, state)
  };
  GPUS.set(root, controller);
  // Blits already on the port (it was named before this root drew) join now.
  for (const element of root.host.querySelectorAll(`[${BLIT_ATTR}]`)) {
    const each = stateOf(element);
    if (each && onGpuPort(each) && each.handle) gpuPort(each.handle, { flow: each.port !== gpuPort });
    else if (each && PUNCHED.has(each)) join(controller, each);
  }
  schedule(root);
  return controller.api;
}

/** A fresh canvas in the host per attempt: a canvas that has handed out one context kind refuses the other. */
function mountCanvas(controller, layer) {
  controller.canvas?.remove();
  const { host, plane } = controller.root;
  const canvas = document.createElement('canvas');
  canvas.setAttribute(GPU_ATTR, '');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', display: 'block'
  });
  host.insertBefore(canvas, layer === 'over' ? plane.nextSibling : plane);
  controller.canvas = canvas;
  return canvas;
}

/** The first backend that comes up, in `auto` order WebGPU then WebGL2; a function is a custom `createBackend`. */
async function loadBackend(controller, wanted, layer) {
  const order = wanted === 'auto' ? ['webgpu', 'webgl2'] : [wanted];
  if (!order.every((name) => typeof name === 'function' || Object.hasOwn(BACKENDS, name))) {
    throw new TypeError(`gpu: unknown backend "${wanted}"`);
  }
  for (const name of order) {
    try {
      const create = typeof name === 'function' ? name : (await BACKENDS[name]()).createBackend;
      // Destroyed while a backend was loading: no canvas is mounted again.
      if (controller.destroyed) break;
      return await create(mountCanvas(controller, layer));
    } catch (error) {
      logger.info(`${typeof name === 'function' ? 'the custom backend' : name} is unavailable`, error);
    }
  }
  controller.canvas?.remove();
  controller.canvas = null;
  throw new Error(controller.destroyed ? 'gpu: destroyed while loading' : 'gpu: no backend available');
}

/**
 * Before the root paints: a blit that left the gpu port is let go, a new view means a sweep, and any change means
 * the loose members (nested, or sized by the browser) are read again, since a parent or a measure may have moved
 * them. A change elsewhere costs nothing more: a still sprite among ten thousand is never looked at.
 */
function readPass(controller) {
  const { root, members } = controller;
  if (root.view !== controller.view) controller.sweep = true;
  controller.view = root.view;
  if (root.dirty.size > 0 || root.measure.size > 0) for (const state of controller.loose) controller.touched.add(state);
  for (const state of root.dirty) {
    if (!members.has(state)) continue;
    // A punch moves without the port, so its own changes are read here.
    if (!drawsOnGpu(state)) forget(controller, state);
    else if (!onGpuPort(state)) controller.touched.add(state);
  }
}

/** After the plane: bring the scene up to date and draw, only when something drawn changed or the camera moved. */
function drawPass(controller, ctx) {
  if (controller.sweep) sweep(controller);
  for (const state of controller.touched) record(controller, state);
  controller.touched.clear();

  const { backend, canvas, scene, root } = controller;
  if (!backend) return;
  const resized = fitCanvas(canvas, root.hostRect);
  if (!scene.dirty && !ctx.cameraMoved && !resized && !controller.redraw) return;
  draw(controller);
}

/** Whether a member draws now: in the document and not hidden (a demoted branch, a parked blit). The walk up for
 * a hidden ancestor runs only while the root has demoted branches. */
function visible(controller, state) {
  const element = state.el;
  if (!element.isConnected || element.hidden) return false;
  return controller.root.demoted.size === 0 || !element.closest('[hidden]');
}

/**
 * Every member: one gone from the root or off the port is let go, one hidden leaves the scene but stays a member,
 * one missing from the scene or nested or unsized is re-read (its parent or measured size may have moved it).
 */
function sweep(controller) {
  controller.sweep = false;
  const { root, members, scene } = controller;
  for (const state of Array.from(members)) {
    const element = state.el;
    if (!drawsOnGpu(state) || !isWithin(root.host, element)) forget(controller, state);
    else if (!visible(controller, state)) unrecord(controller, state);
    else if (!controller.records.has(PARTS.get(state)?.[0]) || controller.loose.has(state)) controller.touched.add(state);
  }
}

/** Put a visible member's parts in the scene, each only when it draws differently than before; a hidden one's go. */
function record(controller, state) {
  if (!controller.members.has(state)) return;
  if (!visible(controller, state)) {
    unrecord(controller, state);
    return;
  }
  // Nested or browser-sized: its box can move without it, so it is read on every changed frame.
  const topLevel = parentElementOf(state.el) === controller.root.host;
  if (state.w === null || state.h === null || !topLevel) controller.loose.add(state);
  else controller.loose.delete(state);
  const next = recordsOf(state, topLevel);
  const keys = partKeys(state, next.length);
  next.forEach((rec, i) => {
    const previous = controller.records.get(keys[i]);
    if (previous && sameRecord(previous, rec)) return;
    controller.records.set(keys[i], rec);
    controller.scene.set(keys[i], rec);
  });
  for (const key of keys.slice(next.length)) {
    controller.records.delete(key);
    controller.scene.delete(key);
  }
}

/** Take every part of a blit out of the scene. */
function unrecord(controller, state) {
  for (const key of PARTS.get(state) ?? []) {
    controller.records.delete(key);
    controller.scene.delete(key);
  }
}

/** Let a blit go: out of the scene, its element visible again. */
function forget(controller, state) {
  controller.members.delete(state);
  JOINED.delete(state);
  controller.loose.delete(state);
  unrecord(controller, state);
  const element = state.el;
  if (PROXIES.has(element)) {
    element.style.opacity = PROXIES.get(element);
    PROXIES.delete(element);
  }
}

/** Size the backing store to the host at the device pixel ratio. @returns {boolean} resized */
function fitCanvas(canvas, hostRect) {
  const ratio = globalThis.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(hostRect.width * ratio));
  const height = Math.max(1, Math.round(hostRect.height * ratio));
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  return true;
}

/** Hand the scene to the backend: texture work first, then one frame. A backend that throws costs that frame,
 * never the root's loop. */
function draw(controller) {
  const { backend, scene, root } = controller;
  const { instances, count, dirty, batches, uploads, drops, meshUploads, meshDrops } = scene.pack();
  controller.redraw = false;
  try {
    for (const id of drops) backend.dropTexture(id);
    for (const [id, source] of uploads) backend.texture(id, source);
    for (const id of meshDrops) backend.dropMesh(id);
    for (const [id, geometry] of meshUploads) backend.mesh(id, geometry);
    const clip = clipMatrix(root.camera, root.hostRect, backend.depthRange);
    backend.draw({ clip, instances, count, dirty, batches, clear: [0, 0, 0, 0] });
  } catch (error) {
    logger.error('a GPU frame failed', error);
  }
}

/** Draw now and read the frame back (tests, thumbnails). */
async function snapshot(controller) {
  await controller.ready;
  sweep(controller);
  for (const state of controller.touched) record(controller, state);
  controller.touched.clear();
  fitCanvas(controller.canvas, controller.root.hostRect);
  draw(controller);
  return controller.backend.read();
}

/** Undo `gpu(app)`: the passes, the canvas, the backend, and every proxy back to visible. */
function destroy(controller, state) {
  if (controller.destroyed) return;
  controller.destroyed = true;
  for (const off of controller.offs) off();
  for (const member of Array.from(controller.members)) forget(controller, member);
  controller.backend?.destroy();
  controller.canvas?.remove();
  controller.canvas = null;
  GPUS.delete(state.root);
}
