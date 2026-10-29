/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Voice input: one microphone button over `createVoiceDraft`.
 *
 *   const voice = createVoiceInput(host, { onApply: (text) => appendToDraft(text) });
 *   voice.update({ contextKey: conversationId, disabled: false });
 *
 * One tap asks once for consent (the browser's speech service may process
 * audio online), a second starts listening, and tapping again stops. With
 * `review: false` (the default) the words go straight to `onApply` - into a
 * draft the person still reads before sending. With `review: true` they wait in
 * an editable preview for Add or Discard. Consent is forgotten when the context
 * changes or the control is disabled. Without speech support the control
 * renders hidden: there is nothing honest to offer.
 */
import { button, createLife, documentOf, el, input, textNode, writeText } from './dom.js';
import { injectUiStyles } from './styles.js';
import { createVoiceDraft, VOICE_MAX_LENGTH } from './voice-draft.js';

const CLASS = 'cloudcanvas-ui-voice';

/** The control's default words. */
export const VOICE_LABELS = /* @__PURE__ */ Object.freeze({
  voice: 'Voice', stop: 'Stop', allow: 'Allow and start', decline: 'Not now', add: 'Add', discard: 'Discard',
  preview: 'Voice draft',
  consent: 'Voice uses your browser’s speech service, which may process audio online. Nothing is sent or saved until you choose to.'
});

function voiceNodes(doc, words) {
  const root = el(doc, 'div', { className: CLASS });
  const mic = button(doc, { className: `${CLASS}-mic`, label: words.voice, attrs: { 'aria-pressed': 'false' } });
  const consent = el(doc, 'div', { className: `${CLASS}-consent`, attrs: { hidden: true } });
  const consentText = el(doc, 'p', { className: `${CLASS}-consent-text`, text: words.consent });
  const allow = button(doc, { className: `${CLASS}-allow is-primary`, label: words.allow });
  const decline = button(doc, { className: `${CLASS}-decline`, label: words.decline });
  consent.append(consentText, allow, decline);
  const status = el(doc, 'p', { className: `${CLASS}-status`, attrs: { role: 'status' } });
  const statusText = textNode(doc, status);
  const review = el(doc, 'div', { className: `${CLASS}-review`, attrs: { hidden: true } });
  const preview = input(doc, { type: 'textarea', label: words.preview, className: `${CLASS}-preview` });
  preview.maxLength = VOICE_MAX_LENGTH;
  const add = button(doc, { className: `${CLASS}-add is-primary`, label: words.add });
  const discard = button(doc, { className: `${CLASS}-discard`, label: words.discard });
  review.append(preview, add, discard);
  root.append(mic, consent, status, review);
  return { root, mic, consent, allow, decline, statusText, review, preview, add, discard };
}

function render(nodes, state, words, view) {
  nodes.root.hidden = !state.supported;
  nodes.mic.disabled = state.disabled;
  nodes.mic.setAttribute('aria-pressed', String(state.listening));
  writeText(nodes.mic.firstChild, state.listening ? words.stop : words.voice);
  nodes.root.classList.toggle('is-listening', state.listening);
  nodes.consent.hidden = !view.asking || state.listening || state.disabled;
  const reviewing = view.review && !state.listening && state.text.trim() !== '';
  nodes.review.hidden = !reviewing;
  if (nodes.preview.value !== state.text) nodes.preview.value = state.text;
  nodes.add.disabled = state.disabled || !reviewing;
  writeText(nodes.statusText, state.message);
}

function bindVoice(life, nodes, controller, view) {
  life.on(nodes.mic, 'click', () => {
    if (controller.state.listening) { controller.stop(); return; }
    if (view.consented) { controller.start(true); return; }
    view.asking = true;
    view.rerender();
    nodes.allow.focus();
  });
  life.on(nodes.allow, 'click', () => {
    view.consented = true;
    view.asking = false;
    controller.start(true);
    nodes.mic.focus();
  });
  life.on(nodes.decline, 'click', () => {
    view.asking = false;
    view.rerender();
    nodes.mic.focus();
  });
  life.on(nodes.preview, 'input', () => controller.edit(nodes.preview.value));
  life.on(nodes.add, 'click', () => controller.apply());
  life.on(nodes.discard, 'click', () => controller.cancel());
}

function recognitionFactory(doc, createRecognition) {
  if (createRecognition) return createRecognition;
  const win = doc.defaultView ?? globalThis;
  const Recognition = win.SpeechRecognition ?? win.webkitSpeechRecognition;
  return Recognition ? () => new Recognition() : undefined;
}

/**
 * @param {HTMLElement} host
 * @param {{onApply?: (text: string) => void, createRecognition?: () => object, review?: boolean,
 *   labels?: Partial<typeof VOICE_LABELS>, messages?: object}} [options]
 * @returns {{update(model: {contextKey?: unknown, disabled?: boolean}): void, cancel(): void, destroy(): void}}
 */
export function createVoiceInput(host, { onApply, createRecognition, review = false, labels = {}, messages } = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const words = { ...VOICE_LABELS, ...labels };
  const nodes = voiceNodes(doc, words);
  host.append(nodes.root);
  const view = { review, consented: false, asking: false, contextKey: undefined, disabled: false, rerender: null };
  const controller = createVoiceDraft({
    onApply, messages, createRecognition: recognitionFactory(doc, createRecognition),
    onEnd: () => { if (!view.review) controller.apply(); }
  });
  view.rerender = () => render(nodes, controller.state, words, view);
  life.add(controller.subscribe((state) => render(nodes, state, words, view)));
  life.add(() => controller.destroy());
  bindVoice(life, nodes, controller, view);
  const win = doc.defaultView;
  if (win?.addEventListener) life.on(win, 'offline', () => controller.cancel());
  life.on(doc, 'visibilitychange', () => { if (doc.hidden) controller.cancel(); });
  return {
    update(model = {}) {
      if (life.dead) return;
      const disabled = model.disabled === true;
      if (model.contextKey !== view.contextKey || (disabled && !view.disabled)) {
        view.consented = false;
        view.asking = false;
      }
      view.contextKey = model.contextKey;
      view.disabled = disabled;
      controller.update({ contextKey: model.contextKey, disabled });
    },
    cancel() {
      if (!life.dead) controller.cancel();
    },
    destroy() {
      if (life.destroy()) nodes.root.remove();
    }
  };
}
