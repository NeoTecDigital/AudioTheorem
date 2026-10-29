/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Color math: relative luminance, contrast, and alpha compositing.
 *
 * Separated from the generators next door because it is a different kind of
 * code - pure arithmetic over colors, with no markup, no escaping and no DOM
 * anywhere in it. `primitives.js` re-exports the two public helpers, so this
 * split is invisible to callers.
 *
 * Everything here is WCAG 2.x: the sRGB linearisation, the 0.2126/0.7152/0.0722
 * channel weights, and the (L1 + 0.05) / (L2 + 0.05) ratio.
 */

/** `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`, the only forms with a readable luminance. */
const HEX_CHANNELS = /^#([0-9a-f]{3,8})$/i;

/** Default light text: slate-50, the stylesheet's brightest foreground. */
const TEXT_LIGHT = '#f8fafc';

/** Default dark text: darker than any card background the themes ship. */
const TEXT_DARK = '#0b1220';

/** sRGB channel weights, per WCAG 2.x relative luminance. */
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/** Expand a hex color to 8-bit channels, or null when it is not hex at all. */
function hexChannels(value) {
  if (typeof value !== 'string') return null;
  const match = HEX_CHANNELS.exec(value.trim());
  if (!match) return null;

  const digits = match[1];
  const short = digits.length === 3 || digits.length === 4;
  if (!short && digits.length !== 6 && digits.length !== 8) return null;

  const read = (index) => (short
    ? parseInt(digits[index].repeat(2), 16)
    : parseInt(digits.slice(index * 2, index * 2 + 2), 16));

  return { r: read(0), g: read(1), b: read(2) };
}

/** Linearise one 8-bit sRGB channel. */
function channelLuminance(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * WCAG relative luminance of a hex color, 0 (black) to 1 (white).
 *
 * Hex only: `var(--cc-accent)` and `currentColor` have no value until the
 * cascade has run, and guessing one would make a contrast decision on a color
 * that is not the color used. Those cases return `NaN`, and every caller here
 * treats an unknown luminance as "leave this alone".
 *
 * @param {string} color `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` (alpha ignored)
 * @returns {number} luminance, or `NaN` for anything that is not hex
 */
export function relativeLuminance(color) {
  const channels = hexChannels(color);
  if (!channels) return Number.NaN;
  return LUMA_R * channelLuminance(channels.r)
    + LUMA_G * channelLuminance(channels.g)
    + LUMA_B * channelLuminance(channels.b);
}

/** WCAG contrast ratio between two relative luminances, 1:1 to 21:1. */
function ratioBetween(a, b) {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pick whichever of two foreground colors is more readable on `color`.
 *
 * This is the whole of the accessible-badge decision: a tint chosen for its
 * hue says nothing about whether text can be read on it, and "use the tint as
 * the text color" - the obvious choice - fails outright for any dark tint.
 *
 * @param {string} color background, as hex
 * @param {string} [light='#f8fafc'] candidate for dark backgrounds
 * @param {string} [dark='#0b1220'] candidate for light backgrounds
 * @returns {string} `light` or `dark`; `light` when the background is unknown,
 *          because every surface this library ships is dark by default
 */
export function contrastTextFor(color, light = TEXT_LIGHT, dark = TEXT_DARK) {
  const background = relativeLuminance(color);
  if (!Number.isFinite(background)) return light;

  const onLight = ratioBetween(background, relativeLuminance(light));
  const onDark = ratioBetween(background, relativeLuminance(dark));
  return onLight >= onDark ? light : dark;
}

/**
 * Flatten `color` at `alpha` over `base` into an opaque hex color.
 *
 * A translucent background has no luminance of its own; what a reader actually
 * sees is the composite, so that is what the contrast test has to run against.
 *
 * @param {string} color foreground hex
 * @param {number} alpha 0..1
 * @param {string} base opaque backdrop hex
 * @returns {string} `#rrggbb`, or `base` when either input is not hex
 */
export function compositeOver(color, alpha, base) {
  const top = hexChannels(color);
  const bottom = hexChannels(base);
  if (!top || !bottom) return base;

  const mix = (a, b) => Math.round(a * alpha + b * (1 - alpha));
  const hex = (value) => value.toString(16).padStart(2, '0');
  return `#${hex(mix(top.r, bottom.r))}${hex(mix(top.g, bottom.g))}${hex(mix(top.b, bottom.b))}`;
}
