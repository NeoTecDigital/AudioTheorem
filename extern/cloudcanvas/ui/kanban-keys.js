/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The board's keyboard: roving focus between cards, and the pick-up / move /
 * drop gesture that is the keyboard's drag. Split from `./kanban.js`, which
 * owns rendering; both work on the same `board` record.
 */
import { setTabStop } from './roving.js';

const CARD = '.cloudcanvas-ui-kanban-card';

/** Every card button, in column then card order. */
export function cardNodes(board) {
  return Array.from(board.lane.querySelectorAll(CARD));
}

/** Where `cardId` sits in the model: its column id and index, or null. */
export function placeOf(board, cardId) {
  for (const column of board.model.columns) {
    const index = column.cards.findIndex((card) => card.id === cardId);
    if (index !== -1) return { columnId: column.id, index };
  }
  return null;
}

/** Give `cardId` the tab stop, and focus it when `move` is set. */
export function focusCard(board, cardId, { move }) {
  const cards = cardNodes(board);
  const card = cards.find((node) => node.getAttribute('data-ui-id') === cardId) ?? null;
  board.state.focusId = card ? cardId : null;
  setTabStop(cards, card ?? cards[0] ?? null);
  if (move) card?.focus();
}

function titleOf(board, cardId) {
  for (const column of board.model.columns) {
    const card = column.cards.find((entry) => entry.id === cardId);
    if (card) return String(card.title ?? card.id);
  }
  return cardId;
}

function columnAt(board, columnId) {
  const index = board.model.columns.findIndex((column) => column.id === columnId);
  return { index, column: board.model.columns[index] };
}

/** Arrow roving without a card in hand: Up/Down in a column, Left/Right to the nearest column with cards. */
function rove(board, key, cardId) {
  const place = placeOf(board, cardId);
  if (!place) return null;
  const { index: col, column } = columnAt(board, place.columnId);
  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End') {
    const last = column.cards.length - 1;
    const to = { ArrowUp: place.index - 1, ArrowDown: place.index + 1, Home: 0, End: last }[key];
    return column.cards[Math.max(0, Math.min(last, to))].id;
  }
  const step = key === 'ArrowRight' ? 1 : -1;
  for (let next = col + step; next >= 0 && next < board.model.columns.length; next += step) {
    const cards = board.model.columns[next].cards;
    if (cards.length) return cards[Math.min(place.index, cards.length - 1)].id;
  }
  return null;
}

/** Show the card in hand at its pending place, and say where that is. */
function preview(board) {
  const grab = board.state.grab;
  const section = Array.from(board.lane.children).find((node) => node.getAttribute('data-column-id') === grab.columnId);
  const card = cardNodes(board).find((node) => node.getAttribute('data-ui-id') === grab.id);
  if (!section || !card) return;
  const list = section.lastChild;
  const others = Array.from(list.children).filter((item) => item !== card.parentNode);
  list.insertBefore(card.parentNode, others[grab.index] ?? null);
  card.focus();
  const { column } = columnAt(board, grab.columnId);
  const where = `${String(column.label ?? column.id)}, position ${grab.index + 1} of ${others.length + 1}`;
  const refusal = board.verdict(grab.id, grab.from, grab.columnId);
  section.classList.toggle('is-refused', refusal !== true);
  board.say(refusal === true ? where : `${where}. ${refusal}`);
}

function moveInHand(board, key) {
  const grab = board.state.grab;
  const { index: col } = columnAt(board, grab.columnId);
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const next = board.model.columns[col + (key === 'ArrowRight' ? 1 : -1)];
    if (!next) return;
    grab.columnId = next.id;
    const size = next.cards.filter((card) => card.id !== grab.id).length;
    grab.index = Math.min(grab.index, size);
  } else {
    const size = columnAt(board, grab.columnId).column.cards.filter((card) => card.id !== grab.id).length;
    grab.index = Math.max(0, Math.min(size, grab.index + (key === 'ArrowDown' ? 1 : -1)));
  }
  preview(board);
}

function endGrab(board, drop) {
  const grab = board.state.grab;
  board.state.grab = null;
  for (const node of board.lane.querySelectorAll('.is-grabbed, .is-refused')) node.classList.remove('is-grabbed', 'is-refused');
  if (drop && board.commit(grab.id, grab.from, grab.columnId, grab.index)) board.say(`Dropped ${titleOf(board, grab.id)}.`);
  else if (!drop) { board.render(); board.say('Move cancelled.'); }
  focusCard(board, grab.id, { move: true });
}

function startGrab(board, cardId, card) {
  const place = placeOf(board, cardId);
  if (!place) return;
  board.state.grab = { id: cardId, from: place.columnId, columnId: place.columnId, index: place.index };
  card.parentNode.classList.add('is-grabbed');
  board.say(`Picked up ${titleOf(board, cardId)}. Arrow keys move it, Space drops it, Escape cancels.`);
}

function onKeyDown(board, event) {
  const card = event.target.closest?.(CARD);
  if (!card) return;
  const cardId = card.getAttribute('data-ui-id');
  const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  if (event.repeat && (event.key === ' ' || event.key === 'Enter')) { event.preventDefault(); return; }
  if (board.state.grab) {
    if (arrows.includes(event.key)) moveInHand(board, event.key);
    else if (event.key === ' ' || event.key === 'Enter') endGrab(board, true);
    else if (event.key === 'Escape' || event.key === 'Tab') endGrab(board, false);
    else return;
    if (event.key !== 'Tab') event.preventDefault();
    return;
  }
  if (event.key === ' ') { event.preventDefault(); startGrab(board, cardId, card); return; }
  const to = [...arrows, 'Home', 'End'].includes(event.key) ? rove(board, event.key, cardId) : null;
  if (to === null) return;
  event.preventDefault();
  focusCard(board, to, { move: true });
}

/** Wire the board's keys; Space is claimed on release too, so no browser clicks the card after a pick-up. */
export function bindBoardKeys(board) {
  board.verdict = (cardId, from, to) => board.moveVerdict(board.callbacks.canMove, cardId, from, to);
  board.life.on(board.lane, 'keydown', (event) => onKeyDown(board, event));
  board.life.on(board.lane, 'keyup', (event) => {
    if (event.key === ' ' && event.target.closest?.(CARD)) event.preventDefault();
  });
  board.life.on(board.lane, 'focusin', (event) => {
    const card = event.target.closest?.(CARD);
    if (card && !board.state.grab) board.state.focusId = card.getAttribute('data-ui-id');
  });
}
