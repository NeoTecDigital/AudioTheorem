/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Dependencies, drawn and made. An item that `depends` on others has a
 * connector from each dependency's end to its own start: an elbow with an
 * arrowhead at the dependent, in a layer of SVG over the rows (the pair is
 * where the bars stand, measured).
 *
 * A CONNECTOR IS A PICTURE. It has no role, name, tab stop or press of its own
 * and the layer is hidden from assistive technology: what it says is said by
 * the bar it ends at ("..., depends on Brief"), and a link is taken away by
 * the item's own menu, which reaches the pointer, the keyboard and a finger
 * alike. It once took a press and Delete from the pointer alone, said "button"
 * to a screen reader that could do nothing with it, and its hit stroke took the
 * press from every bar its line crossed.
 *
 * A link is made from the handle beside a bar's right edge (`onLink`, given):
 * dragged to another bar - or its title - it reports `onLink(fromId, toId)`,
 * a line following the pointer and the bar it would link to lit. However the
 * drag ends the bar it began on has the focus (the handle holds none). What a
 * link means (which depends on which) is the host's.
 */
import { itemIdOf, svg } from '../dom.js';
import { trackDrag } from '../drag.js';
import { TL } from './model.js';
import { bars } from './move.js';

const LINKS = `${TL}-links`;
/** The room a connector leaves a bar before it turns. */
const GAP = 12;

/** The elbow from `a` (a dependency's end) to `b` (the dependent's start): by the middle, or round the back between the rows. */
export function elbowPath(a, b) {
  if (b.x - a.x >= 2 * GAP) return `M${a.x} ${a.y} H${Math.round((a.x + b.x) / 2)} V${b.y} H${b.x}`;
  const between = Math.round((a.y + b.y) / 2);
  return `M${a.x} ${a.y} H${a.x + GAP} V${between} H${b.x - GAP} V${b.y} H${b.x}`;
}

/** Where a bar's end and start are, in the layer's own coordinates: the right and left edges, at the middle of the bar. */
function placeOf(layerBox, bar) {
  const box = bar.getBoundingClientRect();
  const y = Math.round(box.top - layerBox.top + box.height / 2);
  return { end: { x: Math.round(box.right - layerBox.left), y }, start: { x: Math.round(box.left - layerBox.left), y } };
}

/** The pairs `[dependencyId, dependentId]` the sheet draws both ends of, in the order the items are drawn. */
function pairsOf(tl, places) {
  return tl.state.items.flatMap((item) => item.depends.filter((id) => places.has(id) && places.has(item.id)).map((id) => [id, item.id]));
}

function connectorNode(tl, [from, to], places) {
  const group = svg(tl.doc, 'g', { class: `${TL}-connector`, 'data-from': from, 'data-to': to });
  group.append(svg(tl.doc, 'path', { class: `${TL}-connector-line`, d: elbowPath(places.get(from).end, places.get(to).start), 'marker-end': `url(#${tl.id}-arrow)` }));
  return group;
}

function arrowDefs(tl) {
  const marker = svg(tl.doc, 'marker', { id: `${tl.id}-arrow`, viewBox: '0 0 10 10', refX: 10, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' });
  marker.append(svg(tl.doc, 'path', { d: 'M0,0 L10,5 L0,10 z', class: `${TL}-arrow` }));
  const defs = svg(tl.doc, 'defs', {});
  defs.append(marker);
  return defs;
}

/** The layer the connectors are drawn in, empty: `drawLinks` fills it once the sheet is on the page and its bars can be measured. */
export function linksLayer(tl) {
  tl.links = svg(tl.doc, 'svg', { class: LINKS, width: 1, height: 1, 'aria-hidden': 'true' });
  return tl.links;
}

/** Draw a connector for every dependency whose two bars are drawn. */
export function drawLinks(tl) {
  const layerBox = tl.links.getBoundingClientRect();
  const places = new Map(bars(tl).map((bar) => [bar.getAttribute('data-ui-id'), placeOf(layerBox, bar)]));
  tl.links.replaceChildren(arrowDefs(tl), ...pairsOf(tl, places).map((pair) => connectorNode(tl, pair, places)));
}

/** The bar a point is over - its face or its title - other than `fromId`, or null. */
function targetUnder(tl, point, fromId) {
  const id = itemIdOf(tl.doc.elementFromPoint?.(point.x, point.y));
  return id !== null && id !== fromId && bars(tl).some((bar) => bar.getAttribute('data-ui-id') === id) ? id : null;
}

function light(tl, id) {
  for (const bar of bars(tl)) bar.classList.toggle('is-drop-target', bar.getAttribute('data-ui-id') === id);
}

function drawDraft(tl, linking, point) {
  const box = tl.links.getBoundingClientRect();
  linking.draft.setAttribute('d', `M${linking.from.x} ${linking.from.y} L${Math.round(point.x - box.left)} ${Math.round(point.y - box.top)}`);
}

function startLink(tl, handle) {
  const fromId = handle.getAttribute('data-link-from');
  const bar = bars(tl).find((node) => node.getAttribute('data-ui-id') === fromId);
  const from = placeOf(tl.links.getBoundingClientRect(), bar).end;
  const draft = svg(tl.doc, 'path', { class: `${TL}-draft-link`, d: `M${from.x} ${from.y}` });
  tl.links.append(draft);
  tl.state.linking = { fromId, from, draft, target: null };
  tl.paint();
}

/**
 * The handle cannot hold focus, so the press on it left the focus on whatever can (a host's pane), where the keys of the sheet
 * - Ctrl/Cmd-Z among them - are not heard. However the drag ended, the bar it began on has it back, and nothing scrolls.
 */
function endLink(tl, point) {
  const { fromId, draft, target } = tl.state.linking;
  tl.state.linking = null;
  draft.remove();
  light(tl, null);
  tl.state.focusId = fromId;
  tl.focusAfter = 'keep';
  if (point !== null && target) tl.callbacks.onLink(fromId, target);
  tl.render();
}

/** Wire the pointer's drag from a handle. */
export function bindLinks(tl) {
  trackDrag(tl.life, tl.sheet, {
    selector: `.${TL}-link`,
    canStart: () => typeof tl.callbacks.onLink === 'function' && !tl.state.pending && !tl.state.creating,
    onStart(handle) { startLink(tl, handle); },
    onMove(point) {
      const linking = tl.state.linking;
      if (!linking) return;
      drawDraft(tl, linking, point);
      linking.target = targetUnder(tl, point, linking.fromId);
      light(tl, linking.target);
    },
    onEnd(point) { if (tl.state.linking) endLink(tl, point); }
  });
}
