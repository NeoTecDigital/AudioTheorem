/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * SVG path data to polylines: `parsePath` reads a `d` attribute into absolute commands, and `flattenPath` turns
 * those into subpaths of points, each curve and arc within a tolerance of the true one. Plain math: no DOM.
 */

/** The longest path data read, in characters. */
export const PATH_LIMIT = 100000;

/** The most points one path flattens to. */
export const POINT_LIMIT = 200000;

/** The largest coordinate magnitude accepted: a 32-bit float's, since every mesh ends in a Float32Array. */
const COORD_LIMIT = 3.4028234663852886e38;

/** Halvings a curve may take before its pieces are taken as flat. */
const MAX_DEPTH = 20;

/** Arguments per argument set, by lower-case command letter. */
const ARITY = /* @__PURE__ */ Object.freeze({ m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 });

/** One number in any legal SVG form: a sign, digits with an optional fraction or a bare fraction, an exponent. */
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/** What may begin a number. */
const NUMBER_START = /[0-9.+-]/;

/** SVG's white space. */
const SPACE = /* @__PURE__ */ new Set([' ', '\t', '\n', '\r', '\f']);

/** A TypeError naming the offset (from 0) where the path data went wrong. */
function malformed(message, at) {
  return new TypeError(`svg-path: ${message} at offset ${at}`);
}

/** A value checked to fit a 32-bit float: NaN and infinities never reach a mesh. */
function checked(value, at) {
  if (!(Math.abs(value) <= COORD_LIMIT)) throw malformed('coordinate out of range', at);
  return value;
}

/** A cursor over path data. */
class Reader {
  constructor(text) {
    this.text = text;
    this.at = 0;
  }

  get done() { return this.at >= this.text.length; }

  get char() { return this.text[this.at]; }

  skipSpace() {
    while (!this.done && SPACE.has(this.char)) this.at += 1;
  }

  /** Skip white space around at most one comma; whether a comma was passed. */
  skipSeparator() {
    this.skipSpace();
    if (this.char !== ',') return false;
    this.at += 1;
    this.skipSpace();
    return true;
  }

  startsNumber() { return !this.done && NUMBER_START.test(this.char); }

  number() {
    NUMBER.lastIndex = this.at;
    const match = NUMBER.exec(this.text);
    if (!match) throw malformed('expected a number', this.at);
    const value = checked(Number(match[0]), this.at);
    this.at = NUMBER.lastIndex;
    return value;
  }

  /** An arc flag: one character, `0` or `1`, so `a1 1 0 1110 10` reads. */
  flag() {
    const char = this.char;
    if (char !== '0' && char !== '1') throw malformed('expected a flag (0 or 1)', this.at);
    this.at += 1;
    return char === '1' ? 1 : 0;
  }
}

/**
 * Path data to absolute commands, `{type, values}` as SVG 2's normalised path data shapes them: M and L take
 * `[x, y]`, C `[x1, y1, x2, y2, x, y]`, Q `[x1, y1, x, y]`, A `[rx, ry, rotation, largeArc, sweep, x, y]` (radii
 * made positive, flags 0 or 1), Z `[]`. H and V become L; S and T become C and Q with the reflected control point.
 * Malformed data throws a TypeError naming the offset; data longer than PATH_LIMIT, a RangeError.
 */
export function parsePath(d) {
  if (typeof d !== 'string') throw new TypeError('svg-path: path data must be a string');
  if (d.length > PATH_LIMIT) {
    throw new RangeError(`svg-path: path data of ${d.length} characters is over the limit of ${PATH_LIMIT}`);
  }
  const reader = new Reader(d);
  const pen = { x: 0, y: 0, startX: 0, startY: 0, cubic: null, quad: null };
  const commands = [];
  reader.skipSpace();
  while (!reader.done) {
    const letter = reader.char;
    if (!Object.hasOwn(ARITY, letter.toLowerCase())) throw malformed(`unexpected '${letter}'`, reader.at);
    if (commands.length === 0 && letter !== 'M' && letter !== 'm') {
      throw malformed('path data must begin with a moveto', reader.at);
    }
    reader.at += 1;
    readCommand(reader, letter, pen, commands);
    reader.skipSpace();
  }
  return commands;
}

/** One command letter's argument sets, repeats included: after a moveto they are linetos. */
function readCommand(reader, letter, pen, commands) {
  if (letter === 'z' || letter === 'Z') {
    commands.push({ type: 'Z', values: [] });
    Object.assign(pen, { x: pen.startX, y: pen.startY, cubic: null, quad: null });
    return;
  }
  let command = letter;
  reader.skipSpace();
  do {
    const at = reader.at;
    const next = absolute(command, readArgs(reader, command.toLowerCase()), pen, at);
    commands.push(next);
    advance(pen, next);
    if (command === 'm' || command === 'M') command = command === 'm' ? 'l' : 'L';
  } while (moreArgs(reader));
}

/** Whether another argument set follows; a comma with none after it is malformed. */
function moreArgs(reader) {
  const comma = reader.skipSeparator();
  if (reader.startsNumber()) return true;
  if (comma) throw malformed('expected a number after the comma', reader.at);
  return false;
}

