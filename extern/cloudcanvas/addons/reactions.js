/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * reactions: "when blit A emits X, run action Y on blit B". A binding names two
 * blits by id, so it belongs to neither: it lives in the root's store
 * (`reactionsOf(app)`), and the root trait runs it from the native events that
 * bubble to the host - the one event surface every add-on already emits on.
 *
 *   blit.use({ reactions });
 *   app.set({ reactions: true });
 *   reactionsOf(app).add({ source: 'button', signal: 'press',
 *     action: { type: 'notify', target: 'panel', params: { message: 'Hi' } } });
 *
 * A signal is an event type (`SIGNALS`); `press` is the native `click`, so a
 * keyboard activation counts, and `select` fires on selection only. The source
 * is the innermost blit the event came from. A binding whose target is gone is skipped, never thrown, and
 * `prune` drops every binding naming a blit that is no longer there; an action
 * that throws is contained to its own binding. Actions: `./actions.js`.
 */
import { stateOf } from '../core/state.js';
import { createLogger } from '../log.js';
import { actionRegistry, builtinActions } from './actions.js';
import { listen, requireRootOf } from './trait.js';

export { ActionRegistry, PARAM_CONTROLS, actionRegistry, builtinActions, toast } from './actions.js';

const logger = /* @__PURE__ */ createLogger('reactions');

/** The signals a binding can fire on, in the order an editor offers them. */
export const SIGNALS = /* @__PURE__ */ Object.freeze([
  'press', 'select', 'drag:start', 'drag:end', 'resize:start', 'resize:end', 'edit', 'action', 'focus:change'
]);

/** A signal the native event it is heard as, when they differ. */
const NATIVE = /* @__PURE__ */ Object.freeze({ press: 'click' });

const SIGNAL_SET = /* @__PURE__ */ new Set(SIGNALS);

/** A short, collision-unlikely binding id. */
function freshId() {
  return `rx_${Math.random().toString(36).slice(2, 10)}`;
}

/** The bindings of one root: validated on the way in, looked up by source and signal. */
export class ReactionStore {
  constructor(registry = actionRegistry) {
    this.registry = registry;
    /** @type {Map<string, object>} id -> binding, in insertion order */
    this._bindings = new Map();
  }

  /**
   * Add a binding. @param {{id?: string, source: string, signal: string,
   *   action: {type: string, target: string, params?: object}}} binding
   * @returns {object} the stored, normalised binding
   * @throws {TypeError} on a missing end, an unknown signal or action, or invalid params
   */
  add(binding) {
    const { id, source, signal, action = {} } = binding && typeof binding === 'object' ? binding : {};
    if (typeof source !== 'string' || source === '') throw new TypeError('reactions.add: a source is required');
    if (!SIGNAL_SET.has(signal)) throw new TypeError(`reactions.add: "${signal}" is not a signal`);
    if (typeof action?.target !== 'string' || action.target === '') throw new TypeError('reactions.add: an action.target is required');
    const result = this.registry.validate(action.type, action.params);
    if (!result.valid) throw new TypeError(`reactions.add: ${result.error}`);
    const stored = {
      id: typeof id === 'string' && id ? id : freshId(),
      source,
      signal,
      action: { type: action.type, target: action.target, params: result.params }
    };
    this._bindings.set(stored.id, stored);
    return stored;
  }

  remove(id) { return this._bindings.delete(id); }

  get(id) { return this._bindings.get(id); }

  /** Every binding, in insertion order. */
  all() { return Array.from(this._bindings.values()); }

  /** The bindings a blit fires, whatever the signal. */
  forSource(id) { return this.all().filter((binding) => binding.source === id); }

  /** The bindings one signal on one blit runs. */
  matching(id, signal) { return this.all().filter((binding) => binding.source === id && binding.signal === signal); }

  /** Whether any binding names `id` at either end. */
  references(id) { return this.all().some((binding) => binding.source === id || binding.action.target === id); }

  /** Drop every binding with an end `exists(id)` denies. @returns {number} how many went */
  prune(exists) {
    let removed = 0;
    for (const [id, binding] of this._bindings) {
      if (exists(binding.source) && exists(binding.action.target)) continue;
      this._bindings.delete(id);
      removed += 1;
    }
    return removed;
  }

  clear() { this._bindings.clear(); }

  /** Every binding as a plain, JSON-safe object: the save format's own shape. */
  toJSON() {
    return this.all().map(({ id, source, signal, action }) => ({
      id, source, signal, action: { type: action.type, target: action.target, params: { ...action.params } }
    }));
  }

  /**
   * Replace the contents from a saved list: a replace, not a merge. A binding that
   * fails validation, or (given `exists`) names a blit that is not there, is
   * skipped with a warning. @returns {string[]} the warnings
   */
  load(list, { exists, warn } = {}) {
    this.clear();
    const warnings = [];
    const skip = (message) => { warnings.push(message); warn?.(message); };
    for (const raw of Array.isArray(list) ? list : []) {
      const gone = exists ? [raw?.source, raw?.action?.target].find((id) => id && !exists(id)) : undefined;
      if (gone) { skip(`reaction skipped: blit "${gone}" is gone`); continue; }
      try {
        this.add(raw);
      } catch (error) {
        skip(`reaction skipped: ${error.message}`);
      }
    }
    return warnings;
  }
}

/** @type {WeakMap<Element, ReactionStore>} host -> its store */
const STORES = /* @__PURE__ */ new WeakMap();

/** A root's store, made on first ask: the one the trait, an editor and the serializer all share. */
export function reactionsOf(app) {
  let store = STORES.get(app.el);
  if (!store) {
    store = new ReactionStore();
    STORES.set(app.el, store);
  }
  return store;
}

/** The blit an event came from: the emitter of a blit event, else the innermost blit under the target. */
function sourceOf(event) {
  const emitted = event.detail?.source;
  if (emitted?.el) return emitted;
  const element = event.target?.closest?.('[data-blit]');
  return element ? stateOf(element)?.handle ?? null : null;
}

/** Run one binding against its target, if the target still resolves; a throw stays in its binding. */
function run(app, store, binding, source, event) {
  const target = app.find(binding.action.target);
  if (!target) return;
  try {
    store.registry.run(binding.action.type, target, binding.action.params, { app, source, target, event });
  } catch (error) {
    logger.error(`reaction "${binding.id}" (${binding.action.type}) failed`, error);
  }
}

/** The named root trait: one listener per signal on the host runs what each fires. */
export function reactions(app, _options, root) {
  requireRootOf(app, root, 'reactions');
  const store = reactionsOf(app);
  if (store.registry === actionRegistry) builtinActions();
  const offs = SIGNALS.map((signal) => listen(app.el, [NATIVE[signal] ?? signal], (event) => {
    if (signal === 'select' && event.detail?.payload === false) return;
    const source = sourceOf(event);
    if (!source || source === app || !source.el.id) return;
    for (const binding of store.matching(source.el.id, signal)) run(app, store, binding, source, event);
  }));
  return () => { for (const off of offs) off(); };
}
