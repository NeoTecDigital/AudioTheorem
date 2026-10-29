/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * style: per-blit appearance overrides, from one whitelist. Each is a direct
 * inline property on the element (it outranks the stylesheet on specificity,
 * with no `!important` and no custom property leaking into descendants), and
 * clearing one lets the sheet's default show through again.
 *
 *   blit.use({ style });
 *   card.set({ style: { radius: 14, background: '#123', 'align-self': 'center' } });
 *
 * A key is the CSS property (`border-radius`), its camel case (`borderRadius`) or
 * a short alias (`radius`, `background`, `shadow`); a number for a length is px.
 * The value round-trips through the spec as `data-style` JSON, and stopping the
 * trait (`set({style: false})`, a new map, removal) takes every property it wrote
 * off again. `setStyle` / `getStyle` / `styleMap` are the call forms an editor uses.
 */
import { schedule } from '../core/frame.js';
import { rootOf, stateOf } from '../core/state.js';

/**
 * The bevel presets, as the `box-shadow` values they write: a soft, shadow-drawn
 * bevel that occupies no layout. The empty value clears the override.
 */
export const BEVEL_PRESETS = /* @__PURE__ */ Object.freeze([
  { value: '', label: 'None (default)' },
  {
    value: '0 4px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 0 -1px 0 rgba(0, 0, 0, 0.25)',
    label: 'Raised'
  },
  {
    value: 'inset 0 2px 4px rgba(0, 0, 0, 0.45), inset 0 -1px 0 rgba(255, 255, 255, 0.06)',
    label: 'Inset (pressed)'
  },
  {
    value: '0 12px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
    label: 'Floating'
  }
]);

const FONT_WEIGHTS = /* @__PURE__ */ Object.freeze([
  { value: '', label: '(default)' },
  { value: '400', label: 'Regular (400)' },
  { value: '500', label: 'Medium (500)' },
  { value: '600', label: 'Semibold (600)' },
  { value: '700', label: 'Bold (700)' }
]);

const FONT_FAMILIES = /* @__PURE__ */ Object.freeze([
  { value: '', label: '(default)' },
  { value: 'var(--cc-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif)', label: 'System' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Serif' },
  { value: 'var(--cc-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)', label: 'Monospace' }
]);

const TEXT_ALIGN = /* @__PURE__ */ Object.freeze([
  { value: '', label: '(default)' },
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
  { value: 'justify', label: 'Justify' }
]);

const SELF_ALIGN = /* @__PURE__ */ Object.freeze([
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'End' },
  { value: 'stretch', label: 'Stretch' }
]);

/**
 * The one table the whitelist and every editor read. Per entry: `property` (the
 * CSS property written), `label`, `control` ('color' | 'length' | 'select' |
 * 'presets'), `options`, `reflow` (the box moves, so it is re-measured) and
 * `flowOnly` (inert unless the element is a flow child).
 */
export const STYLE_PROPERTIES = /* @__PURE__ */ Object.freeze([
  Object.freeze({ property: 'color', label: 'Text colour', control: 'color', reflow: false }),
  Object.freeze({ property: 'background-color', label: 'Background', control: 'color', reflow: false }),
  Object.freeze({ property: 'border-radius', label: 'Corner radius', control: 'length', reflow: false }),
  Object.freeze({ property: 'box-shadow', label: 'Bevel / shadow', control: 'select', options: BEVEL_PRESETS, reflow: false }),
  Object.freeze({ property: 'padding', label: 'Padding', control: 'length', reflow: true }),
  Object.freeze({ property: 'margin', label: 'Margin', control: 'length', reflow: true }),
  Object.freeze({ property: 'font-size', label: 'Font size', control: 'length', reflow: true }),
  Object.freeze({ property: 'font-weight', label: 'Font weight', control: 'select', options: FONT_WEIGHTS, reflow: true }),
  Object.freeze({ property: 'font-family', label: 'Font family', control: 'select', options: FONT_FAMILIES, reflow: true }),
  Object.freeze({ property: 'text-align', label: 'Text align', control: 'select', options: TEXT_ALIGN, reflow: false }),
  Object.freeze({ property: 'align-self', label: 'Align self', control: 'presets', options: SELF_ALIGN, reflow: true, flowOnly: true }),
  Object.freeze({ property: 'justify-self', label: 'Justify self', control: 'presets', options: SELF_ALIGN, reflow: true, flowOnly: true })
]);

