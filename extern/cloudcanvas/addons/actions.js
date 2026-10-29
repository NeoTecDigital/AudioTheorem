/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The reactions add-on's actions (`./reactions.js`): what a binding can do to its
 * target blit. An action is `{label, params, run(target, params, context)}`; its
 * params are typed descriptors an editor renders a control for and every run
 * validates against, so a stored binding always carries values its action takes.
 *
 *   actionRegistry.register('pulse', { label: 'Pulse', params: [], run: (b) => b.el.animate(...) });
 *
 * `context` is `{app, source, target, event}`. The built-in set (`builtinActions`)
 * is added on first use of the reactions trait, never on import.
 */
import { injectAddonCss } from './trait.js';
import { STYLE_PROPERTIES, setStyle } from './style.js';
import { go } from './history.js';
import { contentKeyOf, contentOf, setContents } from './widget.js';
import { TOAST_CSS } from '../graphics/css/toast.js';

/** The controls a parameter can be edited with. */
export const PARAM_CONTROLS = /* @__PURE__ */ Object.freeze(['text', 'number', 'checkbox', 'select']);

/** How long a toast stays, and how long it takes to leave, in ms. */
export const TOAST_MS = 2800;
const TOAST_EXIT_MS = 300;

/** One raw value as its descriptor's control reads it, or `{error}`. */
function coerceParam(descriptor, raw) {
  if (descriptor.control === 'number') {
    const number = Number(raw);
    return Number.isFinite(number) ? { value: number } : { error: `"${descriptor.key}" must be a number` };
  }
  if (descriptor.control === 'checkbox') return { value: Boolean(raw) };
  const value = raw === undefined || raw === null ? '' : String(raw);
  if (descriptor.control === 'select' && !descriptor.options.some((option) => option.value === value)) {
    return { error: `"${descriptor.key}" is not one of the offered values` };
  }
  return { value };
}

/** Every declared param coerced; a missing required one, or one that does not coerce, is the error. */
function validateParams(definition, raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const params = {};
  for (const descriptor of definition.params) {
    if (!Object.hasOwn(source, descriptor.key)) {
      if (descriptor.required) return { valid: false, error: `missing parameter "${descriptor.key}"` };
      continue;
    }
    const coerced = coerceParam(descriptor, source[descriptor.key]);
    if (coerced.error) return { valid: false, error: coerced.error };
    params[descriptor.key] = coerced.value;
  }
  return { valid: true, params };
}

/** A param descriptor, checked and frozen. */
function normalizeDescriptor(descriptor, type) {
  const key = typeof descriptor?.key === 'string' ? descriptor.key : '';
  if (key === '') throw new Error(`ActionRegistry: action "${type}" has a parameter with no key`);
  if (!PARAM_CONTROLS.includes(descriptor.control)) {
    throw new Error(`ActionRegistry: parameter "${key}" of "${type}" has an unknown control`);
  }
  if (descriptor.control === 'select' && !Array.isArray(descriptor.options)) {
    throw new Error(`ActionRegistry: select parameter "${key}" of "${type}" needs options`);
  }
  return Object.freeze({
    key,
    label: descriptor.label || key,
    control: descriptor.control,
    required: descriptor.required !== false,
    options: descriptor.control === 'select' ? Object.freeze([...descriptor.options]) : null,
    placeholder: descriptor.placeholder || ''
  });
}

/** Actions by type; a type is registered once and never silently replaced. */
export class ActionRegistry {
  constructor() {
    this._definitions = new Map();
  }

  register(type, definition) {
    if (typeof type !== 'string' || type === '') throw new Error('ActionRegistry.register: type must be a non-empty string');
    if (typeof definition?.run !== 'function') throw new Error(`ActionRegistry.register: "${type}" requires a run function`);
    if (this._definitions.has(type)) throw new Error(`ActionRegistry.register: "${type}" is already registered`);
    const params = Array.isArray(definition.params) ? definition.params : [];
    const normalized = Object.freeze({
      type,
      label: definition.label || type,
      params: Object.freeze(params.map((descriptor) => normalizeDescriptor(descriptor, type))),
      run: definition.run
    });
    this._definitions.set(type, normalized);
    return normalized;
  }

  has(type) { return this._definitions.has(type); }

  get(type) { return this._definitions.get(type); }

  unregister(type) { return this._definitions.delete(type); }

  list() { return Array.from(this._definitions.values()); }

  /** The param descriptors of a type, or none. */
  describe(type) { return this._definitions.get(type)?.params ?? []; }

  /** `{valid, params}` or `{valid: false, error}`. */
  validate(type, params) {
    const definition = this._definitions.get(type);
    if (!definition) return { valid: false, error: `unknown action type "${type}"` };
    return validateParams(definition, params);
  }

  /** Validate, then run. @throws {TypeError} on an unknown type or invalid params */
  run(type, target, params, context = {}) {
    const definition = this._definitions.get(type);
    if (!definition) throw new TypeError(`ActionRegistry.run: unknown action type "${type}"`);
    const result = validateParams(definition, params);
    if (!result.valid) throw new TypeError(`ActionRegistry.run: ${result.error}`);
    return definition.run(target, result.params, context);
  }
}

/* ------------------ BUILT-IN ACTIONS ------------------ */

const STYLE_OPTIONS = /* @__PURE__ */ Object.freeze(
  STYLE_PROPERTIES.map((entry) => Object.freeze({ value: entry.property, label: entry.label }))
);

const VISIBILITY_MODES = /* @__PURE__ */ Object.freeze([
  { value: 'toggle', label: 'Toggle' }, { value: 'hide', label: 'Hide' }, { value: 'show', label: 'Show' }
]);

