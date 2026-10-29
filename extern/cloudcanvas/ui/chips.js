/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Chips: a labelled group of small toggles - filters, tags, categories.
 *
 *   const chips = createChips(host, { onToggle: (id, pressed) => setFilter(id, pressed), onRemove: (id) => dropTag(id) });
 *   chips.update({ label: 'Categories', items: [{ id: 'w', label: 'Work', tone: '3', pressed: true, removable: true }] });
 *
 * CONTROLLED. A press reports `onToggle(id, pressed)` with the state asked for,
 * and Remove reports `onRemove(id)`; the group then shows what the next model
 * says. Each chip is a real button with `aria-pressed`, so Tab, Enter and Space
 * are the platform's. A removable chip has a second button beside it, named
 * for the chip ("Remove Work"; `removeLabel` is the host's word for the verb).
 *
 * CHIPS THAT CHOOSE ONE. `createChips(host, { single: true, onChange })` is a choice among the chips, not a set of
 * filters: the model's `value` is the id of the one pressed chip (an item's `pressed` says nothing), and a press on
 * another chip reports `onChange(id)`. Choosing what is chosen reports nothing, as a radio does, and nothing is
 * removable. The group is a toolbar of the same pressed buttons: the chosen chip is the one tab stop (the first
 * when none is chosen), the arrows, Home and End move focus and the tab stop with it, wrapping, and Enter or
 * Space presses. Moving is not choosing: only a press reports.
 *
 * NOTHING IS DRAWN THAT CANNOT WORK. Without `onToggle` a chip is text, not a
 * button; without `onRemove` no chip offers to be removed. When the chip that
 * has focus leaves the group, focus goes to the one that took its place, so a
 * keyboard user removing three tags is not sent back to the top of the page
 * three times. `tone` is written as `data-tone` for the sheet.
 */
import { createLife, documentOf, el, focusablesIn, textNode, uniqueItems, writeText } from './dom.js';
import { nextIndex, setTabStop } from './roving.js';
import { injectUiStyles } from './styles.js';
import { reconcileKeyedList } from '../addons/keyed-list.js';

const CLASS = 'cloudcanvas-ui-chips';
const CHIP = `.${CLASS}-chip`;
const TOGGLE = `.${CLASS}-toggle`;

/** One chip: its face (a toggle button, or text when nothing answers a press) and, when chips can be removed, its Remove. */
function chipNode(doc, { toggles, removes }) {
  const node = el(doc, 'span', { className: `${CLASS}-chip` });
  const face = toggles
    ? el(doc, 'button', { className: `${CLASS}-toggle`, attrs: { type: 'button' } })
    : el(doc, 'span', { className: `${CLASS}-label` });
  const remove = removes ? el(doc, 'button', { className: `${CLASS}-remove`, text: '×', attrs: { type: 'button' } }) : null;
  node.append(face);
  if (remove) node.append(remove);
  node._uiChip = { face, text: textNode(doc, face), remove };
  return node;
}

function writeChip(node, item, chips) {
  const { face, text, remove } = node._uiChip;
  const label = String(item.label ?? item.id);
  writeText(text, label);
  if (item.tone) node.setAttribute('data-tone', String(item.tone));
  else node.removeAttribute('data-tone');
  if (chips.toggles) {
    face.setAttribute('data-ui-id', item.id);
    face.setAttribute('aria-pressed', String(chips.single ? item.id === chips.state.value : item.pressed === true));
  }
  if (remove) {
    remove.setAttribute('data-ui-remove', item.id);
    remove.setAttribute('aria-label', `${chips.state.removeLabel} ${label}`);
    remove.hidden = item.removable !== true;
  }
}

/**
 * Redraw the chips in place. When the redraw took the focus from the group -
 * its chip left, or was moved - it goes back to that chip if it is still
 * there, else to the chip now in its place.
 */
