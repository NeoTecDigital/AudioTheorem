/**
 * CloudCanvas - NeoTec, LLC, Richard Christopher
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Primitive graphics generators for widgets, the overlay's cursors, connectors, vector pointers and badges.
 */

import { compositeOver, contrastTextFor } from './contrast.js';

/** Character -> entity table for the markup-escaping helper below. */
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/**
 * Escape a caller-supplied value before it is interpolated into a markup string.
 *
 * Every generator here returns markup, so any text-bearing argument crossing that
 * boundary must be inert: without this, a label of `<img onerror=...>` becomes a
 * live element the moment the string is assigned to `innerHTML`.
 */
function escapeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

/** Longest color literal accepted; nothing legitimate needs more. */
const MAX_COLOR_LENGTH = 64;

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` - no other hex length is a color. */
const COLOR_HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** `rgb()/rgba()/hsl()/hsla()` whose arguments are numbers, percents and separators only. */
const COLOR_FUNCTION = /^(?:rgb|rgba|hsl|hsla)\([0-9.,%/\s+-]+\)$/i;

/** Bare keywords (`rebeccapurple`, `currentColor`) and bare `var(--cc-accent)` reads. */
const COLOR_IDENT = /^[a-z0-9_,()\- ]+$/i;

/** `var(--name)` / `var(--name, <fallback>)`; the fallback is validated as a color in turn. */
const COLOR_VAR = /^var\(\s*--[a-z0-9_-]+\s*(?:,\s*([^;"'<>]*?)\s*)?\)$/i;

/** Used when neither the caller value nor the caller-declared fallback is a color. */
const DEFAULT_COLOR = '#38bdf8';

function isSafeColor(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text === '' || text.length > MAX_COLOR_LENGTH) return false;
  if (COLOR_HEX.test(text) || COLOR_FUNCTION.test(text) || COLOR_IDENT.test(text)) return true;

  // A custom-property read may carry its own fallback color, which must clear the same bar.
  const varMatch = COLOR_VAR.exec(text);
  if (!varMatch) return false;
  return varMatch[1] === undefined || isSafeColor(varMatch[1]);
}

/**
 * Validate a caller-supplied color before it is interpolated into markup.
 *
 * Escaping is not enough here: these values land inside `style="..."` and
 * `stroke="..."`, where `#fff;"><img onerror=...>` breaks out of the attribute
 * and `#fff" onload="..."` injects a sibling attribute. A color has a small,
 * well-known grammar, so anything outside it is rejected outright rather than
 * neutered - a rejected value degrades to the fallback, never to markup.
 */
export function safeColor(value, fallback = DEFAULT_COLOR) {
  if (isSafeColor(value)) return value.trim();
  if (isSafeColor(fallback)) return fallback.trim();
  return DEFAULT_COLOR;
}

/**
 * Contrast lives next door (`./contrast.js`) and is re-exported here, so
 * `primitives` stays the single import site for everything a generator needs.
 */
export { compositeOver, contrastTextFor, relativeLuminance } from './contrast.js';

/**
 * Coerce a caller-supplied numeric argument.
 *
 * Guards two failures at once: `NaN`/`Infinity` reaching `toFixed` (which renders
 * the literal string `NaN` into a path or a width), and non-numeric strings being
 * interpolated verbatim into an attribute.
 */
export function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return Number.isFinite(fallback) ? fallback : 0;
}

/** Control characters used to smuggle a scheme past a naive prefix test. */
const URL_CONTROL_CHARS = /[\u0000-\u0020\u007F]/g;

/** Leading `scheme:` of an absolute URL, per RFC 3986. */
const URL_SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** Only image payloads may arrive as a data URI; `data:text/html` is a script vector. */
const DATA_IMAGE_PREFIX = /^data:image\//i;

/**
 * Validate a caller-supplied URL destined for a `src` attribute.
 *
 * `setAttribute` blocks markup injection but not navigation-time execution:
 * `javascript:` and `data:text/html` both run script from an otherwise inert
 * attribute. Relative URLs and http(s) are passed through; image data URIs are
 * allowed so the built-in SVG placeholder still works.
 */
export function safeUrl(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  if (text === '') return fallback;

  const scheme = URL_SCHEME.exec(text.replace(URL_CONTROL_CHARS, ''));
  if (!scheme) return text;

  const protocol = scheme[1].toLowerCase();
  if (protocol === 'http' || protocol === 'https') return text;
  if (protocol === 'data' && DATA_IMAGE_PREFIX.test(text)) return text;
  return fallback;
}