const TOAST_VARIANTS = /* @__PURE__ */ Object.freeze([
  { value: 'info', label: 'Info' }, { value: 'success', label: 'Success' }, { value: 'warning', label: 'Warning' }
]);

/** What a blit holds under `key`: a widget's contents, else its slot text; ''. */
function fillOf(b, key) {
  return (contentKeyOf(b) ? contentOf(b)[key] : b.spec.fill?.[key]) ?? '';
}

/** Content keys a reaction may never write: the markup key, prototype keys, and the `cc:` back-references. */
function isReservedKey(key) {
  return key === 'html' || key === '__proto__' || key === 'constructor' || key === 'prototype' || key.startsWith('cc:');
}

/** Write `patch` where the blit keeps its contents: a widget's own key, else its slots; a reserved key throws. */
function writeFill(b, patch) {
  const reserved = Object.keys(patch).find(isReservedKey);
  if (reserved !== undefined) throw new TypeError(`reactions: the content key "${reserved}" is reserved`);
  return contentKeyOf(b) ? setContents(b, patch) : b.set({ fill: patch });
}

/** Hide, show or flip a blit's visibility; the layout slot is kept. @returns {boolean} hidden now */
function toggleVisibility(b, { mode }) {
  const hidden = b.el.style.getPropertyValue('visibility') === 'hidden';
  const next = mode === 'hide' || (mode !== 'show' && !hidden);
  if (next) b.el.style.setProperty('visibility', 'hidden');
  else b.el.style.removeProperty('visibility');
  return next;
}

/** Add `step` to the number in `fill[key]`; a `"Label: n"` title follows it. @returns {number} */
function incrementCounter(b, { key = 'count', step }) {
  const name = key || 'count';
  const next = (Number(fillOf(b, name)) || 0) + (Number.isFinite(step) ? step : 1);
  const fill = { [name]: contentKeyOf(b) ? next : String(next) };
  const title = String(fillOf(b, 'title'));
  if (name !== 'title' && title.includes(':')) fill.title = `${title.split(':')[0].trim()}: ${next}`;
  writeFill(b, fill);
  return next;
}

/** A toast in the root's overlay (else the body) that leaves by itself. @returns {Element|null} */
export function toast(app, message, variant = 'info') {
  if (typeof document === 'undefined') return null;
  injectAddonCss('toast', TOAST_CSS);
  const layer = app?.el.querySelector(':scope > [data-blit-overlay]') ?? document.body;
  let stack = layer.querySelector(':scope > .cloudcanvas-toasts');
  if (!stack) {
    stack = layer.appendChild(document.createElement('div'));
    stack.className = 'cloudcanvas-toasts';
    stack.setAttribute('role', 'status');
  }
  const element = stack.appendChild(document.createElement('div'));
  element.className = `cloudcanvas-toast cloudcanvas-toast-${variant}`;
  element.textContent = message;
  requestAnimationFrame(() => element.classList.add('is-shown'));
  setTimeout(() => {
    element.classList.remove('is-shown');
    setTimeout(() => element.remove(), TOAST_EXIT_MS);
  }, TOAST_MS);
  return element;
}

/** The root blit a page named `name` is: a top-level blit whose `title` or `name` fill matches. */
function pageNamed(app, name) {
  return app.blits.find((b) => fillOf(b, 'title') === name || fillOf(b, 'name') === name) ?? null;
}

/** Register the built-in actions on `registry` once; a second call adds nothing. @returns {ActionRegistry} */
export function builtinActions(registry = actionRegistry) {
  if (registry.has('set-content')) return registry;
  registry.register('set-content', {
    label: 'Set content',
    params: [
      { key: 'key', label: 'Content key', control: 'text', placeholder: 'title' },
      { key: 'value', label: 'Value', control: 'text' }
    ],
    run: (b, { key, value }) => writeFill(b, { [key]: value })
  });
  registry.register('set-style', {
    label: 'Set style',
    params: [
      { key: 'property', label: 'Property', control: 'select', options: STYLE_OPTIONS },
      { key: 'value', label: 'CSS value', control: 'text', placeholder: 'e.g. #ff0000' }
    ],
    run: (b, { property, value }) => setStyle(b, property, value)
  });
  registry.register('toggle-visibility', {
    label: 'Toggle visibility',
    params: [{ key: 'mode', label: 'Mode', control: 'select', options: VISIBILITY_MODES, required: false }],
    run: toggleVisibility
  });
  registry.register('focus', {
    label: 'Focus (zoom to)',
    params: [{ key: 'promote', label: 'Zoom in', control: 'checkbox', required: false }],
    run: (b, { promote }, { app }) => go(app, b, { promote: Boolean(promote) })
  });
  registry.register('increment-counter', {
    label: 'Increment counter',
    params: [
      { key: 'key', label: 'Content key', control: 'text', placeholder: 'count' },
      { key: 'step', label: 'Step', control: 'number', required: false }
    ],
    run: incrementCounter
  });
  registry.register('notify', {
    label: 'Show notification',
    params: [
      { key: 'message', label: 'Message', control: 'text', placeholder: 'Action completed successfully' },
      { key: 'variant', label: 'Variant', control: 'select', options: TOAST_VARIANTS, required: false }
    ],
    run: (_b, { message, variant }, { app }) => Boolean(toast(app, message || 'Notification', variant || 'info'))
  });
  registry.register('navigate-page', {
    label: 'Navigate to page',
    params: [{ key: 'page', label: 'Page name', control: 'text', placeholder: 'index.html' }],
    run: (b, { page }, { app }) => go(app, pageNamed(app, page.trim()) ?? b)
  });
  return registry;
}

/** The shared registry the reactions trait runs; the built-ins join it on the trait's first run. */
export const actionRegistry = /* @__PURE__ */ new ActionRegistry();
