/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * svg-path: SVG path data as a blit, drawn on the GPU as triangles. The `svgPath` trait - `{d, viewBox, fill,
 * stroke, strokeWidth, fillRule}` - flattens and triangulates the path once (fill, then stroke, as two parts of the
 * blit's GPU content) and maps its viewBox onto the blit's box, so it stays sharp at any zoom without re-rastering.
 * The element holds the same path as an inline `<svg>` (built with DOM calls), which is what shows without a GPU.
 * `fill: true` (the default) takes the blit's `tint`; a hex colour is its own; `false` or `'none'` leaves it out.
 *
 *   blit.use({ svgPath });
 *   app.blit({ w: 48, h: 48, port: 'gpu', svgPath: { d: 'M4 12 L12 4 L20 12 Z', viewBox: [0, 0, 24, 24], fill: '#0ea5e9' } });
 */
import { safeColor, safeNumber } from '../graphics/primitives/primitives.js';
import { createLogger } from '../log.js';
import { gpuContent, parseTint } from './gpu.js';
import { pathGeometry } from './svg-path-geometry.js';

const logger = /* @__PURE__ */ createLogger('svg-path');

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Marks the inline `<svg>` the trait put in a blit. */
export const SVG_PATH_ATTR = 'data-blit-svg-path';

/** Whether a paint option draws at all. */
const paints = (value) => value !== false && value !== 'none' && value !== undefined && value !== null;

/** A paint option as a GPU colour: `true` takes the tint (undefined), a hex colour is its own. */
const gpuColor = (value) => (typeof value === 'string' ? parseTint(value) : undefined);

/** A paint option as an SVG attribute value. */
const svgColor = (value) => (typeof value === 'string' ? safeColor(value, 'currentColor') : 'currentColor');

/** The inline `<svg>` fallback, from DOM calls only. */
function inlineSvg(o, viewBox) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute(SVG_PATH_ATTR, '');
  svg.setAttribute('viewBox', viewBox.join(' '));
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  Object.assign(svg.style, { display: 'block', width: '100%', height: '100%', overflow: 'visible' });
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', o.d);
  path.setAttribute('fill', paints(o.fill ?? true) ? svgColor(o.fill) : 'none');
  path.setAttribute('fill-rule', o.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
  if (paints(o.stroke)) {
    path.setAttribute('stroke', svgColor(o.stroke));
    path.setAttribute('stroke-width', String(safeNumber(o.strokeWidth, 1)));
    path.setAttribute('stroke-linejoin', 'bevel');
  }
  svg.appendChild(path);
  return svg;
}

/** The trait. @returns {() => void} cleanup: the GPU parts and the inline svg go */
export function svgPath(b, opts) {
  const o = opts && typeof opts === 'object' ? { ...opts, d: String(opts.d ?? '') } : { d: '' };
  const given = Array.isArray(o.viewBox) && o.viewBox.length === 4 && o.viewBox.every((n) => Number.isFinite(Number(n)))
    && Number(o.viewBox[2]) > 0 && Number(o.viewBox[3]) > 0 ? o.viewBox.map(Number) : null;
  const strokeWidth = safeNumber(o.strokeWidth, 1);
  let geometry;
  try {
    geometry = pathGeometry(o.d, {
      fill: paints(o.fill ?? true), fillRule: o.fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
      stroke: paints(o.stroke), strokeWidth,
      tolerance: o.tolerance ?? (given ? Math.max(given[2], given[3]) / 1000 : 0.25)
    });
  } catch (error) {
    // Drawn as nothing - not as the blit's tint - until the path is fixed.
    logger.warn('path data could not be drawn', error);
    gpuContent(b, []);
    return () => gpuContent(b, null);
  }
  const [minX, minY, maxX, maxY] = geometry.bounds;
  const pad = paints(o.stroke) ? strokeWidth / 2 : 0;
  const viewBox = given ?? [minX - pad, minY - pad, Math.max(maxX - minX + pad * 2, 1e-6), Math.max(maxY - minY + pad * 2, 1e-6)];

  const parts = [];
  // An empty geometry (no triangles) is no part at all.
  if (geometry.fill?.indices.length) parts.push({ mesh: geometry.fill, viewBox, color: gpuColor(o.fill), lit: false });
  if (geometry.stroke?.indices.length) parts.push({ mesh: geometry.stroke, viewBox, color: gpuColor(o.stroke), lit: false });
  gpuContent(b, parts);
  const svg = inlineSvg(o, viewBox);
  b.el.appendChild(svg);
  return () => {
    gpuContent(b, null);
    svg.remove();
  };
}
