/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * history: browser-shaped navigation over a root collection. Every entry is a
 * `{root, camera}` pair - the promoted view root and where the camera was - so a
 * traversal restores both through one path.
 *
 *   go(app, card)       promote `card` and frame it; the view left goes on the back stack
 *   back(app)           restore the last entry; what it left goes on the forward stack
 *   forward(app)        the mirror of `back`
 *   reset(app)          the whole root at the identity camera, both stacks emptied
 *   breadcrumb(b)       the blits from the top of the root down to `b`
 *
 * A new navigation (`go`) empties the forward stack, which keeps the history
 * linear; `go` to the view root already shown re-frames it and stacks nothing.
 * Every transition emits `view:change` on the host, `detail.payload`
 * `{root, camera, back, forward}`. The camera snaps, or flies when the root's
 * camera can (`cloudcanvas/motion`) and `immediate` is not set. An entry whose
 * view root has left the root since (removed) can never be restored: every call
 * prunes those first, so a traversal lands on the next live entry and
 * `canGoBack`/`canGoForward` answer for live entries only. The named root trait
 * owns the stacks' lifetime: stopping it forgets them.
 *
 *   blit.use({ history });
 *   app.set({ history: true });
 */
import { blit } from '../core/blit.js';
import { schedule } from '../core/frame.js';
import { isWithin, stateOf } from '../core/state.js';

/** The event every transition emits on the host. */
export const VIEW_CHANGE_EVENT = 'view:change';

/** @type {WeakMap<object, {back: object[], forward: object[]}>} root -> its stacks */
const STACKS = /* @__PURE__ */ new WeakMap();

/** The root record of a root collection, or a TypeError naming the call. */
function rootOf(app, name) {
  const root = stateOf(app.el)?.root;
  if (!root) throw new TypeError(`${name}: expected a root collection, blit('#app')`);
  return root;
}

/** A root's stacks, made on first use. */
function stacksOf(root) {
  let stacks = STACKS.get(root);
  if (!stacks) {
    stacks = { back: [], forward: [] };
    STACKS.set(root, stacks);
  }
  return stacks;
}

/** Drop every entry whose view root is no longer a blit of this root; the host (null) always is. @returns the stacks */
function prune(root, stacks) {
  for (const stack of [stacks.back, stacks.forward]) {
    const live = stack.filter((entry) => entry.root === null || isWithin(root.host, entry.root.el));
    if (live.length !== stack.length) stack.splice(0, stack.length, ...live);
  }
  return stacks;
}

/** A root's stacks, pruned, or null before first use. */
function liveStacksOf(root) {
  const stacks = STACKS.get(root);
  return stacks ? prune(root, stacks) : null;
}

/** The view as it stands: the promoted root (null: the host) and the camera. */
function capture(root) {
  const promoted = root.view ? blit(root.view) : null;
  return { root: promoted, camera: { x: root.camera.x, y: root.camera.y, scale: root.camera.scale } };
}

/** Announce the view now in force, the camera it lands at (a flight's destination) and the live entry counts. */
function announce(app, root, stacks, camera) {
  const { x, y, scale } = camera;
  const promoted = root.view ? blit(root.view) : null;
  const { back: behind, forward: ahead } = prune(root, stacks);
  app.emit(VIEW_CHANGE_EVENT, { root: promoted, camera: { x, y, scale }, back: behind.length, forward: ahead.length });
}

/** Put an entry back: its view root, then its camera (a flight when the camera flies and it is not `immediate`). */
function restore(app, root, entry, options) {
  app.root = entry.root;
  const { x, y, scale } = entry.camera;
  if (typeof root.camera.animateTo === 'function' && !options.immediate) root.camera.animateTo(x, y, scale, options);
  else Object.assign(root.camera, { x, y, scale });
  schedule(root);
}

/**
 * Navigate to `target` (a blit, an element or an id this root indexes): promote
 * it and frame it, or with `{promote: false}` only frame it. `padding`,
 * `maxZoom`, `immediate` pass to `view()`.
 * @returns {object} the target blit
 */
export function go(app, target, options = {}) {
  const root = rootOf(app, 'history.go');
  const stacks = prune(root, stacksOf(root));
  const handle = typeof target === 'string' ? app.find(target) : blit(target);
  if (!handle) throw new TypeError(`history.go: no blit "${String(target)}" in this root`);
  const promote = options.promote !== false;
  const settled = promote && (root.view ?? root.host) === handle.el;

  stacks.forward.length = 0;
  if (!settled) stacks.back.push(capture(root));
  if (promote) app.root = handle;
  announce(app, root, stacks, app.view(handle, options));
  return handle;
}

/** Step back one entry. @returns {boolean} false (and no event) when there is nothing behind */
export function back(app, options = {}) {
  const root = rootOf(app, 'history.back');
  const stacks = prune(root, stacksOf(root));
  if (stacks.back.length === 0) return false;
  const entry = stacks.back.pop();
  stacks.forward.push(capture(root));
  restore(app, root, entry, options);
  announce(app, root, stacks, entry.camera);
  return true;
}

/** Re-apply what the last `back` left. @returns {boolean} false (and no event) when there is nothing ahead */
export function forward(app, options = {}) {
  const root = rootOf(app, 'history.forward');
  const stacks = prune(root, stacksOf(root));
  if (stacks.forward.length === 0) return false;
  const entry = stacks.forward.pop();
  stacks.back.push(capture(root));
  restore(app, root, entry, options);
  announce(app, root, stacks, entry.camera);
  return true;
}

/** The whole root at the identity camera, both stacks emptied. */
export function reset(app, options = {}) {
  const root = rootOf(app, 'history.reset');
  const stacks = stacksOf(root);
  stacks.back.length = 0;
  stacks.forward.length = 0;
  const home = { root: null, camera: { x: 0, y: 0, scale: 1 } };
  restore(app, root, home, options);
  announce(app, root, stacks, home.camera);
}

/** Whether `back` has somewhere to go. */
export function canGoBack(app) {
  return (liveStacksOf(rootOf(app, 'history.canGoBack'))?.back.length ?? 0) > 0;
}

/** Whether `forward` has somewhere to go. */
export function canGoForward(app) {
  return (liveStacksOf(rootOf(app, 'history.canGoForward'))?.forward.length ?? 0) > 0;
}

/**
 * The blits from the top of the root down to `b`, walking `b.parent`; on a root
 * collection, down to its promoted view root (none: empty).
 * @returns {object[]}
 */
export function breadcrumb(b) {
  const start = stateOf(b.el)?.root ? b.root : b;
  const chain = [];
  for (let node = start; node && !stateOf(node.el)?.root; node = node.parent) chain.unshift(node);
  return chain;
}

/** The named root trait: the stacks live while it runs, and are forgotten when it stops. */
export function history(app, _options, root = stateOf(app.el)?.root) {
  if (!root || root.host !== app.el) throw new TypeError("history: expected a root collection, blit('#app')");
  stacksOf(root);
  return () => { STACKS.delete(root); };
}
