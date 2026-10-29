/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Controlled nonmodal context window. Close/Escape request closure; only
 * update({open:false}) hides it. Tab remains the browser's, not a focus trap.
 * Focus is restored if it was still inside the closing window; closing an
 * inactive window must not steal focus from another part of the page.
 * Content is caller-owned DOM, never parsed as HTML or persisted by the kit.
 */
import { button, createLife, documentOf, el, focusablesIn, textNode, uniqueId, writeText } from './dom.js';
import { createContextActions } from './context-actions.js';
import { bindViewport } from './context-window/viewport.js';
import { injectUiStyles } from './styles.js';

const CLASS = 'cloudcanvas-ui-context-window';

function windowNodes(doc, life, requestClose) {
  const root = el(doc, 'section', { className: CLASS,
    attrs: { role: 'dialog', 'aria-modal': 'false', tabindex: '-1', hidden: true, 'data-cc-control': true } });
  const header = el(doc, 'div', { className: `${CLASS}-header` });
  const title = el(doc, 'h2', { className: `${CLASS}-title`, attrs: { id: uniqueId(CLASS) } });
  const titleText = textNode(doc, title);
  const tools = el(doc, 'div', { className: `${CLASS}-tools` });
  const actionHost = el(doc, 'div', { className: `${CLASS}-actions` });
  const close = button(doc, { className: `${CLASS}-close`, label: 'Close', signal: life.signal,
    onClick: () => requestClose('button') });
  const description = el(doc, 'p', { className: `${CLASS}-description`,
    attrs: { id: uniqueId(CLASS), hidden: true } });
  const body = el(doc, 'div', { className: `${CLASS}-body` });
  tools.append(actionHost, close);
  header.append(title, tools);
  root.append(header, description, body);
  root.setAttribute('aria-labelledby', title.id);
  return { root, titleText, close, description, body, actionHost };
}

function writeModel(nodes, state, actions, model) {
  writeText(nodes.titleText, model.title ?? '');
  writeText(nodes.close.firstChild, model.closeLabel ?? 'Close');
  nodes.close.setAttribute('aria-label', String(model.closeLabel ?? 'Close'));
  const description = model.description ? String(model.description) : '';
  nodes.description.hidden = description === '';
  if (nodes.description.textContent !== description) nodes.description.textContent = description;
  if (description) nodes.root.setAttribute('aria-describedby', nodes.description.id);
  else nodes.root.removeAttribute('aria-describedby');
  nodes.root.setAttribute('aria-busy', String(Boolean(model.busy)));
  state.dismissible = model.dismissible !== false;
  if (Object.hasOwn(model, 'content') && nodes.body.firstChild !== model.content) {
    nodes.body.replaceChildren(...(model.content == null ? [] : [model.content]));
  }
  actions.update(model);
}

function hide(nodes, state) {
  const restore = nodes.root.contains(nodes.root.ownerDocument.activeElement);
  nodes.root.hidden = true;
  const previous = state.previous;
  state.previous = null;
  if (restore && previous?.isConnected && typeof previous.focus === 'function') previous.focus();
}

function show(nodes, state) {
  state.previous = nodes.root.ownerDocument.activeElement;
  nodes.root.hidden = false;
  (focusablesIn(nodes.body)[0] ?? nodes.root).focus();
}

function bindKeys(life, nodes, state, requestClose) {
  life.on(nodes.root, 'keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !state.open) return;
    event.preventDefault();
    event.stopPropagation();
    if (state.dismissible) requestClose('escape');
  });
}

/**
 * @param {HTMLElement} host
 * @param {{onClose?: (reason: 'button'|'escape') => void, onPin?: () => void,
 *   onExpand?: () => void}} [callbacks]
 * @returns {{update(model: {open?: boolean, title?: string, description?: string,
 *   content?: Node|null, pinned?: boolean, busy?: boolean, pinDisabled?: boolean,
 *   expandDisabled?: boolean, closeLabel?: string, dismissible?: boolean}): void,
 *   destroy(): void, body: HTMLElement}}
 */
export function createContextWindow(host, { onClose, onPin, onExpand } = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const state = { open: false, dismissible: true, previous: null };
  const requestClose = (reason) => { if (!life.dead && state.open) onClose?.(reason); };
  const nodes = windowNodes(doc, life, requestClose);
  const actions = createContextActions(nodes.actionHost, {
    onPin: () => { if (state.open) onPin?.(); },
    onExpand: () => { if (state.open) onExpand?.(); }
  });
  life.add(() => actions.destroy());
  host.append(nodes.root);
  bindKeys(life, nodes, state, requestClose);
  bindViewport(nodes.root, life);
  return {
    body: nodes.body,
    update(model = {}) {
      if (life.dead) return;
      if (!model.open && state.open) hide(nodes, state);
      writeModel(nodes, state, actions, model);
      if (model.open && !state.open) show(nodes, state);
      state.open = Boolean(model.open);
    },
    destroy() {
      if (life.dead) return;
      if (state.open) hide(nodes, state);
      state.open = false;
      life.destroy();
      nodes.root.remove();
    }
  };
}