/**
 * Generate an SVG vector directional pointer / needle (representing vector angle or gradient)
 */
export function createVectorPointerSVG(vectorValue, options = {}) {
  const rawAngle = options.angle !== undefined
    ? options.angle
    : (safeNumber(vectorValue, 0) || 0) * (options.isRadians ? (180 / Math.PI) : 1);
  const angleDeg = safeNumber(rawAngle, 0);
  const color = safeColor(options.color, '#38bdf8');
  const size = safeNumber(options.size || 24, 24);

  return `
<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${angleDeg.toFixed(1)}deg); transform-origin: center; transition: transform 0.2s ease;">
  <line x1="12" y1="20" x2="12" y2="4" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
  <polyline points="7,9 12,4 17,9" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="12" cy="20" r="2.5" fill="${color}"/>
</svg>`.trim();
}

/**
 * Generate a visual gradient / magnitude meter for float vectors
 */
export function createGradientMeterSVG(val, min = 0, max = 100, options = {}) {
  const value = safeNumber(val, 0);
  const low = safeNumber(min, 0);
  const high = safeNumber(max, 100);
  const span = high - low;
  const percent = span === 0 ? 0 : Math.min(100, Math.max(0, ((value - low) / span) * 100));
  const color = safeColor(options.color, '#6366f1');
  const height = safeNumber(options.height || 6, 6);

  // A string generator cannot be styled by class, so it reads the same tokens
  // the stylesheet does - the theme reaches in here through the fallback chain.
  return `
<div style="width: 100%; height: ${height}px; background: var(--cc-meter-track, rgba(255,255,255,0.1)); border-radius: var(--cc-radius-pill, 9999px); overflow: hidden; position: relative;">
  <div style="width: ${percent.toFixed(1)}%; height: 100%; background: linear-gradient(90deg, ${color}, var(--cc-meter-end, #ec4899)); border-radius: var(--cc-radius-pill, 9999px); transition: width 0.3s ease;"></div>
</div>`.trim();
}

/**
 * The `d` of a smooth connector between two blit centres.
 *
 * Pulled out of {@link createConnectorPathSVG} so the string generator and the
 * live-node connector (the connect add-on, which builds real `<path>` elements
 * through `h()`) compute the *same* curve from the *same* code - the geometry is
 * one thing, and only its destination (a markup string vs. a node's `d`
 * attribute) differs. Coordinates are coerced through {@link safeNumber} so a
 * `NaN` centre degrades to `0` rather than writing the literal `NaN` into a path.
 *
 * @returns {string} an SVG path `d` (`M x1 y1 C ...`)
 */
