/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The flag a badge can be drawn as: an inline SVG marker, planted beside its
 * label the way a map places a marker.
 *
 *   const flag = createFlag(doc);
 *   host.append(flag.node);
 *   flag.write('99+');   // sized to the figure; '' is an empty pennant
 *
 * A STAFF AND A PENNANT. The staff stands on the leading edge under a round
 * finial; the pennant flies from it, as wide as the figure needs, with a notch
 * cut into its trailing edge. The figure sits in the pennant's solid part.
 *
 * IT HAS DEPTH, AND STRAIGHT EDGES. Light falls from above: a sheen runs down
 * the pennant, its top edge and the staff's leading side are lit, the cloth is
 * in shade where it meets the staff and where its tail folds under, and the
 * sheet lets the whole marker cast a small shadow. Every edge but the notch
 * lies on the pixel grid - one unit of the view box is one pixel - so the
 * depth costs no sharpness at 1x or 2x.
 *
 * NO COLOUR OF ITS OWN. Each part carries a class and the sheet paints it: the
 * pennant in `currentColor` (the badge's tone), the figure, the staff, the
 * light and the shade from tokens. The one `fill` written here points at this
 * flag's own gradient. The marker is not there for assistive technology.
 */
import { svg, textNode, uniqueId, writeText } from './dom.js';

const CLASS = 'cloudcanvas-ui-badge-flag';

/**
 * The flag's measures, in CSS pixels. The marker is `height` tall and the
 * pennant runs from `top` to `bottom`, so the finial stands above the cloth
 * and the staff's foot below it - which is what plants it. The cloth starts at
 * `hoist`, where the staff ends. `glyph` is the advance of one character of
 * the figure at the badge's type size, `pad` the room either side of the
 * figure, `notch` the depth of the cut, `min` the width of an empty pennant.
 */
const SIZE = /* @__PURE__ */ Object.freeze({ height: 20, top: 2, bottom: 18, hoist: 3, pad: 3, glyph: 6.5, notch: 4, min: 19 });

/** How strongly light and shade lie over the tone: enough to turn a flat shape, never enough to cost the figure its contrast. */
const DEPTH = /* @__PURE__ */ Object.freeze({ sheen: 0.26, under: 0.18, edge: 0.3, staff: 0.45, glint: 0.7, hoist: 0.25, fold: 0.18 });

/** The whole pixels a flag needs for `figure`: the staff, the figure with room either side, and the notch. */
function flagWidth(figure) {
  const { hoist, pad, glyph, notch, min } = SIZE;
  return Math.max(min, Math.ceil(hoist + pad * 2 + figure.length * glyph + notch));
}

/** The pennant's outline at `width`: straight along the top and the bottom, its two tips eased, the notch cut back to the middle. */
function pennantPath(width) {
  const { top, bottom, hoist, notch } = SIZE;
  return `M${hoist} ${top}H${width - 1}Q${width} ${top} ${width - 0.5} ${top + 0.9}L${width - notch} ${(top + bottom) / 2}`
    + `L${width - 0.5} ${bottom - 0.9}Q${width} ${bottom} ${width - 1} ${bottom}H${hoist}Z`;
}

/** The lower tail at `width`: the cloth that folds under, from the notch down to the bottom tip. */
function foldPath(width) {
  const { top, bottom, notch } = SIZE;
  return `M${width - notch} ${(top + bottom) / 2}L${width - 0.5} ${bottom - 0.9}Q${width} ${bottom} ${width - 1} ${bottom}H${width - notch - 2}Z`;
}

/** The sheen, as this flag's own gradient: lit from the top edge to just past the middle, in shade from there to the bottom. */
function sheenDefs(doc, id) {
  const gradient = svg(doc, 'linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
  const stops = [[0, 'lit', DEPTH.sheen], [0.55, 'lit', 0], [0.55, 'shaded', 0], [1, 'shaded', DEPTH.under]];
  gradient.append(...stops.map(([offset, light, opacity]) => svg(doc, 'stop', { class: `${CLASS}-${light}`, offset, 'stop-opacity': opacity })));
  const defs = svg(doc, 'defs');
  defs.append(gradient);
  return defs;
}

/** The staff: a rod with a lit leading side, and the finial with its glint - apart, because the finial is drawn over the cloth. */
function staffParts(doc) {
  const { height, top, hoist } = SIZE;
  return {
    rod: [svg(doc, 'rect', { class: `${CLASS}-staff`, x: 1, y: 1, width: hoist - 1, height: height - 1, rx: 1 }),
      svg(doc, 'rect', { class: `${CLASS}-lit`, x: 1, y: top + 1, width: 1, height: height - top - 2, opacity: DEPTH.staff })],
    finial: [svg(doc, 'circle', { class: `${CLASS}-staff`, cx: 2, cy: 2, r: 2 }),
      svg(doc, 'circle', { class: `${CLASS}-lit`, cx: 1.5, cy: 1.5, r: 0.8, opacity: DEPTH.glint })]
  };
}

/** The cloth, back to front: the pennant in the tone, the sheen over it, the shade at the hoist, the fold in the tail, the lit top edge. */
function clothParts(doc, id) {
  const { top, bottom, hoist } = SIZE;
  return {
    pennant: svg(doc, 'path', { class: `${CLASS}-pennant` }),
    sheen: svg(doc, 'path', { fill: `url(#${id})` }),
    hoist: svg(doc, 'rect', { class: `${CLASS}-shaded`, x: hoist, y: top, width: 1, height: bottom - top, opacity: DEPTH.hoist }),
    fold: svg(doc, 'path', { class: `${CLASS}-shaded`, opacity: DEPTH.fold }),
    edge: svg(doc, 'rect', { class: `${CLASS}-lit`, x: hoist, y: top, height: 1, opacity: DEPTH.edge })
  };
}

/** Size the marker to `width`: its box, the cloth's outlines, and the figure centred in the solid part between the staff and the notch. */
function fit(node, cloth, figure, width) {
  const { height, hoist, notch } = SIZE;
  const outline = pennantPath(width);
  node.setAttribute('width', String(width));
  node.setAttribute('viewBox', `0 0 ${width} ${height}`);
  cloth.pennant.setAttribute('d', outline);
  cloth.sheen.setAttribute('d', outline);
  cloth.fold.setAttribute('d', foldPath(width));
  cloth.edge.setAttribute('width', String(width - hoist - 1));
  figure.setAttribute('x', String((hoist + width - notch) / 2));
}

/**
 * @param {Document} doc
 * @returns {{node: SVGSVGElement, write(figure: string): void}} `node` is the marker; `write` draws a figure in it and sizes it to fit
 */
export function createFlag(doc) {
  const id = uniqueId(CLASS);
  const node = svg(doc, 'svg', { class: CLASS, height: SIZE.height, 'aria-hidden': 'true', focusable: 'false' });
  const staff = staffParts(doc);
  const cloth = clothParts(doc, id);
  const figure = svg(doc, 'text', { class: `${CLASS}-figure`, y: (SIZE.top + SIZE.bottom) / 2, dy: '0.35em' });
  const text = textNode(doc, figure);
  node.append(sheenDefs(doc, id), ...staff.rod, ...Object.values(cloth), ...staff.finial, figure);
  let drawn = 0;
  return {
    node,
    write(value) {
      const width = flagWidth(value);
      writeText(text, value);
      if (width === drawn) return;
      drawn = width;
      fit(node, cloth, figure, width);
    }
  };
}
