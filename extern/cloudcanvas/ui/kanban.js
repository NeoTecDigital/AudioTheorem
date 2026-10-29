/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Kanban: columns of cards, moved by drag or by keyboard.
 *
 *   const board = createKanban(host, {
 *     onMove: (cardId, columnId, index) => move(cardId, columnId, index),
 *     onActivate: (cardId) => open(cardId),
 *     canMove: (cardId, fromId, toId) => toId !== 'done' || 'Finish the checklist first'
 *   });
 *   board.update({ label: 'Plan', selectedId: 'a', columns: [{ id: 'todo', label: 'To do', cards: [{ id: 'a', title: 'Call' }] }] });
 *
 * CONTROLLED. A drop reports `onMove(cardId, columnId, index)` - `index` counts
 * the target column's cards without the moved one - and the board shows the
 * model it is given, so a refused or failed move simply stays put. `canMove`
 * returning a string refuses with that reason, shown and announced.
 *
 * KEYBOARD. One tab stop; arrows rove between cards, Enter opens one. Space
 * picks a card up: arrows then move it (Left/Right between columns, Up/Down
 * within one), Space or Enter drops it, Escape puts it back. Every step is
 * announced. A touch drag starts once a finger that has rested travels
 * (`./drag.js`): a swipe still scrolls, and a still hold is the host's.
 *
 * A COLUMN MAY STAND FOR AN ITEM. A column that carries `itemId` - the parent
 * its cards are grouped under, say - has a heading that is a button: a tab
 * stop of its own, pressed as a card is (`onActivate(itemId)`), and carrying
 * that item's id for `itemIdOf`. It is not a card: it is not picked up, and
 * the arrows do not rove to it.
 *
 * `selectedId` marks the item a host has selected, on its card and on a
 * heading that stands for it: for the eye and for assistive technology
 * (`aria-current`). Focus is not moved; a board drawn for the first time
 * rests its tab stop there.
 */
import { createLiveRegion, say } from '../addons/announce.js';
import { CONTROL_ATTR } from '../addons/trait.js';
import { reconcileKeyedList } from '../addons/keyed-list.js';
import { createLife, documentOf, el, itemIdOf, itemNodeOf, markSelected, uniqueId, uniqueItems } from './dom.js';
import { trackDrag } from './drag.js';
import { bindBoardKeys, cardNodes, focusCard, placeOf } from './kanban-keys.js';
import { keepFocus } from './render.js';
import { injectUiStyles } from './styles.js';

const CLASS = 'cloudcanvas-ui-kanban';

function cardNode(doc) {
  const item = el(doc, 'li', { className: `${CLASS}-item` });
  const card = el(doc, 'button', { className: `${CLASS}-card`, attrs: { type: 'button', tabindex: '-1' } });
  card.append(el(doc, 'span', { className: `${CLASS}-title` }), el(doc, 'span', { className: `${CLASS}-detail` }),
    el(doc, 'span', { className: `${CLASS}-meta` }));
  item.append(card);
  return item;
}

/** A card's detail line: its words, or, when it has a `time`, the moment as a `<time datetime title>` that reads as `text`. */
function writeDetail(detail, card) {
  const when = card.time?.iso && card.time?.text ? card.time : null;
  detail.textContent = when ? '' : String(card.detail ?? '');
  if (when) {
    const node = detail.ownerDocument.createElement('time');
    node.setAttribute('datetime', String(when.iso));
    node.setAttribute('title', String(when.title ?? when.iso));
    node.textContent = String(when.text);
    detail.append(node);
  }
  detail.hidden = !when && !card.detail;
}

function writeCard(item, card, column, selectedId) {
  const button = item.firstChild;
  const [title, detail, meta] = button.children;
  button.setAttribute('data-ui-id', card.id);
  button.setAttribute('data-column-id', column.id);
  if (card.tone) button.setAttribute('data-tone', String(card.tone));
  else button.removeAttribute('data-tone');
  title.textContent = String(card.title ?? '');
  writeDetail(detail, card);
  meta.textContent = String(card.meta ?? '');
  meta.hidden = !card.meta;
  markSelected(button, card.id === selectedId);
}

