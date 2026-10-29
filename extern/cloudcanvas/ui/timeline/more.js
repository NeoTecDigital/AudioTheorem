/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The timeline's "more" button (`../item-more.js`): one, in the track of the selected bar's row, after the bar, its
 * link handle and the title drawn beside it, drawn only while the host takes a menu and nothing is in hand (a bar being
 * moved or resized, a span being drawn, a link being dragged). It stands beyond the bar's right end - the sheet moves a
 * title drawn beside the bar past it - so it covers neither the title nor a handle, and the row's own end stays the
 * bar's.
 *
 * A BAR TOO NARROW FOR IT HAS NONE. The button takes a third of the bar's width at most (`roomForMore`, measured where the
 * sheet puts it): a bar of 57px does not give 44px of a finger's button. Its row says so (`is-crowded`), so the title drawn
 * beside the bar does not step aside for a button that is not there, and the hint says how else the menu is reached
 * (`tl.crowded`); the right-click, Shift+F10 and a held touch are as they were.
 */
import { MORE_CLASS, belowMore, isMore, moreButton, nameMore, roomForMore } from '../item-more.js';
import { TL } from './model.js';
import { bars } from './move.js';

/** The geometry a bar is placed by; the button takes the same, so it stands where the bar ends. */
const PLACE = Object.freeze(['--timeline-x', '--timeline-w']);

const ROW = `${TL}-row`;

/** Take the button away from the bar `bar` it stood by; the focus it held goes to the bar: the same item, one stop before. */
function dropMore(tl, bar) {
  const held = tl.more !== undefined && tl.doc.activeElement === tl.more;
  tl.more?.remove();
  if (held) bar?.focus({ preventScroll: true });
}

/** Whether the bar `bar` is too narrow to give a third of itself to the button. A milestone is no bar: the button stands beside it, taking none of it. */
function crowdedBy(tl, bar) {
  return !bar.classList.contains('is-point') && !roomForMore(bar.getBoundingClientRect().width, tl.more.getBoundingClientRect().width);
}

/** Put the button after the selected bar, or take it away: too narrow a bar has none (`tl.crowded` names it, its row says so to the sheet). */
export function syncMore(tl) {
  const id = tl.state.selectedId;
  const bar = id !== null && typeof tl.callbacks.onMenu === 'function' && !tl.busy() ? bars(tl).find((node) => node.getAttribute('data-ui-id') === id) : null;
  tl.crowded = null;
  for (const row of tl.sheet.querySelectorAll(`.${ROW}.is-crowded`)) row.classList.remove('is-crowded');
  if (!bar) {
    dropMore(tl, null);
    return;
  }
  tl.more ??= moreButton(tl.doc, `${TL}-more`);
  nameMore(tl.more, tl.labels.more, tl.byId.get(id).title);
  tl.more.setAttribute('data-more-for', id);
  tl.more.classList.toggle('is-point', bar.classList.contains('is-point'));
  for (const name of PLACE) tl.more.style.setProperty(name, bar.style.getPropertyValue(name));
  const track = bar.parentElement;
  if (tl.more.parentElement !== track) track.append(tl.more);
  if (!crowdedBy(tl, bar)) return;
  tl.crowded = id;
  bar.closest(`.${ROW}`)?.classList.add('is-crowded');
  dropMore(tl, bar);
}

/** A press on the button: the menu of the bar it stands by, under it. True when it was the button's. */
export function pressMore(tl, target) {
  if (!isMore(target)) return false;
  const button = target.closest(`.${MORE_CLASS}`);
  tl.callbacks.onMenu?.(button.getAttribute('data-more-for'), belowMore(button));
  return true;
}
