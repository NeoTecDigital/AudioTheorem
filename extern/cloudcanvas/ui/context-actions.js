/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Controlled, product-neutral pin/expand buttons. Native buttons provide
 * Enter/Space activation. Requests never change the model or save anything.
 */
import { button, createLife, documentOf, el, writeText } from './dom.js';
import { injectUiStyles } from './styles.js';

const CLASS = 'cloudcanvas-ui-context-actions';

function action(doc, life, name, label, callback) {
  const node = button(doc, { className: `${CLASS}-${name}`, label, signal: life.signal,
    onClick: () => { if (!life.dead && !node.disabled) callback?.(); } });
  return node;
}

function writeButton(node, label, disabled) {
  writeText(node.firstChild, label);
  node.setAttribute('aria-label', String(label));
  node.disabled = Boolean(disabled);
}

/**
 * @param {HTMLElement} host
 * @param {{onPin?: () => void, onExpand?: () => void}} [callbacks]
 * @returns {{update(model: {pinned?: boolean, busy?: boolean, pinDisabled?: boolean,
 *   expandDisabled?: boolean, pinLabel?: string, expandLabel?: string}): void, destroy(): void}}
 */
export function createContextActions(host, { onPin, onExpand } = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const root = el(doc, 'div', { className: CLASS });
  const pin = action(doc, life, 'pin', 'Pin', onPin);
  const expand = action(doc, life, 'expand', 'Expand', onExpand);
  pin.setAttribute('aria-pressed', 'false');
  root.append(pin, expand);
  host.append(root);
  return {
    update(model = {}) {
      if (life.dead) return;
      root.setAttribute('aria-busy', String(Boolean(model.busy)));
      pin.setAttribute('aria-pressed', String(Boolean(model.pinned)));
      writeButton(pin, model.pinLabel ?? 'Pin', model.busy || model.pinDisabled);
      writeButton(expand, model.expandLabel ?? 'Expand', model.busy || model.expandDisabled);
    },
    destroy() {
      if (!life.destroy()) return;
      root.remove();
    }
  };
}
