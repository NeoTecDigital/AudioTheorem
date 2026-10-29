/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Progress: how far along something is, as a native `<progress>` with its
 * label on screen beside it.
 *
 *   const progress = createProgress(host);
 *   progress.update({ value: 3, max: 5, label: '3 of 5 done' });
 *
 * The label is the bar's name (`aria-labelledby`) and is shown, so the eye and
 * the ear are told the same thing; a bar with no label has no name and is
 * refused. `value` is held to `0..max`. A `max` that is no positive number is
 * the platform's own range, 0 to 1 - so none of none is an empty bar, not a
 * broken one. With no `value` the bar is indeterminate: it claims nothing
 * rather than claiming zero.
 */
import { clamp, createLife, documentOf, el, textNode, uniqueId, writeText } from './dom.js';
import { injectUiStyles } from './styles.js';

const CLASS = 'cloudcanvas-ui-progress';

/** `value` as a finite number, or null when the model gave none. */
function numberOf(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** The range and the value inside it; `value` is null for an indeterminate bar. */
function progressOf(model) {
  const limit = numberOf(model.max);
  const max = limit !== null && limit > 0 ? limit : 1;
  const value = numberOf(model.value);
  return { max, value: value === null ? null : clamp(value, 0, max) };
}

/**
 * @param {HTMLElement} host
 * @returns {{update(model: {value?: number, max?: number, label: string}): void, destroy(): void}}
 */
export function createProgress(host) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const root = el(doc, 'div', { className: CLASS });
  const label = el(doc, 'span', { className: `${CLASS}-label`, attrs: { id: uniqueId(CLASS) } });
  const labelText = textNode(doc, label);
  const bar = el(doc, 'progress', { className: `${CLASS}-bar`, attrs: { 'aria-labelledby': label.id } });
  root.append(label, bar);
  host.append(root);
  return {
    update(model = {}) {
      if (life.dead) return;
      const words = String(model.label ?? '').trim();
      if (words === '') throw new TypeError('A progress bar needs a label');
      const { max, value } = progressOf(model);
      writeText(labelText, words);
      bar.setAttribute('max', String(max));
      if (value === null) bar.removeAttribute('value');
      else bar.setAttribute('value', String(value));
    },
    destroy() {
      if (life.destroy()) root.remove();
    }
  };
}
