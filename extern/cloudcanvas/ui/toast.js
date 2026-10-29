/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Toasts: short-lived notices with at most two actions.
 *
 *   const toaster = createToaster(host, { onAction: (toastId, actionId) => answer(toastId, actionId) });
 *   toaster.show({ message: 'Note deleted', action: { label: 'Undo', run: restore } });
 *   toaster.show({ message: 'Stand-up in five minutes', actions: [{ id: 'snooze', label: 'Snooze' }, { id: 'open', label: 'Open' }] });
 *
 * A toast is `role="status"` (a `danger` one is `role="alert"`) inside one
 * labelled region, so it is read out without taking focus. It leaves after
 * `timeout` ms (6000 by default, 0 keeps it), and the countdown pauses while the
 * pointer rests on it or focus is inside it, so an Undo is never snatched away
 * mid-reach. Escape closes the focused toast. Beyond `max` the oldest toast goes.
 *
 * TWO WAYS TO NAME AN ACTION, never both on one toast. `action: {label, run}`
 * is the Undo shape: one button that runs its own function. `actions` is a
 * list of `{id, label}`, two at most, reported through the toaster's
 * `onAction(toastId, actionId)` - one handler for every toast. Either way an
 * action is taken once and closes its toast.
 *
 * ONE REGION OF A NAME IN A DOCUMENT, however many toasters name it. The first
 * toaster to name a region makes it, in its own host; a later one of the same
 * name shows its toasts there too, each with an id no other toast in it has;
 * the last of them to be destroyed removes it. A region is a landmark, and two
 * of one name cannot be told apart. A region that left the page with the host
 * it was made in comes to the host of the toaster that shows next.
 *
 * WHERE THE REGION SITS is the sheet's: along the bottom, held off each edge by
 * a token of its own (`--cc-ui-toast-inset-bottom`, `-left`, `-right`), so a
 * host keeps it clear of a bar or a button it floats there.
 */
import { button, createLife, documentOf, el, uniqueItems } from './dom.js';
import { injectUiStyles } from './styles.js';

const CLASS = 'cloudcanvas-ui-toast';
const TONES = /* @__PURE__ */ new Set(['info', 'success', 'warning', 'danger']);

/** The least time a resumed countdown gets, so a toast never vanishes on pointer-out. */
const RESUME_FLOOR_MS = 1500;

/** The most actions one toast offers. */
const MAX_ACTIONS = 2;

/** The regions in use, by document and then by name: `{node, holders, count}`. */
const REGIONS = /* @__PURE__ */ new WeakMap();

/**
 * The one region named `label` in `doc`, for one more toaster: made in `host` when no toaster holds one of that name
 * yet. `holders` is how many toasters share it, and `count` the toasts it has been given, which is what numbers them.
 */
function holdRegion(doc, host, label) {
  const named = REGIONS.get(doc) ?? new Map();
  REGIONS.set(doc, named);
  const region = named.get(label) ?? { node: el(doc, 'section', { className: `${CLASS}s`, attrs: { 'aria-label': label } }), holders: 0, count: 0 };
  named.set(label, region);
  region.holders += 1;
  if (!region.node.isConnected) host.append(region.node);
  return region;
}

/** One toaster fewer holds `region`: the last takes it off the page, and its name is free again. */
function releaseRegion(doc, label, region) {
  region.holders -= 1;
  if (region.holders > 0) return;
  region.node.remove();
  REGIONS.get(doc).delete(label);
}

/** A toast's nodes: its message, a button for each action, and the dismiss control. `on.take` answers an action, `on.close` the dismiss. */
function toastNode(doc, life, entry, labels, on) {
  const node = el(doc, 'div', { className: CLASS, attrs: {
    role: entry.tone === 'danger' ? 'alert' : 'status', 'data-tone': entry.tone, 'data-ui-id': entry.id
  } });
  node.append(el(doc, 'span', { className: `${CLASS}-message`, text: entry.message }));
  for (const action of entry.actions) {
    node.append(button(doc, { className: `${CLASS}-action`, label: action.label, signal: life.signal, attrs: { 'data-ui-action': action.id },
      onClick: () => on.take(entry.id, action) }));
  }
  node.append(button(doc, { className: `${CLASS}-dismiss`, label: '×', ariaLabel: labels.dismiss,
    signal: life.signal, onClick: () => on.close(entry.id, 'dismiss') }));
  return node;
}

/** The Undo shape as the one action it is: a label and the function it runs. It names no id, and is reported to no one else. */
function ownAction(action) {
  if (typeof action.run !== 'function' || !String(action.label ?? '').trim()) {
    throw new TypeError('A toast action needs a label and a run function');
  }
  return [{ id: null, label: String(action.label), run: action.run }];
}

