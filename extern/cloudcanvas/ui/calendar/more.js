/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The calendar's "more" button (`../item-more.js`): one, straight after the selected event's chip, drawn only while the
 * host takes a menu and nothing is in hand (an event being moved or resized, a range being dragged). A chip is a button,
 * so the button cannot be inside it: it stands beside it, in the day's list (the month and the all-day strip) on the
 * chip's own row, or in the day's column (the hour grid) with the chip's own place and lane, and the chip - marked
 * `is-holding-more` - keeps the room at its end for it, so it covers neither the title nor the time nor the grip.
 *
 * IT TAKES A THIRD OF A CHIP AT MOST. At 390px a chip of the week's all-day strip is about 57px wide, and a finger's 44px button
 * would leave its title none. A chip too narrow for the button (`roomForMore`, measured with the button where the sheet puts it)
 * gets none and holds no room for it; the menu is still its right-click, Shift+F10 and a held touch, and the hint says so
 * (`cal.crowded`). A touch that taps the chip selects it as it always did.
 *
 * IT WAITS FOR A PRESS TO END. A press on a chip focuses it, which selects it; were the button to stand then, under the
 * pointer, the click that ends the press would be the click of the chip's and the button's common ancestor - the day's list,
 * whose click opens a day - and not the chip's. So while a press is down the button stays where it was, and stands when the
 * press has had its click (or, a press that is no click - a drag - a moment after it).
 */
import { MORE_CLASS, belowMore, isMore, moreButton, nameMore, roomForMore } from '../item-more.js';
import { CAL } from './month.js';

/** The geometry a timed chip is placed by; the button takes the same, so it is where the chip's end is. */
const PLACE = Object.freeze(['--calendar-top', '--calendar-lane', '--calendar-lanes', '--calendar-length']);

/** The first chip drawn for event `id`: an event on several days has a chip on each. */
function chipOf(cal, id) {
  return Array.from(cal.body.querySelectorAll(`.${CAL}-event`)).find((chip) => chip.getAttribute('data-ui-id') === id) ?? null;
}

/** Put the button on its chip's row in a list the chips stand in (the month, the all-day strip): the chip's own row of the grid. */
function placeInList(button, chip) {
  const row = Array.from(chip.parentElement.children).filter((node) => node !== button).indexOf(chip) + 1;
  button.style.setProperty('grid-row', `${row} / ${row + 1}`);
  for (const name of PLACE) button.style.removeProperty(name);
}

/** Put the button where a timed chip stands in its column. */
function placeInColumn(button, chip) {
  button.style.removeProperty('grid-row');
  for (const name of PLACE) button.style.setProperty(name, chip.style.getPropertyValue(name));
}

/** How long (ms) after a press that is no click - a drag, a hold - the button stands: a click follows its press at once. */
const PRESS_MS = 400;

/**
 * Take the button away from `chip`, which is then not holding room for it. The focus it held, a resize taking it from under the
 * reader, goes to the chip: the same item, one stop before.
 */
function dropMore(cal, chip) {
  const held = cal.more !== undefined && cal.doc.activeElement === cal.more;
  cal.more?.remove();
  chip?.classList.remove('is-holding-more');
  if (held) chip?.focus({ preventScroll: true });
}

/** Put the button after the selected event's chip, or take it away. A press that is down leaves it where it is. */
export function syncMore(cal) {
  const { state } = cal;
  const taken = typeof cal.callbacks.onMenu === 'function' && !state.pending && !state.creating;
  const chip = taken && state.selectedId !== null ? chipOf(cal, state.selectedId) : null;
  if (cal.pressing && chip) return;
  for (const node of cal.body.querySelectorAll('.is-holding-more')) if (node !== chip) node.classList.remove('is-holding-more');
  cal.crowded = false;
  if (!chip) {
    dropMore(cal, null);
    return;
  }
  cal.more ??= moreButton(cal.doc, `${CAL}-more-actions`);
  nameMore(cal.more, cal.labels.more, state.events.find((event) => event.id === state.selectedId)?.title ?? '');
  cal.more.setAttribute('data-more-for', state.selectedId);
  const timed = chip.classList.contains(`${CAL}-timed`);
  cal.more.classList.toggle('is-timed', timed);
  if (cal.more.previousElementSibling !== chip) chip.after(cal.more);
  (timed ? placeInColumn : placeInList)(cal.more, chip);
  // The button is measured where the sheet puts it, which is the only place its size is known (a finger's is 44px, a pointer's 24).
  cal.crowded = !roomForMore(chip.getBoundingClientRect().width, cal.more.getBoundingClientRect().width);
  if (cal.crowded) dropMore(cal, chip);
  else chip.classList.add('is-holding-more');
}

/** A press on the button: the menu of the event it stands by, under it. True when it was the button's. */
export function pressMore(cal, target) {
  if (!isMore(target)) return false;
  const button = target.closest(`.${MORE_CLASS}`);
  cal.callbacks.onMenu?.(button.getAttribute('data-more-for'), belowMore(button));
  return true;
}

/** Watch the presses on the body: the button waits for each to end. Bound after the body's own click, so it runs after it. */
export function bindMore(cal) {
  const end = () => {
    if (!cal.pressing) return;
    cal.pressing = false;
    syncMore(cal);
  };
  cal.life.on(cal.body, 'pointerdown', () => { cal.pressing = true; }, { capture: true });
  cal.life.on(cal.body, 'click', end);
  cal.life.on(cal.body, 'pointerup', () => cal.life.later(end, PRESS_MS));
  cal.life.on(cal.body, 'pointercancel', end);
}
