/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * physics: the blit drifts on a slow harmonic field, with velocity and damping.
 *
 *   blit.use({ physics });
 *   app.blit({ physics: { driftIntensity: 0.4 } });
 *
 * Options: `floatDrift` (true), `driftIntensity` (0.4), and
 * `mass` (1), `friction` (0.92) and `vector` (0), the phase the field reads.
 * The field and the integration (`driftForce`, `applyForce`, `integrate`) are
 * pure; a blit steps in its root's read phase and writes through `set()`.
 */
import { defineTrait } from './trait.js';

/** The record; `options` rides along for the body `mount` builds. */
function init(options) {
  return {
    options,
    floatDrift: options.floatDrift !== undefined ? Boolean(options.floatDrift) : true,
    driftIntensity: options.driftIntensity !== undefined ? Number(options.driftIntensity) : 0.4
  };
}

/**
 * The drift field at a point, per reference frame: a force whose phase moves
 * with time, the position and the body's primary vector.
 * @returns {{fx: number, fy: number}}
 */
export function driftForce(s, x, y, vector, now = Date.now()) {
  const time = now * 0.002;
  return {
    fx: Math.sin(time + x * 0.01 + vector) * s.driftIntensity,
    fy: Math.cos(time + y * 0.01 + vector) * s.driftIntensity
  };
}

/** Accelerate a body: `{vx, vy, mass, pinned}`; a pinned body takes no force. */
export function applyForce(body, fx, fy) {
  if (body.pinned) return;
  body.vx += fx / body.mass;
  body.vy += fy / body.mass;
}

/**
 * Advance a body `{x, y, vx, vy, friction, pinned}` by `dt` reference frames.
 * Damping is exponentiated by `dt`, so the decay is the same however the time
 * is subdivided; a pinned body stops dead.
 */
export function integrate(body, dt = 1) {
  if (body.pinned) {
    body.vx = 0;
    body.vy = 0;
    return;
  }
  body.x += body.vx * dt;
  body.y += body.vy * dt;

  const damping = Math.pow(body.friction, dt);
  body.vx *= damping;
  body.vy *= damping;
  // Stop micro-jitters.
  if (Math.abs(body.vx) < 0.001) body.vx = 0;
  if (Math.abs(body.vy) < 0.001) body.vy = 0;
}

/** A body of the blit's own, stepped in the read phase. */
function mount(s, b) {
  const options = s.options;
  const body = {
    x: b.x,
    y: b.y,
    vx: 0,
    vy: 0,
    mass: Number(options.mass) > 0 ? Number(options.mass) : 1,
    friction: options.friction !== undefined ? Number(options.friction) : 0.92,
    pinned: false
  };
  const vector = Number(options.vector) || 0;

  return b.tick((ctx) => {
    // A blit out of the document drifts nowhere, and its root's loop may settle.
    if (!s.floatDrift || !b.el.isConnected) return;
    const { fx, fy } = driftForce(s, b.x, b.y, vector);
    applyForce(body, fx * ctx.dt, fy * ctx.dt);
    body.x = b.x;
    body.y = b.y;
    integrate(body, ctx.dt);
    if (body.x !== b.x || body.y !== b.y) b.set({ x: body.x, y: body.y });
  }, 'read');
}

export const physics = /* @__PURE__ */ defineTrait({ init, mount });
