/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Empty state: what a region says when it has nothing to show.
 *
 *   const empty = createEmptyState(host, { onAction: () => newNote() });
 *   empty.update({ title: 'No notes yet', body: 'Notes you write appear here.', actionLabel: 'New note' });
 *
 * A title, a sentence, and at most one action. The action is drawn only when
 * the model names it and something answers it: a button that does nothing is
 * not an invitation. A part with no words is hidden rather than left as a gap.
 *
 * WHAT KIND OF NOTHING. `kind` is 'empty' (nothing here yet), 'error' (it could not be loaded), 'locked' (it needs
 * something first) or 'loading' (it is on its way): it chooses the icon above the words and the tone it is drawn in,
 * and is written as `data-kind`. A loading one says `aria-busy`. With no kind there is no icon. A kind the kit does
 * not know is a TypeError, before anything is drawn.
 *
 * It is content, not a live region. For a state that changes while the user
 * waits - loading, failed, retry - use `createStatus`.
 */
import { button, createLife, documentOf, el, textNode, writeText } from './dom.js';
import { iconSlot, writeIcon } from './icons.js';
import { injectUiStyles } from './styles.js';

const CLASS = 'cloudcanvas-ui-empty';
const KINDS = /* @__PURE__ */ new Set(['empty', 'error', 'locked', 'loading']);

/** The kind a model names: none, or one the kit has an icon for. */
function kindOf(model) {
  if (model.kind === undefined || model.kind === null) return null;
  if (!KINDS.has(model.kind)) throw new TypeError(`Unknown empty-state kind: ${String(model.kind)}`);
  return model.kind;
}

/** Write `value` into a part and hide the part when there are no words; returns whether it shows. */
function writePart(node, text, value) {
  const words = String(value ?? '').trim();
  writeText(text, words);
  node.hidden = words === '';
  return words !== '';
}

/**
 * @param {HTMLElement} host
 * @param {{onAction?: () => void}} [callbacks]
 * @returns {{update(model: {kind?: 'empty'|'error'|'locked'|'loading', title?: string, body?: string, actionLabel?: string}): void, destroy(): void}}
 */
export function createEmptyState(host, { onAction } = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const acts = typeof onAction === 'function';
  const root = el(doc, 'div', { className: CLASS });
  const slot = iconSlot(doc, `${CLASS}-icon`);
  const title = el(doc, 'p', { className: `${CLASS}-title`, attrs: { hidden: true } });
  const body = el(doc, 'p', { className: `${CLASS}-body`, attrs: { hidden: true } });
  const action = button(doc, { className: `${CLASS}-action`, label: '', signal: life.signal, onClick: () => onAction?.(), attrs: { hidden: true } });
  const texts = { title: textNode(doc, title), body: textNode(doc, body) };
  root.append(slot, title, body, action);
  host.append(root);
  return {
    update(model = {}) {
      if (life.dead) return;
      const kind = kindOf(model);
      writeIcon(slot, kind ?? undefined);
      if (kind) root.setAttribute('data-kind', kind);
      else root.removeAttribute('data-kind');
      if (kind === 'loading') root.setAttribute('aria-busy', 'true');
      else root.removeAttribute('aria-busy');
      writePart(title, texts.title, model.title);
      writePart(body, texts.body, model.body);
      const named = writePart(action, action.firstChild, model.actionLabel);
      action.hidden = !(acts && named);
    },
    destroy() {
      if (life.destroy()) root.remove();
    }
  };
}
