/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * orbit: turn a root's board in 3D. Alt + drag (or a middle-button drag) anywhere on the host tilts the camera
 * about the host's centre - across turns about the vertical axis, along about the horizontal - and Alt + wheel
 * moves the viewer nearer or farther (the perspective). Both are taken in the capture phase, so pan, drag and
 * every other press on the host never see them. `level(app)` lays the board flat again.
 *
 *   blit.use({ orbit });         // then app.set({ orbit: true }), or { orbit: { speed, limit, perspective } }
 */
import { schedule } from '../core/frame.js';
import { listen, requireRootOf } from './trait.js';

/** Degrees of turn per pixel dragged. */
export const ORBIT_SPEED = 0.25;

/** Largest tilt either way, in degrees: at 90 the board is edge-on. */
export const ORBIT_LIMIT = 75;

/** The perspective a flat camera takes when it is first turned, in px. */
export const ORBIT_PERSPECTIVE = 1200;

/** The perspective's range under the wheel, in px, and its gain per wheel pixel. */
export const PERSPECTIVE_RANGE = /* @__PURE__ */ Object.freeze([300, 6000]);
export const DOLLY_K = 0.002;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Whether a press is an orbit: Alt with the main button, or the middle button. */
export function isOrbitPress(event) {
  return (event.button === 0 && event.altKey === true) || event.button === 1;
}

/** Turn `camera` by a drag of `(dx, dy)` px, held inside `limit`; a flat camera gains a perspective first. */
export function orbitBy(camera, dx, dy, { speed = ORBIT_SPEED, limit = ORBIT_LIMIT, perspective = ORBIT_PERSPECTIVE } = {}) {
  if (camera.perspective === null) camera.perspective = perspective;
  camera.rotateY = clamp(camera.rotateY + dx * speed, -limit, limit);
  camera.rotateX = clamp(camera.rotateX - dy * speed, -limit, limit);
}

/** Move the viewer by a wheel delta: positive is farther. */
export function dollyBy(camera, deltaPx, { perspective = ORBIT_PERSPECTIVE } = {}) {
  const from = camera.perspective ?? perspective;
  camera.perspective = clamp(from * Math.exp(deltaPx * DOLLY_K), PERSPECTIVE_RANGE[0], PERSPECTIVE_RANGE[1]);
}

/** Lay a root's board flat: no tilt, no perspective. */
export function level(app) {
  const root = requireRootOf(app, undefined, 'level');
  Object.assign(root.camera, { rotateX: 0, rotateY: 0, perspective: null });
  schedule(root);
}

/** The root trait. `opts`: `speed` (deg/px), `limit` (deg), `perspective` (px), `wheel: false`. @returns {() => void} off */
export function orbit(b, opts, root) {
  const found = requireRootOf(b, root, 'orbit');
  const options = opts && typeof opts === 'object' ? opts : {};
  const host = b.el;
  const camera = () => found.camera;
  let drag = null;

  const end = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (host.hasPointerCapture?.(drag.pointerId)) host.releasePointerCapture(drag.pointerId);
    drag = null;
  };
  const offs = [
    listen(host, ['pointerdown'], (event) => {
      if (!isOrbitPress(event) || drag) return;
      event.preventDefault();
      event.stopPropagation();
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      try { host.setPointerCapture(event.pointerId); } catch { /* a synthetic pointer has nothing to capture */ }
    }, { capture: true }),
    listen(window, ['pointermove'], (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      orbitBy(camera(), event.clientX - drag.x, event.clientY - drag.y, options);
      drag.x = event.clientX;
      drag.y = event.clientY;
      schedule(found);
    }),
    listen(window, ['pointerup', 'pointercancel'], end)
  ];
  if (options.wheel !== false) {
    offs.push(listen(host, ['wheel'], (event) => {
      if (!event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      dollyBy(camera(), Number(event.deltaY) || 0, options);
      schedule(found);
    }, { capture: true, passive: false }));
  }
  return () => {
    for (const off of offs) off();
    drag = null;
  };
}
