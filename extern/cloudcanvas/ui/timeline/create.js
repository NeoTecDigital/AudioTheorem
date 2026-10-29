/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Making a span by dragging across the empty part of a row - a bar's, or a
 * group heading's - wherever the bar is: the axis reaches the sheet's edges
 * (`./reach.js`). A band follows the pointer, from the day the press was on to
 * the day the pointer is on, either way round, a day at least and no further
 * than the track is drawn; held near an edge of the sheet, the sheet scrolls
 * and the band follows (`./edge.js`). The release reports
 * `onCreate({groupId, start, end})` - end exclusive - for the group whose row
 * it was (null for a row with no group), and Escape drops the band. While the
 * band is drawn a host's update waits: the sheet is drawn again when the drag
 * ends. Nothing is made by the kit. The keyboard's way to the same report is
 * `./draw.js`, which draws its band as this one is drawn.
 *
 * THE BAND SAYS ITS DAYS IN A TAG OF ITS OWN, hung below it: a bar's title is
 * drawn beside the bar, on the row's middle, where a band over those days
 * would write its dates too. The tag stands under that line, inside the row,
 * on the sheet's surface.
 */
import { el } from '../dom.js';
import { trackDrag } from '../drag.js';
import { addDays } from '../calendar/dates.js';
import { TL, TIMELINE_SCALES, dayAt, daysIn } from './model.js';

const TRACK = `.${TL}-track`;

/** The span from day `from` to day `to` (counted from the domain's start), either way round, both in. */
export function spanOf(tl, from, to) {
  const first = Math.min(from, to);
  const days = Math.abs(to - from) + 1;
  const start = addDays(tl.domain.start, first);
  return { start, end: addDays(start, days), first, days };
}

/** A band for a span, with the tag its days are written in (`writeBand`); `className` is the keyboard's when it draws it. */
export function bandNode(tl, className = `${TL}-draft`) {
  const band = el(tl.doc, 'div', { className, attrs: { 'aria-hidden': 'true' } });
  band.append(el(tl.doc, 'span', { className: `${TL}-draft-words` }));
  return band;
}

/** A band over `span`'s days, saying them in its tag: "Sep 28", or "Sep 28 – Oct 1". */
export function writeBand(tl, band, span) {
  const perDay = TIMELINE_SCALES[tl.state.scale].perDay;
  band.style.setProperty('--timeline-x', `${span.first * perDay}px`);
  band.style.setProperty('--timeline-w', `${span.days * perDay}px`);
  const last = addDays(span.end, -1);
  band.firstChild.textContent = span.days === 1 ? tl.format.format(span.start) : `${tl.format.format(span.start)} – ${tl.format.format(last)}`;
}

/** The day the pointer is over, counted from the domain's start; a pointer past either end of the track is on its first or last day. */
function dayUnder(tl, creating, point) {
  const day = dayAt(point.x - creating.track.getBoundingClientRect().left, tl.state.scale);
  return Math.min(daysIn(tl.domain) - 1, Math.max(0, day));
}

function drawBand(tl, creating, point) {
  const span = spanOf(tl, creating.from, dayUnder(tl, creating, point));
  writeBand(tl, creating.band, span);
  creating.span = span;
}

function endCreate(tl, point) {
  const creating = tl.state.creating;
  tl.state.creating = null;
  creating.band.remove();
  if (point !== null && creating.span) {
    tl.callbacks.onCreate({ groupId: creating.groupId, start: creating.span.start, end: creating.span.end });
  }
  tl.render();
}

/** Wire the drag across a row's empty track. */
export function bindCreate(tl) {
  const follow = (point) => { if (tl.state.creating) drawBand(tl, tl.state.creating, point); };
  trackDrag(tl.life, tl.sheet, {
    selector: TRACK,
    canStart: (track, event) => typeof tl.callbacks.onCreate === 'function' && !tl.state.pending && event.target === track,
    onStart(track, point) {
      const band = bandNode(tl);
      track.append(band);
      tl.state.creating = { track, band, groupId: track.getAttribute('data-group-id'), span: null, from: 0 };
      tl.state.creating.from = dayUnder(tl, tl.state.creating, point);
      tl.paint();
    },
    onMove(point) {
      follow(point);
      tl.edge.follow(point, follow);
    },
    onEnd(point) {
      tl.edge.stop();
      if (tl.state.creating) endCreate(tl, point);
    }
  });
}