export function connectorPathData(fromX, fromY, toX, toY) {
  const x1 = safeNumber(fromX, 0);
  const y1 = safeNumber(fromY, 0);
  const x2 = safeNumber(toX, 0);
  const y2 = safeNumber(toY, 0);
  const dx = (x2 - x1) * 0.5;

  // A smooth bezier curve between the two centres.
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/**
 * The `d` of an edge-to-edge connector between two boxes (`{minX, maxX, minY,
 * maxY, centerX, centerY}`): the larger centre delta picks the axis, the curve
 * leaves and enters each box on the face nearest the other, and the control
 * points push out along that axis by 40% of the gap (at least 40px), so a
 * connector meets each border rather than diving through the centre.
 * @returns {string} an SVG path `d` (`M x1 y1 C ...`)
 */
export function edgeConnectorPathData(from, to) {
  const dx = safeNumber(to.centerX, 0) - safeNumber(from.centerX, 0);
  const dy = safeNumber(to.centerY, 0) - safeNumber(from.centerY, 0);
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const sign = (horizontal ? dx : dy) >= 0 ? 1 : -1;
  const offset = sign * Math.max(40, Math.abs(horizontal ? dx : dy) * 0.4);
  const exit = (box, forward) => (horizontal
    ? [forward ? box.maxX : box.minX, box.centerY]
    : [box.centerX, forward ? box.maxY : box.minY]);
  const [x1, y1] = exit(from, sign > 0).map((each) => safeNumber(each, 0));
  const [x2, y2] = exit(to, sign < 0).map((each) => safeNumber(each, 0));
  const [c1x, c1y, c2x, c2y] = horizontal ? [x1 + offset, y1, x2 - offset, y2] : [x1, y1 + offset, x2, y2 - offset];
  const n = (value) => value.toFixed(1);
  return `M ${n(x1)} ${n(y1)} C ${n(c1x)} ${n(c1y)}, ${n(c2x)} ${n(c2y)}, ${n(x2)} ${n(y2)}`;
}

/**
 * Generate an SVG connector path between two points in canvas coordinates
 */
export function createConnectorPathSVG(fromX, fromY, toX, toY, options = {}) {
  const stroke = safeColor(options.stroke, 'var(--cc-connector, rgba(56, 189, 248, 0.6))');
  const strokeWidth = safeNumber(options.strokeWidth || 2, 2);
  const d = connectorPathData(fromX, fromY, toX, toY);

  // The SVG layer carries the camera transform, so the geometry is in canvas
  // space and the stroke would otherwise be scaled with it. `non-scaling-stroke`
  // keeps the line one device weight at every zoom. The dash *pattern* is still
  // scaled - SVG offers no equivalent for `stroke-dasharray` - which is the
  // documented tradeoff of drawing connectors in canvas coordinates.
  return `
<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="${options.dashed ? '6,4' : 'none'}" vector-effect="non-scaling-stroke" />
  `.trim();
}

/** A tint the badge can reason about: six hex digits, no alpha, no indirection. */
const SIX_DIGIT_HEX = /^#[0-9a-f]{6}$/i;

/**
 * Surface the badge is assumed to sit on: the default `--cc-card-bg`.
 *
 * The badge is a string generator, so it cannot read the cascade - it has to
 * assume a backdrop, and the dark card is the one every default and every
 * shipped example uses. Compositing over a mid-grey instead satisfies neither
 * theme (it picks dark text, which scores 2.1:1 on the default dark card), so
 * the assumption is stated rather than averaged - and exposed, as the `surface`
 * option below, for a caller that knows it is drawing onto something else.
 */
export const BADGE_SURFACE = '#1e293b';

/**
 * Token a theme sets to take the text colour decision away from this generator.
 *
 * It is read as the *override* half of the emitted `color` declaration, with the
 * per-tint computed colour as its fallback:
 *
 *     color: var(--cc-badge-text-override, #0b1220)
 *
 * That ordering is the whole fix for a themed badge. The colour has to be inline
 * - it is computed per tint, and no stylesheet can know a tint - but an inline
 * declaration outranks every host-level token, so a theme that merely redefined
 * `--cc-badge-text` was silently losing to a colour computed for a *dark* card
 * (light-theme badges measured ~1.15:1). Reading a token the theme owns, and
 * falling back to the computation, lets the theme win without giving up the
 * default.
 *
 * A theme-level single colour cannot beat the per-tint computation on its own
 * terms - one colour cannot be the best foreground for twelve tints - so setting
 * this is an explicit choice: "on my surface, every badge reads in this colour".
 * `LIGHT_THEME` makes exactly that choice, because on a light card the whole
 * tint range wants dark text and the computation assumed a dark one.
 */
export const BADGE_TEXT_OVERRIDE_TOKEN = '--cc-badge-text-override';

/**
 * Badge alpha floors, as 8-bit hex.
 *
 * The original 0x26 fill and 0x4d border were invisible for dark tints against
 * the card. These are the smallest values that keep the badge reading as a
 * tinted chip while leaving an edge that can actually be seen.
 */
const BADGE_BG_ALPHA = 0x40;
const BADGE_BORDER_ALPHA = 0x66;

/** Alphas used for tints whose value is unknown at generation time. */
const LEGACY_BG_ALPHA = 0x26;
const LEGACY_BORDER_ALPHA = 0x4d;

/** An 8-bit alpha as the two hex digits appended to a `#rrggbb` literal. */
function alphaSuffix(byte) {
  return byte.toString(16).padStart(2, '0');
}

/**
 * Generate a badge for a blit's status or metadata.
 *
 * For a six-digit hex tint the text color is *computed*: the fill is that tint
 * at {@link BADGE_BG_ALPHA} over {@link BADGE_SURFACE}, and the label takes
 * whichever of the two default foregrounds reads better on the result (>= 4.5:1
 * for every tint, asserted by the unit sweep). The dot keeps the raw tint, so
 * the badge still carries the color it was given.
 *
 * Any other color form - `rgb()`, a keyword, `var(--token)`, three-digit hex -
 * keeps the plain behaviour: tint-colored text and the fixed alphas. Their value is only known after the cascade runs, and a contrast
 * decision made on a guess is worse than no decision.
 *
 * Whatever is computed is emitted as the *fallback* of a
 * {@link BADGE_TEXT_OVERRIDE_TOKEN} read, so a theme drawing onto a different
 * surface can take the decision back (see the token's own note).
 *
 * @param {string} label badge text; escaped
 * @param {string} [color='#38bdf8'] tint
 * @param {{surface?: string}} [options] `surface` is the opaque backdrop the
 *   fill is composited over before the text colour is chosen; defaults to
 *   {@link BADGE_SURFACE}, the dark card.
 */
export function createBadgeSVG(label, color = '#38bdf8', options = {}) {
  const tint = safeColor(color, '#38bdf8');
  const known = SIX_DIGIT_HEX.test(tint);
  const surface = safeColor(options.surface, BADGE_SURFACE);

  const bgAlpha = known ? BADGE_BG_ALPHA : LEGACY_BG_ALPHA;
  const borderAlpha = known ? BADGE_BORDER_ALPHA : LEGACY_BORDER_ALPHA;
  const text = known
    ? contrastTextFor(compositeOver(tint, bgAlpha / 255, surface))
    : tint;

  return `
<span class="cloudcanvas-primitive-badge" style="color: var(${BADGE_TEXT_OVERRIDE_TOKEN}, ${text}); --cc-badge-border: ${tint}${alphaSuffix(borderAlpha)}; --cc-badge-bg: ${tint}${alphaSuffix(bgAlpha)};">
  <span style="width: var(--cc-badge-dot, 6px); height: var(--cc-badge-dot, 6px); border-radius: 50%; background: ${tint};"></span>
  ${escapeText(label)}
</span>`.trim();
}

/**
 * Fraction of the parent-corner-to-target-corner run each frustum segment covers.
 * Short enough to read as a direction rather than a cage, long enough to be
 * unambiguous about which corner it points at.
 */
const FRUSTUM_SEGMENT_LERP = 0.35;

/**
 * One tapered spike: a filled triangle whose base straddles the parent corner
 * and whose apex is the stopping point `FRUSTUM_SEGMENT_LERP` of the way in.
 *
 * A taper needs varying width, and an SVG stroke has exactly one. So the segment
 * is drawn as a *filled* shape instead: base half-width `half` at the corner,
 * zero at the tip. Degenerate runs (a target corner sitting on a parent corner)
 * contribute nothing rather than a NaN path.
 */
function frustumSpike(ax, ay, bx, by, half) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return '';

  const tipX = ax + dx * FRUSTUM_SEGMENT_LERP;
  const tipY = ay + dy * FRUSTUM_SEGMENT_LERP;
  // Unit normal to the run, scaled to the base half-width.
  const nx = (-dy / length) * half;
  const ny = (dx / length) * half;

  return `M ${(ax + nx).toFixed(1)} ${(ay + ny).toFixed(1)}`
    + ` L ${tipX.toFixed(1)} ${tipY.toFixed(1)}`
    + ` L ${(ax - nx).toFixed(1)} ${(ay - ny).toFixed(1)} Z`;
}