function columnNode(doc, column) {
  const section = el(doc, 'section', { className: `${CLASS}-column` });
  const heading = el(doc, 'h3', { className: `${CLASS}-heading`, attrs: { id: uniqueId(CLASS) } });
  heading.append(el(doc, 'span', { className: `${CLASS}-label` }), el(doc, 'span', { className: `${CLASS}-count` }));
  const list = el(doc, 'ul', { className: `${CLASS}-cards`, attrs: { role: 'list' } });
  section.setAttribute('aria-labelledby', heading.id);
  section.append(heading, list);
  section.setAttribute('data-column-id', column.id);
  return section;
}

/**
 * The heading's label: a button when the column stands for an item - it takes
 * focus, is pressed as a card is and carries that item's id - and plain text
 * when the column is only a column. One becomes the other with the model.
 */
function headingLabel(doc, heading, itemId) {
  const tag = itemId === null ? 'span' : 'button';
  let label = heading.firstChild;
  if (label.localName !== tag) {
    label = el(doc, tag, { className: `${CLASS}-label`, attrs: { type: itemId === null ? null : 'button' } });
    heading.firstChild.replaceWith(label);
  }
  if (itemId !== null) label.setAttribute('data-ui-id', itemId);
  return label;
}

function writeColumn(section, column, { doc, model }) {
  const heading = section.firstChild;
  const label = headingLabel(doc, heading, column.itemId);
  label.textContent = String(column.label ?? column.id);
  markSelected(label, column.itemId !== null && column.itemId === model.selectedId);
  heading.lastChild.textContent = String(column.cards.length);
  reconcileKeyedList(section.lastChild, column.cards, {
    key: (card) => card.id, create: () => cardNode(doc), update: (item, card) => writeCard(item, card, column, model.selectedId)
  });
}

/** The id of the item a column stands for, or null for a column that is only a column. Given, it is a name. */
function itemIdFor(column) {
  const id = column.itemId ?? null;
  if (id !== null && (typeof id !== 'string' || id.trim() === '')) throw new TypeError(`Invalid item id for column ${column.id}: ${String(id)}`);
  return id;
}

/** The model with its columns and cards checked: ids unique across the whole board. */
function normalize(model) {
  const columns = uniqueItems(model.columns ?? [], 'column')
    .map((column) => ({ ...column, itemId: itemIdFor(column), cards: Array.isArray(column.cards) ? column.cards : [] }));
  uniqueItems(columns.flatMap((column) => column.cards), 'card');
  return { ...model, selectedId: model.selectedId ?? null, columns };
}

/**
 * Leave focus right after a redraw. A heading that held it and is still a
 * control keeps it; any other focus the board had goes to the card with the
 * tab stop. Focus outside the board is not the board's.
 */
function restoreFocus(board, held) {
  const stays = held?.matches(`button.${CLASS}-label`) === true && board.root.contains(held);
  focusCard(board, board.state.focusId, { move: held !== null && !stays });
  if (stays) keepFocus(board.root, held);
}

function render(board, model) {
  const columns = model.columns;
  board.model = model;
  board.root.setAttribute('aria-label', String(model.label ?? 'Board'));
  const held = board.root.contains(board.doc.activeElement) ? board.doc.activeElement : null;
  reconcileKeyedList(board.lane, columns, {
    key: (column) => column.id, create: (column) => columnNode(board.doc, column),
    update: (section, column) => writeColumn(section, column, board)
  });
  const ids = cardNodes(board).map((card) => card.getAttribute('data-ui-id'));
  // The stop the keys placed stays; with none, it rests on the selected card, else on the first.
  if (!ids.includes(board.state.focusId)) board.state.focusId = ids.includes(model.selectedId) ? model.selectedId : ids[0] ?? null;
  restoreFocus(board, held);
}

/** The column and index a pointer at `point` would drop into. */
function dropAt(board, point, draggedId) {
  const hit = board.doc.elementFromPoint?.(point.x, point.y);
  const section = hit?.closest?.(`.${CLASS}-column`);
  if (!section || !board.lane.contains(section)) return null;
  const cards = Array.from(section.querySelectorAll(`.${CLASS}-card`)).filter((card) => card.getAttribute('data-ui-id') !== draggedId);
  const index = cards.findIndex((card) => {
    const box = card.getBoundingClientRect();
    return point.y < box.top + box.height / 2;
  });
  return { columnId: section.getAttribute('data-column-id'), index: index === -1 ? cards.length : index, section };
}

