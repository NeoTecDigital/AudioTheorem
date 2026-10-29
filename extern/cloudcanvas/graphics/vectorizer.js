/**
 * CloudCanvas - NeoTec, LLC, Richard Christopher
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Vectorizer Subsystem: Converts discrete stroke points, point clouds, and
 * 3D radial sculpt contours into resolution-independent cubic bezier SVG paths,
 * with topology normalization for glitch-free CSS `d: path(...)` morphing.
 */

/**
 * Douglas-Peucker point decimation to eliminate redundant points within a distance tolerance.
 *
 * @param {Array<{x: number, y: number}>} points
 * @param {number} tolerance
 * @returns {Array<{x: number, y: number}>}
 */
export function simplifyPoints(points, tolerance = 1.5) {
  if (!Array.isArray(points) || points.length <= 2) return points ? [...points] : [];
  if (tolerance <= 0) return [...points];

  const sqTolerance = tolerance * tolerance;

  function getSqSegDist(p, p1, p2) {
    let x = p1.x;
    let y = p1.y;
    let dx = p2.x - x;
    let dy = p2.y - y;

    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = p2.x;
        y = p2.y;
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }

    dx = p.x - x;
    dy = p.y - y;
    return dx * dx + dy * dy;
  }

  function simplifyDPStep(pts, first, last, sqTol, simplified) {
    let maxSqDist = sqTol;
    let index = -1;

    for (let i = first + 1; i < last; i += 1) {
      const sqDist = getSqSegDist(pts[i], pts[first], pts[last]);
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }

    if (index !== -1) {
      if (index - first > 1) simplifyDPStep(pts, first, index, sqTol, simplified);
      simplified.push(pts[index]);
      if (last - index > 1) simplifyDPStep(pts, index, last, sqTol, simplified);
    }
  }

  const simplified = [points[0]];
  simplifyDPStep(points, 0, points.length - 1, sqTolerance, simplified);
  simplified.push(points[points.length - 1]);
  return simplified;
}

/**
 * Vectorize a discrete series of stroke points into a smooth cubic bezier SVG path.
 *
 * Employs Catmull-Rom spline tangents converted to cubic bezier control points.
 *
 * @param {Array<{x: number, y: number, z?: number, pressure?: number}>} rawPoints
 * @param {Object} [options]
 * @param {number} [options.smoothing=0.25] Spline tension factor (0 = sharp lines, 0.5 = loose)
 * @param {number} [options.tolerance=1.5] Douglas-Peucker point decimation tolerance
 * @param {boolean} [options.closed=false] Whether to close the path with 'Z'
 * @param {number} [options.precision=2] Floating-point coordinate decimals
 * @returns {string} SVG path d attribute string ('M x y C cx1 cy1, cx2 cy2, x2 y2 ...')
 */
