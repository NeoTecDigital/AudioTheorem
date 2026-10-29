/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Where the graph's edge labels stand. A label is a chip on its edge, centred
 * on the edge's middle; two labels whose chips would touch are not left on
 * top of each other: each, in the order the edges are drawn, takes the nearest
 * place along its own edge where it touches none placed before it. A label
 * that finds none stays where it overlaps least. Pure: the sizes are estimates
 * (a character is `CHAR_PX` wide, generously), so no layout is read.
 */

/** A character's width, a chip's padding either side and its height (px), and the room two chips keep apart. */
const CHAR_PX = 6.6;
const PAD_PX = 4;
const HEIGHT_PX = 16;
const GAP_PX = 2;

/** How far along its edge a label may move from the middle (a fraction of the curve), and in what steps. */
const REACH = 0.3;
const STEP = 0.025;

/** The chip a label's words need. */
export const labelSize = (text) => ({ width: Math.ceil(text.length * CHAR_PX) + PAD_PX * 2, height: HEIGHT_PX });

const lap = (a, b) => Math.max(0, Math.min(a.x + a.width / 2, b.x + b.width / 2) - Math.max(a.x - a.width / 2, b.x - b.width / 2) + GAP_PX)
  * Math.max(0, Math.min(a.y + a.height / 2, b.y + b.height / 2) - Math.max(a.y - a.height / 2, b.y - b.height / 2) + GAP_PX);

/** The places a label may take along its edge, the middle first and then outward, either side by turns. */
const OFFSETS = Array.from({ length: Math.round(REACH / STEP) * 2 + 1 }, (_, at) => (at === 0 ? 0 : (at % 2 === 1 ? 1 : -1) * Math.ceil(at / 2) * STEP));

/**
 * The chip of each label, centred where it stands: `{x, y, width, height}`.
 * @param {{text: string, at: (t: number) => {x: number, y: number}}[]} labels in the order the edges are drawn; `at(t)` is the point `t` of the way along the edge
 */
export function placeLabels(labels) {
  const placed = [];
  for (const { text, at } of labels) {
    const size = labelSize(text);
    const chips = OFFSETS.map((offset) => ({ ...at(0.5 + offset), ...size }));
    const overlap = (chip) => placed.reduce((sum, other) => sum + lap(chip, other), 0);
    placed.push(chips.find((chip) => overlap(chip) === 0) ?? chips.reduce((best, chip) => (overlap(chip) < overlap(best) ? chip : best)));
  }
  return placed;
}