/**
 * A toast's actions, checked before anything is shown, each as the label it
 * shows and what a press on it runs: the one `action`, or the listed
 * `actions`, which report through `onAction`.
 * @throws {TypeError} both forms at once, more than two, a repeated or missing id, a blank label
 */
function actionsOf(options, id, onAction) {
  if (options.action && options.actions) throw new TypeError('A toast takes action or actions, not both');
  if (options.action) return ownAction(options.action);
  const listed = uniqueItems(options.actions ?? [], 'toast action');
  if (listed.length > MAX_ACTIONS) throw new TypeError('A toast takes at most two actions');
  return listed.map((action) => {
    if (!String(action.label ?? '').trim()) throw new TypeError(`The toast action ${action.id} needs a label`);
    return { id: action.id, label: String(action.label), run: () => onAction?.(id, action.id) };
  });
}

function validEntry(options, id, fallbackTimeout, onAction) {
  const message = String(options?.message ?? '').trim();
  if (message === '') throw new TypeError('A toast needs a message');
  const tone = TONES.has(options.tone) ? options.tone : 'info';
  const timeout = Number.isFinite(options.timeout) && options.timeout >= 0 ? options.timeout : fallbackTimeout;
  return { id, message, tone, actions: actionsOf(options, id, onAction), timeout };
}

function armTimer(life, entry, close) {
  entry.cancel?.();
  entry.cancel = null;
  if (entry.timeout === 0 || entry.paused) return;
  const wait = Math.max(entry.remaining ?? entry.timeout, entry.remaining === undefined ? 0 : RESUME_FLOOR_MS);
  entry.deadline = Date.now() + wait;
  entry.cancel = life.later(() => close(entry.id, 'timeout'), wait);
}

function bindPause(life, node, entry, close) {
  const pause = () => {
    if (entry.paused) return;
    entry.paused = true;
    if (entry.deadline) entry.remaining = Math.max(0, entry.deadline - Date.now());
    entry.cancel?.();
    entry.cancel = null;
  };
  const resume = () => {
    if (!entry.paused || node.matches(':hover') || node.contains(node.ownerDocument.activeElement)) return;
    entry.paused = false;
    armTimer(life, entry, close);
  };
  life.on(node, 'pointerenter', pause);
  life.on(node, 'focusin', pause);
  life.on(node, 'pointerleave', resume);
  life.on(node, 'focusout', () => queueMicrotask(resume));
  life.on(node, 'keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(entry.id, 'escape'); }
  });
}

/**
 * @param {HTMLElement} host
 * @param {{max?: number, timeout?: number, labels?: {region?: string, dismiss?: string},
 *   onAction?: (toastId: string, actionId: string) => void,
 *   onClose?: (toastId: string, reason: 'dismiss'|'timeout'|'escape'|'action'|'max'|'api'|'clear') => void}} [options] `onClose` hears every toast that leaves, once, and why (a destroyed toaster reports none); `onAction` hears every action a toast lists in `actions`
 * @returns {{show(options: {message: string, tone?: 'info'|'success'|'warning'|'danger', timeout?: number,
 *   action?: {label: string, run: () => void}, actions?: Array<{id: string, label: string}>}): string,
 *   dismiss(id: string): boolean, clear(): void, destroy(): void}}
 */
export function createToaster(host, { max = 3, timeout = 6000, labels = {}, onAction, onClose } = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const words = { region: labels.region ?? 'Notifications', dismiss: labels.dismiss ?? 'Dismiss' };
  const region = holdRegion(doc, host, words.region);
  const entries = new Map();
  const close = (id, reason = 'api') => {
    const entry = entries.get(id);
    if (!entry) return false;
    entry.cancel?.();
    entries.delete(id);
    entry.node.remove();
    onClose?.(id, reason);
    return true;
  };
  // An action is taken once: it closes its toast whatever it does, and a toast that has gone takes none.
  const take = (id, action) => {
    if (!entries.has(id)) return;
    try { action.run(); } finally { close(id, 'action'); }
  };
  return {
    show(options) {
      if (life.dead) return null;
      const entry = validEntry(options, `toast-${region.count + 1}`, timeout, onAction);
      region.count += 1;
      entry.node = toastNode(doc, life, entry, words, { close, take });
      entries.set(entry.id, entry);
      if (!region.node.isConnected) host.append(region.node);
      region.node.append(entry.node);
      bindPause(life, entry.node, entry, close);
      armTimer(life, entry, close);
      while (entries.size > Math.max(1, max)) close(entries.keys().next().value, 'max');
      return entry.id;
    },
    dismiss: (id) => close(id, 'api'),
    clear() { for (const id of [...entries.keys()]) close(id, 'clear'); },
    destroy() {
      if (!life.destroy()) return;
      for (const entry of entries.values()) entry.node.remove();
      entries.clear();
      releaseRegion(doc, words.region, region);
    }
  };
}