/** One argument set: numbers, and an arc's two flags. */
function readArgs(reader, key) {
  const args = [];
  for (let k = 0; k < ARITY[key]; k += 1) {
    if (k > 0) reader.skipSeparator();
    args.push(key === 'a' && (k === 3 || k === 4) ? reader.flag() : reader.number());
  }
  return args;
}

/** A reflected control point about the pen, or the pen itself when the last command was not the same kind. */
function reflected(control, pen, at) {
  return control ? [checked(2 * pen.x - control[0], at), checked(2 * pen.y - control[1], at)] : [pen.x, pen.y];
}

/** One argument set as an absolute command. */
function absolute(command, args, pen, at) {
  const relative = command !== command.toUpperCase();
  const ox = relative ? pen.x : 0;
  const oy = relative ? pen.y : 0;
  const point = (k) => [checked(args[k] + ox, at), checked(args[k + 1] + oy, at)];
  switch (command.toUpperCase()) {
    case 'M': return { type: 'M', values: point(0) };
    case 'L': return { type: 'L', values: point(0) };
    case 'H': return { type: 'L', values: [checked(args[0] + ox, at), pen.y] };
    case 'V': return { type: 'L', values: [pen.x, checked(args[0] + oy, at)] };
    case 'C': return { type: 'C', values: [...point(0), ...point(2), ...point(4)] };
    case 'S': return { type: 'C', values: [...reflected(pen.cubic, pen, at), ...point(0), ...point(2)] };
    case 'Q': return { type: 'Q', values: [...point(0), ...point(2)] };
    case 'T': return { type: 'Q', values: [...reflected(pen.quad, pen, at), ...point(0)] };
    default: return { type: 'A', values: [Math.abs(args[0]), Math.abs(args[1]), ...args.slice(2, 5), ...point(5)] };
  }
}

/** The pen after a command: its end point, a moveto's subpath start, the control points S and T reflect. */
function advance(pen, { type, values }) {
  pen.x = values[values.length - 2];
  pen.y = values[values.length - 1];
  if (type === 'M') [pen.startX, pen.startY] = [pen.x, pen.y];
  pen.cubic = type === 'C' ? [values[2], values[3]] : null;
  pen.quad = type === 'Q' ? [values[0], values[1]] : null;
}

/** Subpaths being traced: the open one's points, its start, the pen, and the points finished so far. */
class Polyline {
  constructor() {
    this.subpaths = [];
    this.points = null;
    this.x = 0;
    this.y = 0;
    this.startX = 0;
    this.startY = 0;
    this.total = 0;
  }

  moveTo(x, y) {
    this.finish(false);
    [this.startX, this.startY, this.x, this.y] = [x, y, x, y];
  }

  lineTo(x, y) {
    this.open();
    if (x !== this.x || y !== this.y) this.push(x, y);
  }

  close() {
    this.open();
    this.finish(true);
    [this.x, this.y] = [this.startX, this.startY];
  }

  /** Throws when `count` more points would pass POINT_LIMIT. */
  reserve(count) {
    const used = this.total + (this.points ? this.points.length / 2 : 0);
    if (used + count > POINT_LIMIT) {
      throw new RangeError(`svg-path: the path flattens to more than ${POINT_LIMIT} points`);
    }
  }

  /** A drawing command after a moveto or a closepath starts a subpath at the start point. */
  open() {
    if (this.points) return;
    this.points = [];
    this.push(this.startX, this.startY);
  }

  push(x, y) {
    if (!(Math.abs(x) <= COORD_LIMIT && Math.abs(y) <= COORD_LIMIT)) {
      throw new TypeError('svg-path: a point is out of range');
    }
    this.reserve(1);
    this.points.push(x, y);
    [this.x, this.y] = [x, y];
  }

  finish(closed) {
    const points = this.points;
    this.points = null;
    if (!points) return;
    const n = points.length;
    if (closed && n > 2 && points[0] === points[n - 2] && points[1] === points[n - 1]) points.length = n - 2;
    this.total += points.length / 2;
    this.subpaths.push({ points: Float64Array.from(points), closed });
  }
}

/**
 * Path data to subpaths, each `{points, closed}`. `points` is a Float64Array of x, y pairs - flat, one allocation
 * per subpath - with consecutive duplicates dropped; a closed subpath does not repeat its first point. A moveto
 * nothing draws from makes no subpath. Curves are halved until each piece's control points lie within `tolerance`
 * of its chord (so the curve does too); arcs follow the SVG implementation notes. Past POINT_LIMIT points it throws
 * a RangeError; a tolerance that is not a positive finite number, a TypeError.
 */
export function flattenPath(d, tolerance = 0.25) {
  if (typeof tolerance !== 'number' || !(tolerance > 0 && tolerance < Infinity)) {
    throw new TypeError('svg-path: tolerance must be a positive finite number');
  }
  const line = new Polyline();
  for (const command of parsePath(d)) trace(line, command, tolerance);
  line.finish(false);
  return line.subpaths;
}