/** `true` when the move is allowed, otherwise the refusal text. */
export function moveVerdict(canMove, cardId, fromId, toId) {
  if (fromId === toId || typeof canMove !== 'function') return true;
  const verdict = canMove(cardId, fromId, toId);
  if (verdict === true || verdict === undefined) return true;
  return typeof verdict === 'string' && verdict.trim() ? verdict : 'This move is not allowed.';
}

function clearDropMarks(board) {
  for (const node of board.lane.querySelectorAll('.is-drop-target, .is-refused')) node.classList.remove('is-drop-target', 'is-refused');
}

function bindPointer(board) {
  trackDrag(board.life, board.lane, {
    selector: `.${CLASS}-card`,
    onStart(card, point) {
      board.drag = { id: card.getAttribute('data-ui-id'), from: card.getAttribute('data-column-id'), origin: point, card };
      card.closest('li').classList.add('is-dragging');
    },
    onMove(point) {
      const drag = board.drag;
      drag.card.closest('li')?.style.setProperty('transform', `translate(${point.x - drag.origin.x}px, ${point.y - drag.origin.y}px)`);
      const lane = board.lane.getBoundingClientRect();
      if (point.x > lane.right - 32) board.lane.scrollLeft += 12;
      else if (point.x < lane.left + 32) board.lane.scrollLeft -= 12;
      clearDropMarks(board);
      const target = dropAt(board, point, drag.id);
      if (target) target.section.classList.add(moveVerdict(board.callbacks.canMove, drag.id, drag.from, target.columnId) === true ? 'is-drop-target' : 'is-refused');
    },
    onEnd(point) {
      const drag = board.drag;
      board.drag = null;
      drag.card.closest('li')?.classList.remove('is-dragging');
      drag.card.closest('li')?.style.removeProperty('transform');
      clearDropMarks(board);
      const target = point ? dropAt(board, point, drag.id) : null;
      if (target) board.commit(drag.id, drag.from, target.columnId, target.index);
      else board.render();
    }
  });
}

/**
 * @param {HTMLElement} host
 * @param {{onMove?: (cardId: string, columnId: string, index: number) => void,
 *   onActivate?: (cardId: string) => void,
 *   canMove?: (cardId: string, fromColumnId: string, toColumnId: string) => boolean|string}} [callbacks]
 * @returns {{update(model: {label?: string, selectedId?: string|null, columns?: Array<{id: string, label?: string, itemId?: string,
 *   cards?: Array<{id: string, title?: string, detail?: string, time?: {iso: string, text: string, title?: string}, meta?: string, tone?: string}>}>}): void, destroy(): void}}
 */
export function createKanban(host, callbacks = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  // A control (`data-cc-control`): the canvas under the page leaves this view's drags to it, so a host marks nothing.
  const root = el(doc, 'div', { className: CLASS, attrs: { role: 'group', [CONTROL_ATTR]: true } });
  const lane = el(doc, 'div', { className: `${CLASS}-lane` });
  root.append(lane);
  host.append(root);
  const board = { doc, life, root, lane, callbacks, model: { selectedId: null, columns: [] }, state: { focusId: null, grab: null },
    drag: null, region: createLiveRegion(root), moveVerdict };
  board.say = (text) => say(board.region, text);
  board.render = () => render(board, board.model);
  board.commit = (cardId, from, to, index) => {
    const verdict = moveVerdict(callbacks.canMove, cardId, from, to);
    if (verdict !== true) { board.say(verdict); board.render(); return false; }
    const here = placeOf(board, cardId);
    if (here && here.columnId === to && here.index === index) { board.render(); return false; }
    callbacks.onMove?.(cardId, to, index);
    board.render();
    return true;
  };
  // A card, or a heading that stands for an item: each is the face of one, and a press on either opens it.
  life.on(lane, 'click', (event) => {
    const face = itemNodeOf(event.target, lane);
    if (face && !board.state.grab) callbacks.onActivate?.(itemIdOf(face));
  });
  bindBoardKeys(board);
  bindPointer(board);
  return {
    update(model = {}) {
      if (life.dead) return;
      board.model = normalize(model);
      if (!board.state.grab && !board.drag) board.render();
    },
    destroy() {
      if (life.destroy()) root.remove();
    }
  };
}