/** Property -> entry, built once, for O(1) validation. */
const ENTRY_BY_PROPERTY = /* @__PURE__ */ new Map(/* @__PURE__ */ STYLE_PROPERTIES.map((entry) => [entry.property, entry]));

/** The short names a spec may use for a property. */
const ALIASES = /* @__PURE__ */ Object.freeze({ radius: 'border-radius', background: 'background-color', shadow: 'box-shadow' });

/** Whether a property is on the whitelist. */
export function isStyleProperty(property) {
  return ENTRY_BY_PROPERTY.has(property);
}

/** The table entry for a property, or undefined. */
export function stylePropertyInfo(property) {
  return ENTRY_BY_PROPERTY.get(property);
}

/** A spec key's whitelist entry: the property, its camel case or an alias; else a TypeError. */
export function styleEntryOf(key) {
  const property = ALIASES[key] ?? String(key).replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
  const entry = ENTRY_BY_PROPERTY.get(property);
  if (!entry) {
    throw new TypeError(`style: "${key}" is not a styleable property; expected one of `
      + STYLE_PROPERTIES.map((each) => each.property).join(', '));
  }
  return entry;
}

/** A value as the CSS text written: a number is px for a length, a string trimmed; anything else throws. */
function cssValue(entry, value) {
  if (typeof value === 'number' && Number.isFinite(value)) return entry.control === 'length' ? `${value}px` : String(value);
  if (typeof value === 'string') return value.trim();
  throw new TypeError(`style: the value for "${entry.property}" must be a string or a finite number`);
}

/** A box-changing write owes the root a re-measure of the blit; a paint-only one owes nothing. */
function remeasure(element) {
  const state = stateOf(element);
  const root = state && rootOf(state);
  if (!root) return;
  root.measure.add(state);
  schedule(root);
}

/**
 * Write one override onto the element; '' clears it.
 * @returns {string} what the CSSOM holds now ('' when it was cleared, or rejected the value)
 * @throws {TypeError} on a property off the whitelist or a value that is no string or number
 */
export function setStyle(b, key, value) {
  const entry = styleEntryOf(key);
  const text = cssValue(entry, value);
  const style = b.el.style;
  if (text === '') style.removeProperty(entry.property);
  else style.setProperty(entry.property, text);
  if (entry.reflow) remeasure(b.el);
  return style.getPropertyValue(entry.property);
}

/** The override in force for a property, or ''. @throws {TypeError} off the whitelist */
export function getStyle(b, key) {
  return b.el.style.getPropertyValue(styleEntryOf(key).property);
}

/** Every whitelisted override on the element, as `{property: value}`: what an editor or a save reads. */
export function styleMap(b) {
  const map = {};
  for (const { property } of STYLE_PROPERTIES) {
    const value = b.el.style.getPropertyValue(property);
    if (value) map[property] = value;
  }
  return map;
}

/** Every entry of a trait's map, validated before anything is written: a bad map writes nothing. */
function entriesOf(options) {
  if (options === true) return [];
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('style: expected a {property: value} map');
  }
  return Object.entries(options).map(([key, value]) => {
    const entry = styleEntryOf(key);
    return [entry, cssValue(entry, value)];
  });
}

/**
 * The named trait: `set({style: {...}})` writes the map, and the cleanup removes
 * every property it wrote. A map with a bad key throws, and takes its own
 * `data-style` with it, so the spec never carries what was refused.
 */
export function style(b, options) {
  let entries;
  try {
    entries = entriesOf(options);
  } catch (error) {
    b.el.removeAttribute('data-style');
    throw error;
  }
  const written = [];
  for (const [entry, text] of entries) {
    if (text === '') continue;
    b.el.style.setProperty(entry.property, text);
    written.push(entry);
  }
  if (written.some((entry) => entry.reflow)) remeasure(b.el);
  return () => {
    for (const entry of written) b.el.style.removeProperty(entry.property);
    if (written.some((entry) => entry.reflow)) remeasure(b.el);
  };
}
