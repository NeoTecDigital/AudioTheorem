/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Voice draft: the Web Speech API as an optional text source, never a command.
 *
 * A pure controller over a recognition device (`createRecognition()` returns
 * something shaped like `SpeechRecognition`). It listens only after consent,
 * collects one utterance, lets the words be edited, and hands text to
 * `onApply` only when asked. A stale device (the context changed, the control
 * was disabled or destroyed) is detached and its late results are ignored.
 */

/** The longest transcript kept, in characters. */
export const VOICE_MAX_LENGTH = 16000;

/** The default messages; every one is overridable through `messages`. */
export const VOICE_MESSAGES = /* @__PURE__ */ Object.freeze({
  listening: 'Listening. Stop when you are done.',
  denied: 'Voice input is unavailable or was denied. You can still type.',
  failed: 'Voice input could not start. You can still type.'
});

function detach(owner) {
  const device = owner.device;
  owner.device = null;
  owner.sequence += 1;
  if (!device) return;
  device.onresult = null;
  device.onerror = null;
  device.onend = null;
  try {
    device.abort();
  } catch {
    // The browser already stopped this device; there is nothing left to abort.
  }
}

function wire(owner, device, sequence) {
  const current = () => !owner.dead && sequence === owner.sequence && !owner.disabled;
  device.continuous = false;
  device.interimResults = true;
  device.maxAlternatives = 1;
  device.onresult = (event) => {
    if (!current()) return;
    owner.text = Array.from(event.results).map((result) => result[0]?.transcript ?? '').join(' ').slice(0, VOICE_MAX_LENGTH);
    owner.emit();
  };
  device.onend = () => {
    if (!current()) return;
    owner.listening = false;
    owner.emit();
    owner.onEnd?.();
  };
  device.onerror = () => {
    if (!current()) return;
    detach(owner);
    owner.listening = false;
    owner.message = owner.messages.denied;
    owner.emit();
  };
}

function start(owner, consent) {
  if (!consent || owner.dead || owner.disabled || owner.listening || !owner.createRecognition) return;
  detach(owner);
  const sequence = owner.sequence;
  owner.text = '';
  owner.message = owner.messages.listening;
  owner.listening = true;
  try {
    const device = owner.createRecognition();
    owner.device = device;
    wire(owner, device, sequence);
    device.start();
  } catch {
    detach(owner);
    owner.listening = false;
    owner.message = owner.messages.failed;
  }
  owner.emit();
}

/** A new context, or being disabled, drops whatever was heard. */
function update(owner, { contextKey, disabled = false } = {}, cancel) {
  if (owner.dead) return;
  const reset = contextKey !== owner.contextKey || (disabled && !owner.disabled);
  owner.contextKey = contextKey;
  owner.disabled = disabled;
  if (reset) cancel();
  else owner.emit();
}

/**
 * @param {{createRecognition?: () => object, onApply?: (text: string) => void,
 *   onEnd?: () => void, messages?: Partial<typeof VOICE_MESSAGES>}} [options]
 */
export function createVoiceDraft({ createRecognition, onApply, onEnd, messages = {} } = {}) {
  const listeners = new Set();
  const owner = { createRecognition, onEnd, device: null, sequence: 0, dead: false, disabled: false,
    listening: false, text: '', message: '', messages: { ...VOICE_MESSAGES, ...messages } };
  const snapshot = () => ({ supported: Boolean(createRecognition), listening: owner.listening, text: owner.text,
    message: owner.message, disabled: owner.disabled });
  owner.emit = () => { if (!owner.dead) for (const listener of listeners) listener(snapshot()); };
  const cancel = () => {
    detach(owner);
    owner.listening = false;
    owner.text = '';
    owner.message = '';
    owner.emit();
  };
  return {
    get state() { return snapshot(); },
    start: (consent) => start(owner, consent),
    stop() { try { owner.device?.stop(); } catch { cancel(); } },
    edit(text) {
      if (owner.dead || owner.disabled || owner.listening) return;
      owner.text = String(text).slice(0, VOICE_MAX_LENGTH);
      owner.emit();
    },
    apply() {
      if (owner.dead || owner.disabled || owner.listening || !owner.text.trim()) return;
      const text = owner.text.trim();
      cancel();
      onApply?.(text);
    },
    update: (model) => update(owner, model, cancel),
    cancel,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    destroy() {
      if (owner.dead) return;
      owner.dead = true;
      detach(owner);
      owner.text = '';
      listeners.clear();
    }
  };
}
