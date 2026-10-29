/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Select: a labelled native `<select>` as a settings row - the words, the control at the end of the line, and
 * under them a hint, or the error when the choice is invalid, wired to the control by `aria-describedby`.
 *
 *   const picker = createSelect(host, { onChange: (value) => save(value) });
 *   picker.update({ label: 'Digest', value: 'weekly', hint: 'Sent at 8am',
 *     options: [{ value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Every week' }, { value: 'never', label: 'Never', disabled: true }] });
 *
 * THE STATUS is the host's word on the setting - "Saving", "Saved", "Could not save" - on a line under the hint:
 * `status: {text, tone}` as the switch takes it (`./row-status.js`). It is a live region on the page from the first
 * draw, empty, so the words that arrive are read; it takes no room until it has some; and the control is described by
 * the hint and then the status when each has words, so a reader who comes to the control later hears the note too.
 *
 * NATIVE FIRST. The control is the platform's `<select>`, in the kit's field look, so the keys, the picker a phone
 * shows and the reader's name for it are the platform's. The row wraps: on a narrow screen the control stands
 * under its words.
 *
 * Controlled, like the switch: a choice reports the value it asks for through `onChange`, in the type the host gave
 * it (an option's `value` may be a number), and the control shows the model's value again until the host answers
 * with an `update`, so a refused change puts itself back. `disabled` keeps the row readable and reports nothing. The
 * options are redrawn only when they changed, so an open list and the focus are not disturbed by an `update`.
 */
import { FIELD_CLASS, createLife, documentOf, el, textNode, uniqueId, writeText } from './dom.js';
import { statusSlot, writeStatus } from './row-status.js';
import { injectUiStyles } from './styles.js';

const CLASS = 'cloudcanvas-ui-select';

/** The row's nodes: the words, the control, the hint, and under it the status. */
function selectNodes(doc) {
  const root = el(doc, 'div', { className: CLASS });
  const control = el(doc, 'select', { className: `${FIELD_CLASS} ${CLASS}-control`, attrs: { id: uniqueId(CLASS) } });
  const label = el(doc, 'label', { className: `${CLASS}-label`, attrs: { for: control.id } });
  const hint = el(doc, 'p', { className: `${CLASS}-hint`, attrs: { id: uniqueId(`${CLASS}-hint`), hidden: true } });
  const status = statusSlot(doc, `${CLASS}-status`);
  root.append(label, control, hint, status.node);
  return { root, control, label, hint, status, texts: { label: textNode(doc, label), hint: textNode(doc, hint) } };
}

/** The options of a model, checked before anything is drawn: a list, each with a value no other has. */
function checkedOptions(options) {
  if (!Array.isArray(options)) throw new TypeError('A select needs options');
  const seen = new Set();
  for (const option of options) {
    const key = String(option?.value);
    if (option?.value === undefined || option?.value === null || seen.has(key)) throw new TypeError(`Missing or duplicate select value: ${key}`);
    seen.add(key);
  }
  return options;
}

/** The option elements `options` make, each with the text of its label. */
function optionNodes(doc, options) {
  return options.map((option) => {
    const node = el(doc, 'option', { text: option.label ?? option.value });
    node.value = String(option.value);
    node.disabled = option.disabled === true;
    return node;
  });
}

/** Redraw the options when they are not the ones drawn; returns the value each choice stands for, by its text. */
function writeOptions(doc, select, options) {
  const signature = JSON.stringify(options.map((option) => [String(option.value), String(option.label ?? option.value), option.disabled === true]));
  if (signature !== select.signature) {
    select.control.replaceChildren(...optionNodes(doc, options));
    select.signature = signature;
  }
  select.values = new Map(options.map((option) => [String(option.value), option.value]));
}

/** Point the control at the parts of the row that describe it, the hint and then the status, each only when it has words. */
function writeDescribed(nodes, hasHint, hasStatus) {
  const described = [hasHint ? nodes.hint.id : null, hasStatus ? nodes.status.node.id : null].filter(Boolean);
  if (described.length > 0) nodes.control.setAttribute('aria-describedby', described.join(' '));
  else nodes.control.removeAttribute('aria-describedby');
}

/** Say the hint under the control and the status under it, and mark the control invalid when the hint is its error. */
function writeNotes(nodes, model) {
  const words = String(model.hint ?? '').trim();
  writeText(nodes.texts.hint, words);
  nodes.hint.hidden = words === '';
  writeDescribed(nodes, words !== '', writeStatus(nodes.status, model.status));
  if (model.invalid === true) {
    nodes.control.setAttribute('aria-invalid', 'true');
    nodes.root.setAttribute('data-invalid', 'true');
  } else {
    nodes.control.removeAttribute('aria-invalid');
    nodes.root.removeAttribute('data-invalid');
  }
}

/**
 * @param {HTMLElement} host
 * @param {{onChange?: (value: unknown) => void}} [options]
 * @returns {{update(model: {label: string, value?: unknown, options: Array<{value: unknown, label?: string, disabled?: boolean}>,
 *   disabled?: boolean, invalid?: boolean, hint?: string, status?: {text?: string, tone?: 'success'|'warning'|'danger'|'muted'}}): void,
 *   destroy(): void}}
 */
export function createSelect(host, { onChange } = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const nodes = selectNodes(doc);
  const { root, control } = nodes;
  const select = { control, signature: null, values: new Map(), shown: '' };
  host.append(root);
  life.on(control, 'change', () => {
    const asked = control.value;
    control.value = select.shown;
    if (!life.dead && !control.disabled) onChange?.(select.values.has(asked) ? select.values.get(asked) : asked);
  });
  return {
    update(model = {}) {
      if (life.dead) return;
      const label = String(model.label ?? '').trim();
      if (label === '') throw new TypeError('A select needs a label');
      writeOptions(doc, select, checkedOptions(model.options));
      writeText(nodes.texts.label, label);
      select.shown = String(model.value ?? '');
      control.value = select.shown;
      control.disabled = Boolean(model.disabled);
      writeNotes(nodes, model);
    },
    destroy() {
      if (!life.destroy()) return;
      root.remove();
    },
  };
}
