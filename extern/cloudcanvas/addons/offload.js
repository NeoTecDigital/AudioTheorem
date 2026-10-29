/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * offload: DOM virtualisation. A top-level blit carrying the trait whose global
 * box has left the visible canvas, past a margin in screen pixels, is parked -
 * taken out of the document behind its anchor, state and running traits kept -
 * and put back the frame the camera brings it into range again. Nested blits ride their top-level
 * blit, so only those are tested.
 *
 *   blit.use({ offload });
 *   app.blit({ id: 'far', x: 9000, offload: true });          // default margin
 *   app.blit({ id: 'edge', offload: { margin: 0 } });         // the instant it clears the edge
 *
 * The sweep runs in the structure phase, only on a frame the camera moved or a
 * blit just joined: a still camera does no offload work. Under a tilted camera
 * the visible canvas is read through it (`visibleRect`).
 */
import { schedule } from '../core/frame.js';
import { parentElementOf, stateOf, boundsOf } from '../core/state.js';
import { park, unpark } from './park.js';

/** The record an anchor comment holds a place for: how a walker reads an offloaded blit where it sits. */
export { parkedStateOf } from './park.js';

/** Screen pixels of clearance before a blit is parked. */
export const DEFAULT_OFFLOAD_MARGIN = 400;

/** @type {WeakMap<object, {members: Map<object, number>, pending: boolean, off: Function}>} root -> its sweep */
const SWEEPS = /* @__PURE__ */ new WeakMap();

/** How far a tilted view may reach toward its horizon, in host lengths (the longer side) through the zoom. */
export const HORIZON_REACH = 32;

/** Halvings that walk a host edge up to the horizon. */
const HORIZON_STEPS = 24;

/** No canvas at all: an edge-on board shows nothing, so every box is outside it. */
const NOTHING = /* @__PURE__ */ Object.freeze({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

/**
 * The canvas rectangle the host shows through `camera`. Tilted, it is the box around the unprojected host corners;
 * where the horizon crosses the host the view is unbounded that way, so it reaches `HORIZON_REACH` host lengths.
 */
export function visibleRect(camera, hostRect) {
  const { x, y, scale } = camera;
  if (camera.is3d) return tiltedRect(camera, hostRect);
  return { minX: -x / scale, minY: -y / scale, maxX: (hostRect.width - x) / scale, maxY: (hostRect.height - y) / scale };
}

/** The box around every host corner on the plane and, on an edge the horizon crosses, its farthest point. */
function tiltedRect(camera, hostRect) {
  const { width, height } = hostRect;
  const centre = camera.unproject(width / 2, height / 2, hostRect);
  if (!centre) return NOTHING;
  const corners = [[0, 0], [width, 0], [width, height], [0, height]];
  const seen = corners.map(([sx, sy]) => camera.unproject(sx, sy, hostRect));
  const points = seen.filter(Boolean);
  seen.forEach((at, index) => {
    const next = (index + 1) % 4;
    if (!at === !seen[next]) return;
    const [from, to] = at ? [corners[index], corners[next]] : [corners[next], corners[index]];
    points.push(horizonPoint(camera, hostRect, from, to));
  });
  const reach = HORIZON_REACH * Math.max(width, height) / camera.scale;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.max(Math.min(...xs), centre.x - reach), minY: Math.max(Math.min(...ys), centre.y - reach),
    maxX: Math.min(Math.max(...xs), centre.x + reach), maxY: Math.min(Math.max(...ys), centre.y + reach)
  };
}

/** The farthest canvas point along a host edge from a point on the plane (`from`) toward one past the horizon. */
function horizonPoint(camera, hostRect, [fromX, fromY], [toX, toY]) {
  const at = (t) => camera.unproject(fromX + (toX - fromX) * t, fromY + (toY - fromY) * t, hostRect);
  let [on, off] = [0, 1];
  for (let step = 0; step < HORIZON_STEPS; step += 1) {
    const t = (on + off) / 2;
    if (at(t)) on = t;
    else off = t;
  }
  return at(on);
}

/** Whether a box lies wholly beyond `rect` grown by `margin` on every side; touching it keeps it. */
export function isOutside(bounds, rect, margin) {
  return bounds.x + bounds.w < rect.minX - margin || bounds.x > rect.maxX + margin
    || bounds.y + bounds.h < rect.minY - margin || bounds.y > rect.maxY + margin;
}

/** Whether `b` is parked by the sweep. */
export function isOffloaded(b) {
  const state = stateOf(b.el);
  const root = stateOf(parentElementOf(b.el))?.root;
  return Boolean(state?.anchor) && Boolean(root && SWEEPS.get(root)?.members.has(state));
}

/** Park or restore each member against the camera; members only, and only when something moved. */
function sweep(root, record, ctx) {
  if (!ctx.cameraMoved && !record.pending) return;
  record.pending = false;
  const rect = visibleRect(root.camera, ctx.hostRect);
  for (const [state, margin] of record.members) {
    const outside = isOutside(boundsOf(state), rect, margin / root.camera.scale);
    if (outside === Boolean(state.anchor)) continue;
    if (outside) park(state, true);
    else if (unpark(state, true)) root.measure.add(state);
  }
}

/** The root's sweep, installed on first use. */
function sweepOf(root) {
  let record = SWEEPS.get(root);
  if (!record) {
    record = { members: new Map(), pending: true, off: null };
    const pass = (ctx) => sweep(root, record, ctx);
    root.hooks.structure.add(pass);
    record.off = () => root.hooks.structure.delete(pass);
    SWEEPS.set(root, record);
  }
  return record;
}

/** The named trait: on a top-level blit, join the root's sweep; `{margin}` overrides the default. */
export function offload(b, options, root) {
  if (!root || parentElementOf(b.el) !== root.host) return undefined;
  const state = stateOf(b.el);
  const margin = Number.isFinite(options?.margin) ? options.margin : DEFAULT_OFFLOAD_MARGIN;
  const record = sweepOf(root);
  record.members.set(state, margin);
  record.pending = true;
  schedule(root);
  return () => {
    record.members.delete(state);
    if (state.anchor) unpark(state, true);
    if (record.members.size === 0) {
      record.off();
      SWEEPS.delete(root);
    }
  };
}