export function vectorizeStroke(rawPoints, options = {}) {
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) return '';

  const precision = typeof options.precision === 'number' ? options.precision : 2;
  const fmt = (n) => Number(n).toFixed(precision);

  // Normalize points to { x, y }
  const normalized = [];
  for (const pt of rawPoints) {
    if (pt && typeof pt === 'object') {
      const x = Number(pt.x !== undefined ? pt.x : pt[0]);
      const y = Number(pt.y !== undefined ? pt.y : pt[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        normalized.push({ x, y });
      }
    }
  }

  if (normalized.length === 0) return '';
  if (normalized.length === 1) {
    const p = normalized[0];
    return `M ${fmt(p.x)} ${fmt(p.y)} L ${fmt(p.x + 0.1)} ${fmt(p.y + 0.1)}`;
  }

  const tolerance = options.tolerance !== undefined ? Number(options.tolerance) : 1.5;
  const points = tolerance > 0 && normalized.length > 2
    ? simplifyPoints(normalized, tolerance)
    : normalized;

  if (points.length === 2) {
    const p0 = points[0];
    const p1 = points[1];
    return `M ${fmt(p0.x)} ${fmt(p0.y)} L ${fmt(p1.x)} ${fmt(p1.y)}`;
  }

  const closed = Boolean(options.closed);
  const tension = typeof options.smoothing === 'number' ? options.smoothing : 0.25;
  const n = points.length;

  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;

  const numSegments = closed ? n : n - 1;

  for (let i = 0; i < numSegments; i += 1) {
    const p0 = closed
      ? points[(i - 1 + n) % n]
      : (i === 0 ? points[0] : points[i - 1]);
    const p1 = points[i];
    const p2 = closed
      ? points[(i + 1) % n]
      : points[i + 1];
    const p3 = closed
      ? points[(i + 2) % n]
      : (i + 2 < n ? points[i + 2] : p2);

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${fmt(cp1x)} ${fmt(cp1y)}, ${fmt(cp2x)} ${fmt(cp2y)}, ${fmt(p2.x)} ${fmt(p2.y)}`;
  }

  if (closed) d += ' Z';
  return d;
}

/**
 * Vectorize a 3D radial scalar field (sculpt contour slice) into a closed bezier loop.
 *
 * @param {Array<number>|Float32Array|Float64Array} radii Radial distances around 360 degrees
 * @param {number} [cx=100] Center X coordinate
 * @param {number} [cy=100] Center Y coordinate
 * @param {Object} [options]
 * @param {number} [options.smoothing=0.25] Spline tension
 * @param {number} [options.precision=2] Floating point coordinate decimals
 * @returns {string} Closed SVG path d string
 */
export function vectorizeContour(radii, cx = 100, cy = 100, options = {}) {
  if (!radii || radii.length < 3) return '';

  const n = radii.length;
  const points = [];
  const angleStep = (Math.PI * 2) / n;

  for (let i = 0; i < n; i += 1) {
    const angle = i * angleStep;
    const r = Math.max(0, Number(radii[i]) || 0);
    points.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle)
    });
  }

  return vectorizeStroke(points, {
    ...options,
    tolerance: 0, // Preserve exact radial angular resolution
    closed: true
  });
}

/**
 * Evaluate a single point on a cubic bezier segment at parameter t in [0, 1].
 */
function evalCubicBezier(p0, c1, c2, p1, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * c1.x + 3 * mt * t2 * c2.x + t3 * p1.x,
    y: mt3 * p0.y + 3 * mt2 * t * c1.y + 3 * mt * t2 * c2.y + t3 * p1.y
  };
}

/**
 * Resample any closed radial contour or discrete path into an exact target count
 * of cubic bezier segments.
 *
 * This ensures two different SVG shapes have identical segment counts and command types
 * (e.g. M, C, C, ..., C, Z), fulfilling the browser's CSS `d: path(...)` interpolation
 * specification so animations can execute in C++ on the GPU compositor.
 *
 * @param {string|Array<{x: number, y: number}>} pathOrPoints Source path d string or points
 * @param {number} [targetSegments=16] Number of cubic bezier commands to enforce
 * @param {Object} [options]
 * @param {number} [options.cx=100] Center X for radial fallback
 * @param {number} [options.cy=100] Center Y for radial fallback
 * @param {number} [options.defaultRadius=50] Fallback radius if path is empty
 * @returns {string} Normalized SVG path d string
 */
export function normalizePathTopology(pathOrPoints, targetSegments = 16, options = {}) {
  const segCount = Math.max(4, Number(targetSegments) || 16);
  const cx = Number(options.cx !== undefined ? options.cx : 100);
  const cy = Number(options.cy !== undefined ? options.cy : 100);
  const rDefault = Number(options.defaultRadius || 50);

  // If points array is passed directly:
  if (Array.isArray(pathOrPoints) && pathOrPoints.length >= 3) {
    // Resample points to segCount
    const resampled = [];
    const srcLen = pathOrPoints.length;
    for (let i = 0; i < segCount; i += 1) {
      const srcIdx = (i / segCount) * srcLen;
      const baseIdx = Math.floor(srcIdx);
      const frac = srcIdx - baseIdx;
      const p1 = pathOrPoints[baseIdx % srcLen];
      const p2 = pathOrPoints[(baseIdx + 1) % srcLen];
      resampled.push({
        x: p1.x + (p2.x - p1.x) * frac,
        y: p1.y + (p2.y - p1.y) * frac
      });
    }
    return vectorizeStroke(resampled, { ...options, tolerance: 0, closed: true });
  }

  // If path string is passed:
  if (typeof pathOrPoints === 'string' && pathOrPoints.trim().length > 0) {
    // Parse approximate vertices from path string coordinates
    const numbers = pathOrPoints.match(/-?\d+(?:\.\d+)?/g);
    if (numbers && numbers.length >= 6) {
      const parsedPoints = [];
      for (let i = 0; i < numbers.length - 1; i += 2) {
        parsedPoints.push({
          x: parseFloat(numbers[i]),
          y: parseFloat(numbers[i + 1])
        });
      }
      if (parsedPoints.length >= 3) {
        return normalizePathTopology(parsedPoints, segCount, options);
      }
    }
  }

  // Fallback: Generate a circle with exact targetSegments
  const radii = new Float32Array(segCount).fill(rDefault);
  return vectorizeContour(radii, cx, cy, options);
}
