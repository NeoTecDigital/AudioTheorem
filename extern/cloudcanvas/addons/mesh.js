/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * mesh: solid shapes on the GPU. The `mesh` trait - `{shape: 'box' | 'plane' | 'sphere', depth, rotate, lit}` -
 * draws a unit shape centred in the blit's box, scaled to it and to `depth` (px; the smaller side by default),
 * turned by `rotate` (`[x, y, z]` degrees) and shaded by one light, in the blit's `tint`. It draws on a `gpu`
 * root's `gpu` port; anywhere else the element stays what it was. Each shape's geometry is made once and shared,
 * so a thousand boxes are one upload.
 *
 *   blit.use({ mesh });
 *   app.blit({ x: 40, y: 40, w: 80, h: 80, port: 'gpu', tint: '#38bdf8', mesh: { shape: 'box', rotate: [20, 30, 0] } });
 */
import { createLogger } from '../log.js';
import { gpuContent } from './gpu.js';
import { boxGeometry, planeGeometry, sphereGeometry } from './mesh-geometry.js';

const logger = /* @__PURE__ */ createLogger('mesh');

/** The shapes by name. */
export const SHAPES = /* @__PURE__ */ Object.freeze({ box: boxGeometry, plane: planeGeometry, sphere: sphereGeometry });

/** @type {Map<string, object>} shape -> its one geometry */
const GEOMETRY = /* @__PURE__ */ new Map();

/** A shape's shared geometry; an unknown name is a box, with a warning. */
export function geometryOf(shape = 'box') {
  const name = Object.hasOwn(SHAPES, shape) ? shape : 'box';
  if (name !== shape) logger.warn(`no shape "${String(shape)}"; drawing a box`);
  if (!GEOMETRY.has(name)) GEOMETRY.set(name, SHAPES[name]());
  return GEOMETRY.get(name);
}

/** A `rotate` option as three finite degrees, or undefined. */
function anglesOf(rotate) {
  if (!Array.isArray(rotate)) return undefined;
  const angles = [0, 1, 2].map((i) => Number(rotate[i]) || 0);
  return angles.some((angle) => angle !== 0) ? angles : undefined;
}

/** The trait. @returns {() => void} cleanup: the blit draws its tint again */
export function mesh(b, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const depth = Number(o.depth);
  gpuContent(b, {
    mesh: geometryOf(o.shape),
    depth: depth > 0 ? depth : undefined,
    rotate: anglesOf(o.rotate),
    lit: o.lit !== false
  });
  return () => gpuContent(b, null);
}
