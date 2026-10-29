/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Switch: one on/off setting, as a native checkbox with the `switch` role and its words beside it. It is a
 * settings row: the words first and the box last, so a column of switches keeps its boxes in one line at the end.
 * The whole row is the target (at least 44px tall), so the box inside it can stay small.
 *
 *   const toggle = createSwitch(host, { onChange: (checked) => save(checked) });
 *   toggle.update({ label: 'Reminders', detail: 'Due and upcoming', checked: true, status: { text: 'Saved', tone: 'success' } });
 *
 * Controlled, like the kit's other controls: a press reports the state it asks for through `onChange` and the
 * switch shows the model's state again until the host answers with an `update`, so a refused change puts
 * itself back. `disabled` keeps the row readable and reports nothing.
 *
 * THE STATUS is the host's word on the setting - "Saving", "Saved", "Could not save" - beside the name. It is a
 * live region (`role="status"`, polite; assertive for a `danger` tone) that is on the page from the first draw,
 * empty, because a region that comes with its words is not reliably read. `tone` is success, warning, danger or
 * muted (muted is what any other word means); it is drawn as a marker, and the words stay the page's own ink.
 */
import { createLife, documentOf, el, textNode, uniqueId, writeText } from './dom.js';
import { statusSlot, writeStatus } from './row-status.js';
import { injectUiStyles } from './styles.js';

const CLASS = 'cloudcanvas-ui-switch';

/** The row's nodes, the words before the box. */
function switchNodes(doc) {
  const root = el(doc, 'label', { className: CLASS });
  const text = el(doc, 'span', { className: `${CLASS}-text` });
  const words = el(doc, 'span', { className: `${CLASS}-label`, attrs: { id: uniqueId(CLASS) } });
  const status = statusSlot(doc, `${CLASS}-status`);
  const detail = el(doc, 'span', { className: `${CLASS}-detail`, attrs: { id: uniqueId(`${CLASS}-detail`) } });
  const box = el(doc, 'input', { className: `${CLASS}-box`, attrs: { type: 'checkbox', role: 'switch' } });
  text.append(words, status.node, detail);
  root.append(text, box);
  return { root, box, words, status, detail, texts: { words: textNode(doc, words), detail: textNode(doc, detail) } };
}

/** Point the box at the parts of the row that describe it: the detail and the status, when each has words. */
function writeDescribed(nodes, model, hasStatus) {
  const described = [model.detail ? nodes.detail.id : null, hasStatus ? nodes.status.node.id : null].filter(Boolean);
  if (described.length > 0) nodes.box.setAttribute('aria-describedby', described.join(' '));
  else nodes.box.removeAttribute('aria-describedby');
}

/**
 * @param {HTMLElement} host
 * @param {{onChange?: (checked: boolean) => void}} [options]
 * @returns {{update(model: {label: string, checked?: boolean, detail?: string, disabled?: boolean,
 *   status?: {text?: string, tone?: 'success'|'warning'|'danger'|'muted'}}): void, destroy(): void}}
 */
export function createSwitch(host, { onChange } = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const nodes = switchNodes(doc);
  const { root, box } = nodes;
  host.append(root);
  let shown = false;
  life.on(box, 'change', () => {
    const asked = Boolean(box.checked);
    box.checked = shown;
    if (!life.dead && !box.disabled) onChange?.(asked);
  });
  return {
    update(model = {}) {
      if (life.dead) return;
      const label = String(model.label ?? '').trim();
      if (label === '') throw new TypeError('A switch needs a label');
      shown = Boolean(model.checked);
      writeText(nodes.texts.words, label);
      writeText(nodes.texts.detail, String(model.detail ?? ''));
      nodes.detail.hidden = !model.detail;
      box.checked = shown;
      box.disabled = Boolean(model.disabled);
      box.setAttribute('aria-labelledby', nodes.words.id);
      box.setAttribute('aria-checked', String(shown));
      writeDescribed(nodes, model, writeStatus(nodes.status, model.status));
    },
    destroy() {
      if (!life.destroy()) return;
      root.remove();
    },
  };
}
