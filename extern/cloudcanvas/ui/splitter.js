/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Splitter: a focusable ARIA separator that reports a percentage.
 *
 *   const split = createSplitter(host, { onChange: (value) => setSplit(value) });
 *   split.update({ value: 50, min: 20, max: 80, label: 'Resize panes' });
 *
 * CONTROLLED: a drag or key reports `onChange(value)` and the caller writes the
 * value back. `orientation: 'vertical'` (the default) is a vertical bar that
 * resizes left and right panes. Arrows step by `step` (1), Page keys by 10,
 * Home and End jump to the limits. The pointer is captured for the whole drag,
 * and a host with no measurable size reports nothing rather than a guess.
 *
 * INSIDE A CANVAS the bar is a `<div>`, not a platform control, so it carries
 * the control attribute (`data-cc-control`): a press on it is the splitter's
 * drag and never the start of a pan or a blit drag.
 */
import { clamp, createLife, documentOf, el } from './dom.js';
import { injectUiStyles } from './styles.js';
import { CONTROL_ATTR } from '../addons/trait.js';

const CLASS = 'cloudcanvas-ui-splitter';

/** The model's limits and value, each held to 0..100. */
export function splitterLimits(model) {
  const min = Number.isFinite(model.min) ? clamp(model.min, 0, 100) : 0;
  const max = Number.isFinite(model.max) ? clamp(model.max, min, 100) : 100;
  const value = clamp(Number.isFinite(model.value) ? model.value : 50, min, max);
  return { min, max, value };
}

/** The value `key` moves to, or null when the key is not the splitter's. */
export function splitterKeyValue(key, model) {
  const { min, max, value } = splitterLimits(model);
  const step = Number.isFinite(model.step) && model.step > 0 ? model.step : 1;
  const vertical = model.orientation !== 'horizontal';
  const grow = vertical ? 'ArrowRight' : 'ArrowDown';
  const shrink = vertical ? 'ArrowLeft' : 'ArrowUp';
  const moves = { Home: min, End: max, PageUp: value - 10, PageDown: value + 10, [grow]: value + step, [shrink]: value - step };
  return Object.hasOwn(moves, key) ? clamp(moves[key], min, max) : null;
}

function startDrag(event, root, host, state) {
  const vertical = state.model.orientation !== 'horizontal';
  const rect = host.getBoundingClientRect();
  const length = vertical ? rect.width : rect.height;
  if (!(length > 0)) return;
  event.preventDefault();
  root.setPointerCapture?.(event.pointerId);
  state.drag = { id: event.pointerId, vertical, length, start: vertical ? event.clientX : event.clientY,
    value: splitterLimits(state.model).value };
  root.classList.add('is-dragging');
}

function bindSplitter(life, root, host, state, onChange) {
  life.on(root, 'keydown', (event) => {
    const next = splitterKeyValue(event.key, state.model);
    if (next === null) return;
    event.preventDefault();
    onChange?.(next);
  });
  life.on(root, 'pointerdown', (event) => {
    if (event.button === 0) startDrag(event, root, host, state);
  });
  life.on(root, 'pointermove', (event) => {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.id) return;
    const moved = (drag.vertical ? event.clientX : event.clientY) - drag.start;
    const { min, max } = splitterLimits(state.model);
    onChange?.(clamp(Math.round(drag.value + (moved / drag.length) * 100), min, max));
  });
  const end = (event) => {
    if (state.drag?.id !== event.pointerId) return;
    state.drag = null;
    root.classList.remove('is-dragging');
  };
  life.on(root, 'pointerup', end);
  life.on(root, 'pointercancel', end);
  life.on(root, 'lostpointercapture', end);
}

/**
 * @param {HTMLElement} host the element whose size a drag is measured against
 * @param {{onChange?: (value: number) => void}} [callbacks]
 * @returns {{update(model: object): void, destroy(): void}}
 */
export function createSplitter(host, { onChange } = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const root = el(doc, 'div', { className: CLASS, attrs: { role: 'separator', tabindex: '0', [CONTROL_ATTR]: true } });
  host.append(root);
  const state = { model: { value: 50 }, drag: null };
  bindSplitter(life, root, host, state, onChange);
  return {
    update(model = {}) {
      if (life.dead) return;
      state.model = model;
      const { min, max, value } = splitterLimits(model);
      root.setAttribute('aria-orientation', model.orientation === 'horizontal' ? 'horizontal' : 'vertical');
      root.setAttribute('aria-label', String(model.label ?? 'Resize panes'));
      root.setAttribute('aria-valuemin', String(min));
      root.setAttribute('aria-valuemax', String(max));
      root.setAttribute('aria-valuenow', String(value));
      if (model.controls) root.setAttribute('aria-controls', String(model.controls));
      else root.removeAttribute('aria-controls');
    },
    destroy() {
      if (!life.destroy()) return;
      state.drag = null;
      root.remove();
    }
  };
}
