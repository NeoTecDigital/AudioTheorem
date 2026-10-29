/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * lazy: children on demand. A lazy blit declares none of its own; the first time
 * it is needed - promoted to the view root, focused, or `load(b)` - the provider
 * returns specs and each becomes a child through `b.blit(spec)`.
 *
 *   blit.use({ lazy: lazyChildren((b) => fetch(`/tree/${b.el.id}`).then((r) => r.json())) });
 *   app.blit({ id: 'folder', lazy: true });
 *
 * Single-flight (concurrent triggers share one promise), run-once (until
 * `unload`), failure-safe (a rejection emits `children:error` and re-arms) and
 * removal-safe (specs that resolve after the blit left its root are dropped).
 * A load emits `children:load`, payload the new children.
 */
import { heldRootOf } from '../core/root.js';

/** Emitted on the blit when its provider rejected; `payload.error` is the reason. */
export const CHILDREN_ERROR_EVENT = 'children:error';

/** Emitted on the blit once its children are made; the payload is the new blits. */
export const CHILDREN_LOAD_EVENT = 'children:load';

/** @type {WeakMap<Element, Function>} element -> its provider, while the trait runs */
const PROVIDERS = /* @__PURE__ */ new WeakMap();

/** @type {WeakMap<Element, {flight: Promise|null, loaded: boolean}>} element -> its load record */
const LOADS = /* @__PURE__ */ new WeakMap();

/** A trait that loads a blit's children from `provider(b)` (specs, or a promise of them) when it is needed. */
export function lazyChildren(provider) {
  if (typeof provider !== 'function') throw new TypeError('lazyChildren: expected a provider function');
  return (b, _options, root) => {
    PROVIDERS.set(b.el, provider);
    const onFocus = (event) => { if (event.detail?.source === b && event.detail.payload) load(b); };
    const onView = (event) => { if (event.detail?.payload?.root === b) load(b); };
    b.el.addEventListener('focus:change', onFocus);
    root?.host.addEventListener('view:change', onView);
    return () => {
      PROVIDERS.delete(b.el);
      b.el.removeEventListener('focus:change', onFocus);
      root?.host.removeEventListener('view:change', onView);
    };
  };
}

/** Make the children from resolved specs, unless the blit left its root meanwhile. */
function adopt(b, record, specs) {
  record.flight = null;
  if (!heldRootOf(b.el)) return [];
  record.loaded = true;
  const made = (Array.isArray(specs) ? specs : []).filter((spec) => spec && typeof spec === 'object').map((spec) => b.blit(spec));
  b.emit(CHILDREN_LOAD_EVENT, made);
  return made;
}

/** Load `b`'s children once. @returns {Promise<object[]>} the blits made (a loaded blit: its children) */
export function load(b) {
  const provider = PROVIDERS.get(b.el);
  let record = LOADS.get(b.el);
  if (record?.loaded) return Promise.resolve(b.blits);
  if (record?.flight) return record.flight;
  if (!provider) return Promise.resolve([]);

  record ??= { flight: null, loaded: false };
  LOADS.set(b.el, record);
  record.flight = Promise.resolve()
    .then(() => provider(b))
    .then((specs) => adopt(b, record, specs), (error) => {
      record.flight = null;
      if (heldRootOf(b.el)) b.emit(CHILDREN_ERROR_EVENT, { error });
      return [];
    });
  return record.flight;
}

/** Whether `b`'s children have been loaded. */
export function isLoaded(b) {
  return Boolean(LOADS.get(b.el)?.loaded);
}

/** Remove the loaded children and re-arm the provider. */
export function unload(b) {
  for (const child of b.blits) child.remove();
  LOADS.delete(b.el);
}
