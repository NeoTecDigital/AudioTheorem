/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The graph's geometry, pure. The model is checked (`normalizeGraph`): node
 * ids unique, every edge given a kind - `parent`, `related` (the kind of an
 * edge that names none) or `depends-on` - and an edge whose end is not in the
 * model dropped, since the host draws what it has read so far. The `parent`
 * edges make a forest (`forestOf`): a node's parent is the first edge that
 * names one, a node with none in the model is a root, and a loop of parents is
 * cut at its first node. The forest is laid out left to right
 * (`layoutGraph`): a column per depth, a row per leaf in the model's order,
 * each parent centred on its children, each root's tree stacked under the
 * last. `related` and `depends-on` edges never move a node. Every node is
 * one size, so a position is a node's top-left corner.
 */

/** Node box size in world units, the pitch of the columns and rows, and the extra room between two roots' trees. */
export const NODE_WIDTH = 208;
export const NODE_HEIGHT = 68;
export const LAYER_GAP = 288;
export const ROW_GAP = 84;
export const ROOT_GAP = 28;

/** The kinds of edge the graph draws; an edge that names another, or none, is `related`. */
export const EDGE_KINDS = Object.freeze(['parent', 'related', 'depends-on']);

const text = (value) => (value === undefined || value === null ? '' : String(value));

/** A node's time: `{iso, text, title?}` drawn as a `<time>`, or a bare string drawn as its text; anything else is none. */
function timeOf(time) {
  if (typeof time === 'string') return time.trim() === '' ? null : { iso: '', text: time, title: '' };
  if (!time || typeof time !== 'object' || !time.text) return null;
  return { iso: text(time.iso), text: String(time.text), title: text(time.title ?? time.iso) };
}

function nodeOf(node, ids) {
  const id = node?.id;
  if (typeof id !== 'string' || id.trim() === '' || ids.has(id)) throw new TypeError(`Invalid or duplicate graph node id: ${String(id)}`);
  ids.add(id);
  const count = Number(node.childCount);
  return { id, label: text(node.label ?? id), detail: text(node.detail), status: text(node.status), tone: text(node.tone),
    time: timeOf(node.time), childCount: Number.isInteger(count) && count > 0 ? count : null, collapsed: Boolean(node.collapsed) };
}

/** The model checked: unique string ids; each edge with its kind, or dropped when an end is missing or it loops on one node. */
export function normalizeGraph(nodes, edges) {
  if (!Array.isArray(nodes) || !Array.isArray(edges)) throw new TypeError('Graph nodes and edges must be arrays');
  const ids = new Set();
  const clean = nodes.map((node) => nodeOf(node, ids));
  const links = [];
  edges.forEach((edge, index) => {
    if (!ids.has(edge?.from) || !ids.has(edge?.to) || edge.from === edge.to) return;
    const kind = EDGE_KINDS.includes(edge.kind) ? edge.kind : 'related';
    links.push({ id: String(edge.id ?? `${edge.from}->${edge.to}#${index}`), from: edge.from, to: edge.to, kind, label: text(edge.label) });
  });
  return { nodes: clean, edges: links };
}

/** Free every loop of parents at its first node in the model's order, which becomes a root. */
function cutLoops(nodes, parent) {
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  for (const node of nodes) {
    const path = [];
    const seen = new Set();
    let at = node.id;
    while (parent.has(at) && !seen.has(at)) { seen.add(at); path.push(at); at = parent.get(at); }
    if (!seen.has(at)) continue;
    const loop = path.slice(path.indexOf(at));
    parent.delete(loop.reduce((first, id) => (order.get(id) < order.get(first) ? id : first)));
  }
}

/**
 * The forest the `parent` edges make.
 * @returns {{parent: Map<string, string>, children: Map<string, string[]>, roots: string[]}}
 */
export function forestOf(nodes, edges) {
  const parent = new Map();
  for (const edge of edges) if (edge.kind === 'parent' && !parent.has(edge.to)) parent.set(edge.to, edge.from);
  cutLoops(nodes, parent);
  const children = new Map(nodes.map((node) => [node.id, []]));
  const roots = [];
  for (const node of nodes) (parent.has(node.id) ? children.get(parent.get(node.id)) : roots).push(node.id);
  return { parent, children, roots };
}

/** The forest's nodes depth first, each with its level and its place among its siblings: the order a reader walks. */
export function treeRows(forest) {
  const rows = [];
  const walk = (ids, level, parentId) => ids.forEach((id, index) => {
    rows.push({ id, level, position: index + 1, size: ids.length, parentId });
    walk(forest.children.get(id), level + 1, id);
  });
  walk(forest.roots, 1, null);
  return rows;
}

