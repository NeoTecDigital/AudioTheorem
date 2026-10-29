/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Dialog: a native `<dialog>` driven by a model.
 *
 *   const dialog = createDialog(host, { onClose: (reason) => setOpen(false) });
 *   dialog.update({ open: true, title: 'Rename', content: form });
 *
 * CONTROLLED. The dialog never closes itself: Escape, the backdrop and the
 * Close button each call `onClose(reason)` ('escape' | 'backdrop' | 'button'),
 * and the caller answers with `update({ open: false })`. `dismissible: false`
 * silences Escape and the backdrop (a save in flight) but keeps the button.
 * `closeButton: false` draws no Close button, for a dialog with a way out of its
 * own (a confirmation's Cancel); Escape and the backdrop still ask to close it.
 *
 * NATIVE FIRST. `showModal()` puts the dialog in the top layer and makes the
 * rest of the page inert, so a screen reader and a pointer both stay inside;
 * Tab additionally wraps at the edges. Keys are heard on the dialog itself, not
 * the document, so of two stacked dialogs only the focused one answers Escape.
 * Focus returns to whatever held it before the dialog opened.
 */
import { button, createLife, documentOf, el, focusablesIn, textNode, uniqueId, writeText } from './dom.js';
import { injectUiStyles } from './styles.js';

const CLASS = 'cloudcanvas-ui-dialog';

function dialogNodes(doc, life, requestClose) {
  const root = el(doc, 'dialog', { className: CLASS });
  const panel = el(doc, 'div', { className: `${CLASS}-panel`, attrs: { tabindex: '-1' } });
  const header = el(doc, 'div', { className: `${CLASS}-header` });
  const title = el(doc, 'h2', { className: `${CLASS}-title`, attrs: { id: uniqueId(CLASS) } });
  const titleText = textNode(doc, title);
  const close = button(doc, { className: `${CLASS}-close`, label: 'Close', signal: life.signal,
    onClick: () => requestClose('button') });
  const description = el(doc, 'p', { className: `${CLASS}-description`, attrs: { id: uniqueId(CLASS), hidden: true } });
  const body = el(doc, 'div', { className: `${CLASS}-body` });
  header.append(title, close);
  panel.append(header, description, body);
  root.append(panel);
  root.setAttribute('aria-labelledby', title.id);
  return { root, panel, title, titleText, close, description, body };
}

/** Tab past the last focusable wraps to the first, and Shift+Tab the other way. */
function wrapTab(event, nodes) {
  const items = focusablesIn(nodes.panel);
  if (items.length === 0) {
    event.preventDefault();
    nodes.panel.focus();
    return;
  }
  const active = nodes.root.ownerDocument.activeElement;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && (active === first || !nodes.panel.contains(active) || active === nodes.panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !nodes.panel.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function bindKeys(life, nodes, state, requestClose) {
  life.on(nodes.root, 'keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      state.escapeHandled = true;
      queueMicrotask(() => { state.escapeHandled = false; });
      if (state.dismissible) requestClose('escape');
    } else if (event.key === 'Tab' && state.modal) {
      wrapTab(event, nodes);
    }
  });
  // A platform close request (Escape where keydown was not ours) is refused; the caller decides.
  life.on(nodes.root, 'cancel', (event) => {
    event.preventDefault();
    if (!state.escapeHandled && state.dismissible) requestClose('escape');
  });
  life.on(nodes.root, 'click', (event) => {
    if (event.target === nodes.root && state.dismissible) requestClose('backdrop');
  });
}

function writeModel(nodes, state, model) {
  writeText(nodes.titleText, model.title ?? '');
  nodes.close.hidden = model.closeButton === false;
  nodes.close.setAttribute('aria-label', String(model.closeLabel ?? 'Close'));
  writeText(nodes.close.firstChild, model.closeLabel ?? 'Close');
  const description = model.description ? String(model.description) : '';
  nodes.description.hidden = description === '';
  nodes.description.textContent = description;
  if (description) nodes.root.setAttribute('aria-describedby', nodes.description.id);
  else nodes.root.removeAttribute('aria-describedby');
  state.dismissible = model.dismissible !== false;
  state.modal = model.modal !== false;
  if (model.content && nodes.body.firstChild !== model.content) nodes.body.replaceChildren(model.content);
}

function show(host, nodes, state) {
  const doc = nodes.root.ownerDocument;
  state.previous = doc.activeElement;
  if (!nodes.root.isConnected) host.append(nodes.root);
  if (state.modal && typeof nodes.root.showModal === 'function') nodes.root.showModal();
  else if (typeof nodes.root.show === 'function') nodes.root.show();
  else nodes.root.setAttribute('open', '');
  nodes.root.classList.toggle('is-modal', state.modal);
  const first = focusablesIn(nodes.body)[0] ?? nodes.panel;
  first.focus();
}

function hide(nodes, state) {
  if (typeof nodes.root.close === 'function' && nodes.root.open) nodes.root.close();
  nodes.root.removeAttribute('open');
  const previous = state.previous;
  state.previous = null;
  if (previous?.isConnected && typeof previous.focus === 'function') previous.focus();
}

/**
 * @param {HTMLElement} host where the `<dialog>` element is appended
 * @param {{onClose?: (reason: 'escape'|'backdrop'|'button') => void}} [callbacks]
 * @returns {{update(model: object): void, destroy(): void, body: HTMLElement}}
 */
export function createDialog(host, { onClose } = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const state = { open: false, modal: true, dismissible: true, previous: null, escapeHandled: false };
  const requestClose = (reason) => { if (!life.dead && state.open) onClose?.(reason); };
  const nodes = dialogNodes(doc, life, requestClose);
  bindKeys(life, nodes, state, requestClose);
  return {
    body: nodes.body,
    update(model = {}) {
      if (life.dead) return;
      writeModel(nodes, state, model);
      if (model.open && !state.open) show(host, nodes, state);
      else if (!model.open && state.open) hide(nodes, state);
      state.open = Boolean(model.open);
    },
    destroy() {
      if (!life.destroy()) return;
      if (state.open) hide(nodes, state);
      state.open = false;
      nodes.root.remove();
    }
  };
}