function draw(chips) {
  const { doc, root, state } = chips;
  const active = doc.activeElement;
  const chip = active?.closest?.(CHIP) ?? null;
  const at = chip && root.contains(chip) ? Array.from(root.children).indexOf(chip) : -1;
  const nodes = reconcileKeyedList(root, state.items, {
    key: (item) => item.id,
    create: () => chipNode(doc, chips),
    update: (node, item) => writeChip(node, item, chips)
  });
  if (at >= 0 && !root.contains(doc.activeElement)) {
    const heir = nodes.includes(chip) ? chip : nodes[Math.min(at, nodes.length - 1)];
    const targets = heir ? focusablesIn(heir) : [];
    (targets.includes(active) ? active : targets[0])?.focus();
  }
  restTabStop(chips);
}

/** The toggle buttons of the group, in order. */
function facesOf(chips) {
  return [...chips.root.querySelectorAll(TOGGLE)];
}

/** In the choosing group, give the one tab stop to the chip with focus, else the chosen one, else the first. */
function restTabStop(chips) {
  if (!chips.single || !chips.toggles) return;
  const faces = facesOf(chips);
  const held = faces.find((face) => face === chips.doc.activeElement);
  const chosen = faces.find((face) => face.getAttribute('aria-pressed') === 'true');
  if (faces.length > 0) setTabStop(faces, held ?? chosen ?? faces[0]);
}

/** The arrows, Home and End move focus among the chips of a choosing group, and the tab stop goes with it. */
function bindRoving(chips) {
  const { root, life } = chips;
  life.on(root, 'keydown', (event) => {
    const face = event.target.closest?.(TOGGLE);
    if (!face || !root.contains(face) || event.altKey || event.ctrlKey || event.metaKey) return;
    const faces = facesOf(chips);
    const to = nextIndex(event.key, faces.indexOf(face), faces.length, { orientation: 'both', wrap: true });
    if (to === null) return;
    event.preventDefault();
    setTabStop(faces, faces[to]);
    faces[to].focus();
  });
  life.on(root, 'focusin', (event) => {
    const face = event.target.closest?.(TOGGLE);
    if (face && root.contains(face)) setTabStop(facesOf(chips), face);
  });
}

function bindChips(chips, { onToggle, onRemove, onChange }) {
  const { root, state } = chips;
  chips.life.on(root, 'click', (event) => {
    const remove = event.target.closest?.('[data-ui-remove]');
    if (remove && root.contains(remove)) {
      if (!remove.hidden) onRemove(remove.getAttribute('data-ui-remove'));
      return;
    }
    const face = event.target.closest?.(TOGGLE);
    if (!face || !root.contains(face)) return;
    const id = face.getAttribute('data-ui-id');
    if (!chips.single) onToggle(id, state.items.find((item) => item.id === id)?.pressed !== true);
    else if (id !== state.value) onChange(id);
  });
  if (chips.single) bindRoving(chips);
}

/**
 * @param {HTMLElement} host
 * @param {{single?: boolean, onChange?: (id: string) => void, onToggle?: (id: string, pressed: boolean) => void,
 *   onRemove?: (id: string) => void}} [callbacks] `single` makes the group a choice of one, reported by `onChange`; otherwise each chip toggles, by `onToggle`
 * @returns {{update(model: {label?: string, removeLabel?: string, value?: string|null, items?: Array<{id: string, label?: string, tone?: string,
 *   pressed?: boolean, removable?: boolean}>}): void, destroy(): void}} `value` is the chosen chip's id, in a `single` group
 */
export function createChips(host, callbacks = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const root = el(doc, 'div', { className: CLASS, attrs: { role: 'group' } });
  host.append(root);
  const single = callbacks.single === true;
  const chips = { doc, root, life, single, toggles: typeof (single ? callbacks.onChange : callbacks.onToggle) === 'function',
    removes: !single && typeof callbacks.onRemove === 'function', state: { items: [], removeLabel: 'Remove', value: null } };
  bindChips(chips, callbacks);
  return {
    update(model = {}) {
      if (life.dead) return;
      chips.state.items = uniqueItems(model.items ?? [], 'chip');
      chips.state.removeLabel = String(model.removeLabel ?? 'Remove');
      chips.state.value = model.value ?? null;
      root.setAttribute('aria-label', String(model.label ?? 'Chips'));
      draw(chips);
    },
    destroy() {
      if (life.destroy()) root.remove();
    }
  };
}
