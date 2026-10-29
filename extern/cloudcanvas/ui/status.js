/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Status: one truthful line about a region's state, read out politely (or
 * assertively for an error), with a Retry that exists only when it can work.
 *
 *   const status = createStatus(host);
 *   status.update({ status: 'error', message: 'Could not load.', retry: load });
 *
 * `status` is one of idle | loading | empty | error | unavailable | ready. Idle
 * with no message renders nothing visible but keeps the live region mounted,
 * so the next change is announced. Retry shows for error and unavailable only,
 * and only with a `retry` function.
 *
 * THE HOST OWNS ITS COPY. `labels` and `retryLabel` given at creation are the
 * words every update uses; the same two on a model win for that update alone.
 * A status neither names keeps the kit's word.
 *
 *   const status = createStatus(host, { labels: { empty: 'No notes yet' }, retryLabel: 'Try again' });
 */
import { button, createLife, documentOf, el, textNode, writeText } from './dom.js';
import { injectUiStyles } from './styles.js';

const CLASS = 'cloudcanvas-ui-status';

/** The default word for each status. */
export const STATUS_LABELS = /* @__PURE__ */ Object.freeze({
  idle: '', loading: 'Loading', empty: 'Nothing here yet', error: 'Something went wrong',
  unavailable: 'Unavailable', ready: ''
});

function statusNodes(doc, life, state) {
  const root = el(doc, 'div', { className: CLASS, attrs: { role: 'status', 'aria-live': 'polite' } });
  const label = el(doc, 'strong', { className: `${CLASS}-label` });
  const message = el(doc, 'span', { className: `${CLASS}-message` });
  const retry = button(doc, { className: `${CLASS}-retry`, label: 'Retry', signal: life.signal,
    onClick: () => state.retry?.() });
  root.append(label, message, retry);
  return { root, label, labelText: textNode(doc, label), message, messageText: textNode(doc, message), retry };
}

/**
 * @param {HTMLElement} host
 * @param {{labels?: Partial<typeof STATUS_LABELS>, retryLabel?: string}} [options] the host's words, used by every update
 * @returns {{update(model: object): void, destroy(): void}}
 */
export function createStatus(host, options) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  // Read through `??`: before there were options a second argument was ignored, and a null one still is.
  const { labels, retryLabel } = options ?? {};
  const life = createLife();
  const state = { retry: null };
  const nodes = statusNodes(doc, life, state);
  host.append(nodes.root);
  const write = (model) => {
    const status = model.status ?? 'idle';
    if (!Object.hasOwn(STATUS_LABELS, status)) throw new TypeError(`Unknown status: ${String(status)}`);
    const word = String(model.labels?.[status] ?? labels?.[status] ?? STATUS_LABELS[status]);
    const message = String(model.message ?? '');
    nodes.root.setAttribute('data-status', status);
    nodes.root.setAttribute('aria-live', status === 'error' ? 'assertive' : 'polite');
    nodes.root.classList.toggle('is-quiet', word === '' && message === '');
    writeText(nodes.labelText, word);
    nodes.label.hidden = word === '';
    writeText(nodes.messageText, message);
    nodes.message.hidden = message === '';
    const canRetry = (status === 'error' || status === 'unavailable') && typeof model.retry === 'function';
    state.retry = canRetry ? model.retry : null;
    nodes.retry.hidden = !canRetry;
    writeText(nodes.retry.firstChild, model.retryLabel ?? retryLabel ?? 'Retry');
  };
  // Idle from creation: a host that only ever reports errors shows no Retry before there is one to run.
  write({});
  return {
    update(model = {}) {
      if (life.dead) return;
      write(model);
    },
    destroy() {
      if (!life.destroy()) return;
      state.retry = null;
      nodes.root.remove();
    }
  };
}
