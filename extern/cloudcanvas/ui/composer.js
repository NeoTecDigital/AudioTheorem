/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Composer: a text draft with Submit, Cancel and optional voice.
 *
 *   const composer = createComposer(host, { onSubmit: (text) => send(text), voice: true });
 *   composer.update({ label: 'Message', placeholder: 'Write a message', contextKey: threadId });
 *
 * THE COMPOSER OWNS ITS DRAFT, so what is on screen is what is sent:
 *   - Submit (or Ctrl/Cmd+Enter) sends the trimmed text and refuses an empty or
 *     blank draft; the button stays disabled until there is something to send.
 *   - `onSubmit` may return a promise: the composer is pending until it settles,
 *     clears on success, and keeps the draft on `false` or a rejection (which
 *     goes to `onError`, or the platform's `reportError`).
 *   - Cancel clears the draft (and any voice in progress), then calls `onCancel`.
 *     While a send is pending - the model's `pending`, or a promise `onSubmit`
 *     returned - Cancel is disabled and clears nothing: text in flight is not
 *     Cancel's to take, so a send that fails still has its draft.
 *   - `update({ text })` writes the draft only when the model's text changes, so a
 *     re-render never overwrites typing; a new `contextKey` resets the draft to
 *     `text` (or empty) so one conversation's draft never shows in another.
 * `onChange(text)` reports every edit, including the clear.
 */
import { button, createLife, documentOf, el, input, writeText } from './dom.js';
import { injectUiStyles } from './styles.js';
import { createVoiceInput } from './voice.js';

const CLASS = 'cloudcanvas-ui-composer';

function composerNodes(doc, maxLength) {
  const root = el(doc, 'div', { className: CLASS });
  const field = input(doc, { type: 'textarea', label: 'Compose', className: `${CLASS}-input` });
  field.maxLength = maxLength;
  const actions = el(doc, 'div', { className: `${CLASS}-actions` });
  const voiceSlot = el(doc, 'div', { className: `${CLASS}-voice` });
  const cancel = button(doc, { className: `${CLASS}-cancel`, label: 'Cancel' });
  const submit = button(doc, { className: `${CLASS}-submit is-primary`, label: 'Send' });
  actions.append(voiceSlot, cancel, submit);
  root.append(field, actions);
  return { root, field, voiceSlot, cancel, submit };
}

function paint(nodes, state) {
  const blocked = state.disabled || state.pending || state.inFlight;
  nodes.field.disabled = state.disabled;
  nodes.field.readOnly = state.pending || state.inFlight;
  nodes.submit.disabled = blocked || nodes.field.value.trim() === '';
  nodes.cancel.disabled = blocked;
  nodes.root.classList.toggle('is-pending', state.pending || state.inFlight);
  state.voice?.update({ contextKey: state.contextKey, disabled: blocked });
}

function settle(nodes, state, api, outcome) {
  state.inFlight = false;
  if (outcome.ok && outcome.value !== false) api.clear();
  else paint(nodes, state);
  if (!outcome.ok) (state.onError ?? globalThis.reportError ?? console.error)(outcome.error);
}

function submit(nodes, state, api) {
  const text = nodes.field.value.trim();
  if (text === '' || state.disabled || state.pending || state.inFlight || state.composing) return;
  let result;
  try {
    result = state.onSubmit?.(text);
  } catch (error) {
    settle(nodes, state, api, { ok: false, error });
    return;
  }
  if (typeof result?.then !== 'function') {
    settle(nodes, state, api, { ok: true, value: result });
    return;
  }
  state.inFlight = true;
  paint(nodes, state);
  result.then((value) => { if (!state.life.dead) settle(nodes, state, api, { ok: true, value }); },
    (error) => { if (!state.life.dead) settle(nodes, state, api, { ok: false, error }); });
}

function bindComposer(life, nodes, state, api) {
  life.on(nodes.field, 'input', () => { paint(nodes, state); state.onChange?.(nodes.field.value); });
  life.on(nodes.field, 'compositionstart', () => { state.composing = true; });
  life.on(nodes.field, 'compositionend', () => { state.composing = false; });
  life.on(nodes.field, 'keydown', (event) => {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.isComposing) return;
    event.preventDefault();
    submit(nodes, state, api);
  });
  life.on(nodes.submit, 'click', () => submit(nodes, state, api));
  life.on(nodes.cancel, 'click', () => {
    if (state.disabled || state.pending || state.inFlight) return;
    api.clear();
    state.onCancel?.();
  });
}

function mountVoice(nodes, state, voice) {
  if (!voice) return null;
  const options = voice === true ? {} : voice;
  return createVoiceInput(nodes.voiceSlot, { ...options, onApply: (text) => {
    if (state.life.dead || state.disabled || state.pending || state.inFlight) return;
    const current = nodes.field.value.trimEnd();
    nodes.field.value = current ? `${current}\n${text}` : text;
    paint(nodes, state);
    state.onChange?.(nodes.field.value);
  } });
}

function writeModel(nodes, state, model) {
  if (model.contextKey !== state.contextKey) {
    state.contextKey = model.contextKey;
    nodes.field.value = String(model.text ?? '');
    state.lastText = model.text;
  } else if (Object.hasOwn(model, 'text') && model.text !== state.lastText) {
    nodes.field.value = String(model.text ?? '');
    state.lastText = model.text;
  }
  state.pending = model.pending === true;
  state.disabled = model.disabled === true;
  nodes.field.setAttribute('aria-label', String(model.label ?? 'Compose'));
  nodes.field.placeholder = String(model.placeholder ?? '');
  writeText(nodes.submit.firstChild, model.submitLabel ?? 'Send');
  writeText(nodes.cancel.firstChild, model.cancelLabel ?? 'Cancel');
  nodes.cancel.hidden = model.showCancel === false;
}

/**
 * @param {HTMLElement} host
 * @param {{onChange?: (text: string) => void, onSubmit?: (text: string) => unknown, onCancel?: () => void,
 *   onError?: (error: unknown) => void, voice?: boolean|object, maxLength?: number}} [options]
 * @returns {{update(model: object): void, clear(): void, focus(): void, destroy(): void}}
 */
export function createComposer(host, options = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const nodes = composerNodes(doc, options.maxLength ?? 16000);
  host.append(nodes.root);
  const state = { life, onChange: options.onChange, onSubmit: options.onSubmit, onCancel: options.onCancel,
    onError: options.onError, pending: false, disabled: false, inFlight: false, composing: false,
    contextKey: undefined, lastText: undefined, voice: null };
  const api = {
    update(model = {}) {
      if (life.dead) return;
      writeModel(nodes, state, model);
      paint(nodes, state);
    },
    clear() {
      if (life.dead) return;
      nodes.field.value = '';
      state.voice?.cancel();
      paint(nodes, state);
      state.onChange?.('');
    },
    focus() { if (!life.dead) nodes.field.focus(); },
    destroy() {
      if (life.destroy()) nodes.root.remove();
    }
  };
  state.voice = mountVoice(nodes, state, options.voice);
  if (state.voice) life.add(() => state.voice.destroy());
  bindComposer(life, nodes, state, api);
  paint(nodes, state);
  return api;
}