/**
 * Four tapered spikes reaching from a *scope's* corners toward the focused blit.
 *
 * `parentBounds` is the real box of the blit's parent, in the same screen
 * space as `targetBounds` - not the host rectangle, which is what this used to
 * be handed and which made every reticle claim the whole viewport as its parent.
 * A blit at the canvas root has no parent and so no frustum at all; the
 * caller decides that, because only the caller knows.
 *
 * The spikes stop a third of the way in, and there is no dashed rectangle any
 * more: the reticle brackets (`createFocusCursorSVG`) are the single outline of
 * the target, so a second box around the same bounds was redundant ink.
 *
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} parentBounds
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} targetBounds
 */
export function createFrustumProjectionSVG(parentBounds, targetBounds, options = {}) {
  const stroke = safeColor(options.stroke, '#833446');
  const half = safeNumber(options.strokeWidth || 3, 3) / 2;
  const opacity = safeNumber(options.opacity !== undefined ? options.opacity : 0.85, 0.85);

  const px = safeNumber(parentBounds.minX, 0);
  const py = safeNumber(parentBounds.minY, 0);
  const pr = safeNumber(parentBounds.maxX, 0);
  const pb = safeNumber(parentBounds.maxY, 0);

  const tx = safeNumber(targetBounds.minX, 0);
  const ty = safeNumber(targetBounds.minY, 0);
  const tr = safeNumber(targetBounds.maxX, 0);
  const tb = safeNumber(targetBounds.maxY, 0);

  // One spike per corner pair, parent corner -> matching target corner.
  const spikes = [
    frustumSpike(px, py, tx, ty, half),
    frustumSpike(pr, py, tr, ty, half),
    frustumSpike(pr, pb, tr, tb, half),
    frustumSpike(px, pb, tx, tb, half)
  ].filter(Boolean).join(' ');

  return `
<g class="cloudcanvas-frustum-projection" opacity="${opacity}">
  <path d="${spikes}" fill="${stroke}" stroke="none" />
</g>`.trim();
}