/** Positions for the forest: a column per depth, a row per leaf, a parent centred on its children, roots stacked. */
export function layoutForest(forest) {
  const positions = new Map();
  let cursor = 0;
  const place = (id, depth) => {
    const kids = forest.children.get(id);
    for (const kid of kids) place(kid, depth + 1);
    const y = kids.length === 0 ? cursor : (positions.get(kids[0]).y + positions.get(kids.at(-1)).y) / 2;
    if (kids.length === 0) cursor += ROW_GAP;
    positions.set(id, { x: depth * LAYER_GAP, y });
  };
  forest.roots.forEach((root, index) => {
    if (index > 0) cursor += ROOT_GAP;
    place(root, 0);
  });
  return positions;
}

/** Positions for every node of a checked model (`normalizeGraph`): the left-to-right tree its `parent` edges make. */
export function layoutGraph(nodes, edges) {
  return layoutForest(forestOf(nodes, edges));
}

const round = (value) => Math.round(value * 10) / 10;

/** The anchors and bend of a line from box `a` to box `b`: facing sides when they stand apart, both right sides within a column. */
function anchorsOf(a, b) {
  const ay = a.y + NODE_HEIGHT / 2;
  const by = b.y + NODE_HEIGHT / 2;
  if (b.x >= a.x + NODE_WIDTH) {
    const bend = Math.max(24, (b.x - a.x - NODE_WIDTH) / 2);
    return [{ x: a.x + NODE_WIDTH, y: ay }, { x: a.x + NODE_WIDTH + bend, y: ay }, { x: b.x - bend, y: by }, { x: b.x, y: by }];
  }
  if (b.x + NODE_WIDTH <= a.x) {
    const bend = Math.max(24, (a.x - b.x - NODE_WIDTH) / 2);
    return [{ x: a.x, y: ay }, { x: a.x - bend, y: ay }, { x: b.x + NODE_WIDTH + bend, y: by }, { x: b.x + NODE_WIDTH, y: by }];
  }
  const out = Math.max(a.x, b.x) + NODE_WIDTH + 40 + Math.abs(by - ay) / 4;
  return [{ x: a.x + NODE_WIDTH, y: ay }, { x: out, y: ay }, { x: out, y: by }, { x: b.x + NODE_WIDTH, y: by }];
}

/** The point `t` of the way (0 to 1) along the curve from box `a` to box `b`: where a label stands on it. */
export function edgePoint(a, b, t) {
  const [p0, p1, p2, p3] = anchorsOf(a, b);
  const u = 1 - t;
  const along = (axis) => round(u * u * u * p0[axis] + 3 * u * u * t * p1[axis] + 3 * u * t * t * p2[axis] + t * t * t * p3[axis]);
  return { x: along('x'), y: along('y') };
}

/**
 * The curve from box `a` to box `b` as an SVG path, and its middle (where a label sits).
 * @returns {{d: string, mid: {x: number, y: number}}}
 */
export function edgePath(a, b) {
  const [p0, p1, p2, p3] = anchorsOf(a, b).map((point) => ({ x: round(point.x), y: round(point.y) }));
  return { d: `M${p0.x} ${p0.y} C${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`, mid: edgePoint(a, b, 0.5) };
}

/** The box around every position, or null for an empty graph. */
export function boundsOf(positions) {
  const all = [...positions.values()];
  if (all.length === 0) return null;
  const xs = all.map((point) => point.x);
  const ys = all.map((point) => point.y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs) + NODE_WIDTH, bottom: Math.max(...ys) + NODE_HEIGHT };
}

/**
 * What a selection lights: the node, the way up to its root (`path`), and every node an edge joins it to.
 * @returns {{path: Set<string>, lit: Set<string>}|null} null with nothing selected
 */
export function emphasisOf(selectedId, forest, edges) {
  if (selectedId === null || !forest.children.has(selectedId)) return null;
  const path = new Set([selectedId]);
  for (let at = forest.parent.get(selectedId); at !== undefined; at = forest.parent.get(at)) path.add(at);
  const lit = new Set(path);
  for (const edge of edges) {
    if (edge.from === selectedId) lit.add(edge.to);
    if (edge.to === selectedId) lit.add(edge.from);
  }
  return { path, lit };
}

/** Whether an edge stays lit under a selection: it touches the selected node, or it is a parent edge on the way up. */
export function edgeLit(edge, selectedId, emphasis) {
  if (edge.from === selectedId || edge.to === selectedId) return true;
  return edge.kind === 'parent' && emphasis.path.has(edge.from) && emphasis.path.has(edge.to);
}

/** The node an arrow, Home or End reaches from `id` along the tree, or null where there is none. */
export function treeStep(forest, rows, id, key) {
  if (key === 'Home') return rows[0]?.id ?? null;
  if (key === 'End') return rows.at(-1)?.id ?? null;
  const parentId = forest.parent.get(id);
  if (key === 'ArrowLeft') return parentId ?? null;
  if (key === 'ArrowRight') return forest.children.get(id)?.[0] ?? null;
  const siblings = parentId === undefined ? forest.roots : forest.children.get(parentId);
  const step = { ArrowUp: -1, ArrowDown: 1 }[key];
  return step === undefined ? null : siblings[siblings.indexOf(id) + step] ?? null;
}