/** One absolute command traced onto the polyline. */
function trace(line, { type, values: v }, tolerance) {
  const { x, y } = line;
  switch (type) {
    case 'M': line.moveTo(v[0], v[1]); break;
    case 'L': line.lineTo(v[0], v[1]); break;
    case 'C': cubicTo(line, [x, y, ...v], tolerance); break;
    case 'Q': {
      const third = 2 / 3;
      const curve = [x, y, x + third * (v[0] - x), y + third * (v[1] - y), v[2] + third * (v[0] - v[2]),
        v[3] + third * (v[1] - v[3]), v[2], v[3]];
      cubicTo(line, curve, tolerance);
      break;
    }
    case 'A': arcTo(line, x, y, v, tolerance); break;
    default: line.close();
  }
}

/** Squared distance from a point to the segment a-b. */
function segmentDistance2(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / length2)) : 0;
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

/** A cubic's two halves (de Casteljau at t = 0.5), one halving deeper. */
function halve([x0, y0, x1, y1, x2, y2, x3, y3, depth]) {
  const [ax, ay, bx, by] = [(x0 + x1) / 2, (y0 + y1) / 2, (x1 + x2) / 2, (y1 + y2) / 2];
  const [cx, cy, dx, dy] = [(x2 + x3) / 2, (y2 + y3) / 2, (ax + bx) / 2, (ay + by) / 2];
  const [ex, ey] = [(bx + cx) / 2, (by + cy) / 2];
  const [mx, my] = [(dx + ex) / 2, (dy + ey) / 2];
  return [[x0, y0, ax, ay, dx, dy, mx, my, depth + 1], [mx, my, ex, ey, cx, cy, x3, y3, depth + 1]];
}

/**
 * A cubic `[x0, y0, x1, y1, x2, y2, x3, y3]` by adaptive halving: a piece is flat once both inner control points lie
 * within `tolerance` of its chord - the curve stays in its control points' hull, so it lies that close too.
 */
function cubicTo(line, curve, tolerance) {
  const limit = tolerance * tolerance;
  const stack = [[...curve, 0]];
  while (stack.length > 0) {
    const c = stack.pop();
    const flat = Math.max(segmentDistance2(c[2], c[3], c[0], c[1], c[6], c[7]),
      segmentDistance2(c[4], c[5], c[0], c[1], c[6], c[7]));
    if (flat <= limit || c[8] >= MAX_DEPTH) {
      line.lineTo(c[6], c[7]);
      continue;
    }
    const [left, right] = halve(c);
    stack.push(right, left);
  }
}

/**
 * The SVG implementation notes' endpoint-to-centre conversion (F.6.5), radii scaled up when too small (F.6.6), in
 * unit-circle terms so no radius is squared; null when the arc is a line (a zero radius, or radii past float range).
 */
function arcEllipse(x0, y0, [rxIn, ryIn, rotation, largeArc, sweep, x, y]) {
  let [rx, ry] = [Math.abs(rxIn), Math.abs(ryIn)];
  if (rx === 0 || ry === 0) return null;
  const phi = ((rotation % 360) * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const [hx, hy] = [(x0 - x) / 2, (y0 - y) / 2];
  let px = (cos * hx + sin * hy) / rx;
  let py = (cos * hy - sin * hx) / ry;
  const lambda = px * px + py * py;
  if (!(lambda > 0 && lambda < Infinity)) return null;
  let root = 0;
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    [rx, ry, px, py] = [rx * scale, ry * scale, px / scale, py / scale];
  } else {
    root = Math.sqrt((1 - lambda) / lambda) * (largeArc === sweep ? -1 : 1);
  }
  const [cxp, cyp] = [root * rx * py, -root * ry * px];
  const theta = Math.atan2(py + root * px, px - root * py);
  let delta = Math.atan2(root * px - py, -px - root * py) - theta;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  const [cx, cy] = [cos * cxp - sin * cyp + (x0 + x) / 2, sin * cxp + cos * cyp + (y0 + y) / 2];
  return { cx, cy, rx, ry, cos, sin, theta, delta };
}

/**
 * An elliptical arc in equal parameter steps: a step h strays at most h^2 / 8 * max(rx, ry) from the ellipse,
 * so h = sqrt(8 * tolerance / max(rx, ry)). The end point is written exactly; equal end points draw nothing.
 */
function arcTo(line, x0, y0, values, tolerance) {
  const [x, y] = [values[5], values[6]];
  if (x0 === x && y0 === y) return;
  const e = arcEllipse(x0, y0, values);
  if (!e) {
    line.lineTo(x, y);
    return;
  }
  const steps = Math.max(1, Math.ceil(Math.abs(e.delta) / Math.sqrt((8 * tolerance) / Math.max(e.rx, e.ry))));
  line.reserve(steps);
  for (let k = 1; k < steps; k += 1) {
    const t = e.theta + (e.delta * k) / steps;
    const [ex, ey] = [e.rx * Math.cos(t), e.ry * Math.sin(t)];
    line.lineTo(e.cx + e.cos * ex - e.sin * ey, e.cy + e.sin * ex + e.cos * ey);
  }
  line.lineTo(x, y);
}