/**
 * Caption colour used when the caller names none.
 *
 * Not `options.color`: the reticle stroke is a marker read as a shape, the
 * caption is text with a WCAG floor, and the focus red that works as the first
 * measures 2.29:1 as the second. The read resolves to the canvas's own body
 * colour, so a theme carries the caption without naming it (see
 * the focus cursor in `../../addons/cursors.js`).
 */
export const FOCUS_LABEL_COLOR = 'var(--cc-cursor-label, var(--cc-text, #e2e8f0))';

/**
 * Generate a programmable focus cursor reticle around target coordinates.
 *
 * `options.color` strokes the brackets; `options.labelColor` paints the caption
 * and defaults to {@link FOCUS_LABEL_COLOR} rather than to the stroke.
 */
export function createFocusCursorSVG(targetBounds, options = {}) {
  const color = safeColor(options.color, '#9f3a52');
  const labelColor = safeColor(options.labelColor, FOCUS_LABEL_COLOR);
  const cornerSize = safeNumber(options.cornerSize || 16, 16);
  const pad = safeNumber(options.padding || 8, 8);
  const minX = safeNumber(targetBounds.minX, 0);
  const minY = safeNumber(targetBounds.minY, 0);
  const x = minX - pad;
  const y = minY - pad;
  const w = (safeNumber(targetBounds.maxX, 0) - minX) + pad * 2;
  const h = (safeNumber(targetBounds.maxY, 0) - minY) + pad * 2;

  const path = `
    M ${x} ${y + cornerSize} L ${x} ${y} L ${x + cornerSize} ${y}
    M ${x + w - cornerSize} ${y} L ${x + w} ${y} L ${x + w} ${y + cornerSize}
    M ${x + w} ${y + h - cornerSize} L ${x + w} ${y + h} L ${x + w - cornerSize} ${y + h}
    M ${x + cornerSize} ${y + h} L ${x} ${y + h} L ${x} ${y + h - cornerSize}
  `.trim();

  return `
<g class="cloudcanvas-focus-cursor">
  <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
  ${options.label ? `
    <text class="cloudcanvas-focus-cursor-label" x="${x + w / 2}" y="${y - 8}" text-anchor="middle" fill="${labelColor}" font-size="11" font-weight="600" font-family="sans-serif">${escapeText(options.label)}</text>
  ` : ''}
</g>`.trim();
}

/**
 * Neutral placeholder image markup: a slate tile with a low-contrast glyph.
 * Inline SVG keeps the fallback dependency-free, decodable by every browser, and
 * legible at any size the media card happens to be laid out at.
 */
const PLACEHOLDER_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='48' viewBox='0 0 64 48'>"
  + "<rect width='64' height='48' rx='4' fill='#1e293b'/>"
  + "<circle cx='20' cy='16' r='5' fill='#475569'/>"
  + "<path d='M8 40l14-16 10 11 8-7 16 12z' fill='#334155'/>"
  + '</svg>';

const PLACEHOLDER_DATA_URI = `data:image/svg+xml,${encodeURIComponent(PLACEHOLDER_SVG)}`;

/**
 * Data-URI placeholder for a media card with no `src`.
 *
 * Replaces the former truncated AVIF payload, which no decoder accepted and which
 * therefore always rendered as a broken image.
 */
export function createPlaceholderDataURI() {
  return PLACEHOLDER_DATA_URI;
}

/**
 * @deprecated Use `createPlaceholderDataURI`. Kept so existing imports keep resolving;
 * the returned URI is the SVG placeholder, never AVIF.
 */
export function createMinimalAVIFDataURI() {
  return createPlaceholderDataURI();
}
