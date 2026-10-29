/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Results: a listbox of `{id, label, detail?}` options.
 *
 *   const results = createResults(host, { onActivate: (id) => open(id) });
 *   results.update({ label: 'Matches', items, activeId, emptyText: 'Nothing found' });
 *
 * TWO WAYS TO DRIVE IT. Standalone, the options rove (one tab stop, arrows,
 * Home/End, Enter or Space activates). Attached to a search field with
 * `attachInput(input)`, focus stays in the field: the field becomes a
 * combobox that `aria-controls` the list, Up/Down move `aria-activedescendant`,
 * Enter activates and Escape clears the highlight. `onHighlight(id)` reports
 * the highlighted option either way.
 */
import { createLife, documentOf, el, textNode, uniqueId, uniqueItems, writeText } from './dom.js';
import { nextIndex, setTabStop } from './roving.js';
import { injectUiStyles } from './styles.js';
import { reconcileKeyedList } from '../addons/keyed-list.js';
import { CONTROL_ATTR } from '../addons/trait.js';

const CLASS = 'cloudcanvas-ui-results';

function optionNode(doc, listId) {
  // An option is a `<div>`, so inside a canvas it says it is a control: a press picks it and starts no canvas gesture.
  const node = el(doc, 'div', { className: `${CLASS}-option`, attrs: { role: 'option', [CONTROL_ATTR]: true } });
  const label = el(doc, 'span', { className: `${CLASS}-label` });
  const detail = el(doc, 'span', { className: `${CLASS}-detail` });
  node.append(label, detail);
  node._uiText = { label: textNode(doc, label), detail: textNode(doc, detail), listId };
  return node;
}

function writeOption(node, item, state) {
  node.id = `${node._uiText.listId}-${item.id}`;
  node.setAttribute('data-ui-id', item.id);
  node.setAttribute('aria-selected', String(item.id === state.highlightId));
  node.classList.toggle('is-active', item.id === state.activeId);
  writeText(node._uiText.label, item.label);
  writeText(node._uiText.detail, item.detail ?? '');
  node._uiText.detail.parentNode.hidden = !item.detail;
}

function highlight(nodes, state, id, { focus }) {
  const changed = state.highlightId !== id;
  state.highlightId = id;
  const current = nodes.find((node) => node.getAttribute('data-ui-id') === id) ?? null;
  for (const node of nodes) node.setAttribute('aria-selected', String(node === current));
  if (state.input) {
    if (current) state.input.setAttribute('aria-activedescendant', current.id);
    else state.input.removeAttribute('aria-activedescendant');
    current?.scrollIntoView?.({ block: 'nearest' });
  } else {
    setTabStop(nodes, current ?? nodes[0] ?? null);
    if (focus) current?.focus();
  }
  if (changed) state.onHighlight?.(id);
}

function onKey(event, list, state) {
  const nodes = Array.from(list.children);
  const index = nodes.findIndex((node) => node.getAttribute('data-ui-id') === state.highlightId);
  if ((event.key === 'Enter' || (event.key === ' ' && !state.input)) && state.highlightId) {
    event.preventDefault();
    state.onActivate?.(state.highlightId);
    return;
  }
  if (event.key === 'Escape' && state.input && state.highlightId) {
    event.preventDefault();
    highlight(nodes, state, null, { focus: false });
    return;
  }
  const keys = state.input ? ['ArrowUp', 'ArrowDown'] : ['ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const to = nextIndex(event.key, index, nodes.length, { orientation: 'vertical' });
  if (to === null) return;
  event.preventDefault();
  highlight(nodes, state, nodes[to].getAttribute('data-ui-id'), { focus: !state.input });
}

function render(doc, root, list, empty, state) {
  const nodes = reconcileKeyedList(list, state.items, {
    key: (item) => item.id,
    create: () => optionNode(doc, list.id),
    update: (node, item) => writeOption(node, item, state)
  });
  const present = (id) => state.items.some((item) => item.id === id);
  let next = state.highlightId;
  if (!present(next)) next = state.activeId ?? null;
  if (!present(next)) next = state.input ? null : state.items[0]?.id ?? null;
  highlight(nodes, state, next, { focus: false });
  empty.hidden = state.items.length > 0 || !state.emptyText;
  empty.textContent = state.emptyText;
  root.classList.toggle('is-empty', state.items.length === 0);
}

/**
 * @param {HTMLElement} host
 * @param {{onActivate?: (id: string) => void, onHighlight?: (id: string|null) => void}} [callbacks]
 * @returns {{update(model: object): void, attachInput(input: HTMLInputElement): () => void, destroy(): void}}
 */
export function createResults(host, { onActivate, onHighlight } = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const root = el(doc, 'div', { className: CLASS });
  const list = el(doc, 'div', { className: `${CLASS}-list`, attrs: { role: 'listbox', id: uniqueId(CLASS) } });
  const empty = el(doc, 'p', { className: `${CLASS}-empty`, attrs: { role: 'status', hidden: true } });
  root.append(list, empty);
  host.append(root);
  const state = { items: [], activeId: null, highlightId: null, emptyText: '', input: null, onActivate, onHighlight };
  life.on(list, 'click', (event) => {
    const option = event.target.closest?.('[role="option"]');
    if (option) onActivate?.(option.getAttribute('data-ui-id'));
  });
  life.on(list, 'keydown', (event) => { if (!state.input) onKey(event, list, state); });
  return {
    update(model = {}) {
      if (life.dead) return;
      state.items = uniqueItems(model.items ?? [], 'result');
      if (state.activeId !== (model.activeId ?? null)) state.highlightId = model.activeId ?? null;
      state.activeId = model.activeId ?? null;
      state.emptyText = String(model.emptyText ?? '');
      list.setAttribute('aria-label', String(model.label ?? 'Results'));
      render(doc, root, list, empty, state);
      state.input?.setAttribute('aria-expanded', String(state.items.length > 0));
    },
    attachInput(field) {
      if (life.dead) return () => {};
      state.input = field;
      field.setAttribute('role', 'combobox');
      field.setAttribute('aria-controls', list.id);
      field.setAttribute('aria-autocomplete', 'list');
      field.setAttribute('aria-expanded', String(state.items.length > 0));
      const handler = (event) => onKey(event, list, state);
      field.addEventListener('keydown', handler, { signal: life.signal });
      return () => {
        field.removeEventListener('keydown', handler);
        for (const name of ['role', 'aria-controls', 'aria-autocomplete', 'aria-expanded', 'aria-activedescendant']) field.removeAttribute(name);
        if (state.input === field) state.input = null;
      };
    },
    destroy() {
      if (!life.destroy()) return;
      state.input?.removeAttribute('aria-activedescendant');
      state.input = null;
      root.remove();
    }
  };
}
