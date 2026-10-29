/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * What the timeline and the calendar share for drawing by keyboard what a
 * drag across empty ground draws (`./timeline/draw.js`, `./calendar/draw.js`):
 * the key that starts it, the hint line said as a sentence, and the ends a
 * reader does not ask for in words - a press on the view, the focus leaving
 * it - which cancel it.
 */

/** Whether `event` is the key that starts a drawing: N, alone or with Shift. */
export function isDrawKey(event) {
  return (event.key === 'n' || event.key === 'N') && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/** A hint line as a sentence: "a · b" is "a, b." */
export function asSentence(line) {
  return `${line.split(' · ').join(', ')}.`;
}

/**
 * Cancel a drawing in `container` (`active()` says one is in hand) on a press anywhere in it, and when the focus has left
 * it: looked at once the focus has settled, so a redraw that hands the focus back is no leaving.
 */
export function cancelOnLeave(life, container, { active, cancel }) {
  life.on(container, 'pointerdown', () => { if (active()) cancel(); }, { capture: true });
  life.on(container, 'focusout', () => {
    if (!active()) return;
    life.later(() => { if (active() && !container.contains(container.ownerDocument.activeElement)) cancel(); }, 0);
  });
}
