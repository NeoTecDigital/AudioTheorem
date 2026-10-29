/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Graph: a mind map - a tree laid out left to right, with links across it -
 * on a pannable, zoomable surface.
 *
 *   const graph = createGraph(host, {
 *     onActivate: (id) => open(id), onToggle: (id, collapsed) => fold(id, collapsed),
 *     onDropOn: (id, targetId) => reparent(id, targetId), onConnect: (fromId, toId) => link(fromId, toId),
 *     onAdd: (parentId) => addChild(parentId), onDelete: (id) => remove(id), onMenu: (id, point) => menu(id, point),
 *     onViewport: (view) => save(view), onQuery: (text) => remember(text)
 *   });
 *   graph.update({ label: 'Plan', selectedId: 'a', query: '', focusId: null, viewport: { x: 0, y: 0, scale: 1 },
 *     nodes: [{ id: 'a', label: 'Plan', status: 'Doing', time: { iso: '2026-10-12', text: 'Mon' }, childCount: 1 }, { id: 'b', label: 'Launch' }],
 *     edges: [{ from: 'a', to: 'b', kind: 'parent' }] });
 *
 * NOTHING IS APPLIED BY THE KIT. It draws the model and reports: a fold, a
 * drop on a node, a link, an add or a delete is a callback, and the graph
 * shows what the next model says. Folded nodes' children are simply absent
 * from the model; the host decides. The layout is computed (`./layout.js`),
 * so positions are never stored, and a node let go anywhere but on another
 * node springs back.
 *
 * WHAT IT KEEPS is the reader's own: the view (reported, debounced, as
 * `onViewport`, restored from `viewport`), the search box (`query` from the
 * model when it changes; typing dims and reports `onQuery`), the tab stop,
 * and the selection the arrows move (`selectedId` from the model when it
 * changes). The selected node, its way up to the root and its neighbours
 * are emphasised and the rest dim; `focusId` pans its node into view. A
 * selection or a focus the model names before it draws the node (still
 * being read, or inside a folded parent) waits and is taken once, when a
 * model draws it - the model's selection again after it was folded away and
 * back - unless the reader selects, pans or zooms meanwhile. The
 * hint under the toolbar says what the selection can do, from the
 * callbacks the host gave.
 *
 * THE MENU IS SEEN, NOT ONLY KNOWN. Given `onMenu`, the selected node wears a
 * "more" button that asks for the very menu a right-click, the menu key or
 * Shift+F10 asks for (`./more.js`, `../item-more.js`), and every hint line
 * says where the rest is. `+` or Insert add a child; Tab is never taken. A
 * search no node's title holds says so in the hint line (`labels.noMatches`,
 * `{query}` filled in) and to a screen reader, and fades nothing.
 *
 * THE FIRST VIEW of a graph given no `viewport` is the whole of it, scaled
 * down to 0.8 (a title is still 10px; below that the first root stands at the
 * left at 0.8, the first level beside it, the rest a pan away and Fit one
 * press), and is not taken again unless the host asks (Fit, `0`) or its
 * nodes are replaced by a model that shares none of them (`./view.js`). An
 * edge's label is a chip on its edge, kept clear of the others (`./labels.js`).
 *
 * The nodes are an aria tree (`./node.js`, keys in `./keys.js`), pointer
 * gestures are `./interact.js`, edges `./edges.js` and the minimap
 * `./minimap.js`. The graph has no motion, so a reader who asked for less
 * gets none.
 */
import { createLiveRegion, say } from '../../addons/announce.js';
import { reconcileKeyedList } from '../../addons/keyed-list.js';
import { CONTROL_ATTR } from '../../addons/trait.js';
import { button, createLife, documentOf, el, input, markSelected, svg, textNode, uniqueId, writeText } from '../dom.js';
import { injectUiStyles } from '../styles.js';
import { MORE_WORDS } from '../item-more.js';
import { drawEdges } from './edges.js';
import { bindGraph } from './interact.js';
import { emphasisOf, forestOf, layoutForest, normalizeGraph, treeRows } from './layout.js';
import { matchesQuery } from './marks.js';
import { createMinimap } from './minimap.js';
import { syncMore } from './more.js';
import { nodeElement, writeNode } from './node.js';
import { createViewModel } from './view.js';

export const GRAPH = 'cloudcanvas-ui-graph';

/** The graph's default words; `{count}` is filled in. */
export const GRAPH_LABELS = /* @__PURE__ */ Object.freeze({
  zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit', search: 'Search the map', searchPlaceholder: 'Search',
  child: '1 child', children: '{count} children', dependsOn: 'depends on', neededBy: 'needed by', relatedTo: 'related to',
  expand: 'Show children', collapse: 'Hide children', link: 'Drag to another node to link them',
  matches: '{count} matching', noMatches: 'Nothing matches “{query}”', more: MORE_WORDS,
  hintNone: 'Select a node to see what it can do · drag the background to pan', hintSearch: '/ searches',
  hintOpen: 'Enter opens', hintAdd: '+ or Insert to add a child', hintCollapse: 'Space collapses', hintExpand: 'Space expands',
  hintMove: 'drag onto a node to move it', hintLink: 'drag the dot to link', hintDelete: 'Delete removes',
  hintMore: 'Shift+F10 or right-click for more'
});

/** Whether a search is typed and no node's title holds it: the hint says so, and nothing is faded for it. */
function nothingMatches(g) {
  const { query, nodes } = g.state;
  return query.trim() !== '' && !nodes.some((node) => matchesQuery(node.label, query));
}

const noMatchWords = (g) => g.labels.noMatches.replace('{query}', g.state.query.trim());

/** What the hint says: that a search found nothing, else for the selection the verbs the host gave callbacks for. */
function hintOf(g) {
  const { labels, callbacks: cb } = g;
  const id = g.state.selectedId;
  if (nothingMatches(g)) return noMatchWords(g);
  if (id === null) return [labels.hintNone, cb.onMenu && labels.hintMore, labels.hintSearch].filter(Boolean).join(' · ');
  const folds = cb.onToggle && g.countOf(id) > 0;
  return [cb.onActivate && labels.hintOpen, cb.onAdd && labels.hintAdd,
    folds && (g.byId.get(id).collapsed ? labels.hintExpand : labels.hintCollapse),
    cb.onDropOn && labels.hintMove, cb.onConnect && labels.hintLink, cb.onDelete && labels.hintDelete,
    cb.onMenu && labels.hintMore].filter(Boolean).join(' · ');
}

/** Draw what the selection and the search say: emphasis and dimming, the edges, the hint. The selected node is marked as every kit view marks one, and is the tree's selected item. */
function paint(g) {
  const { selectedId, query } = g.state;
  const faded = !nothingMatches(g);
  g.emphasis = emphasisOf(selectedId, g.forest, g.state.edges);
  for (const element of g.nodeLayer.children) {
    const id = element.getAttribute('data-ui-id');
    const selected = id === selectedId;
    markSelected(element, selected);
    if (selectedId === null) element.removeAttribute('aria-selected');
    else element.setAttribute('aria-selected', String(selected));
    element.classList.toggle('is-path', Boolean(g.emphasis) && !selected && g.emphasis.path.has(id));
    element.classList.toggle('is-dim', Boolean(g.emphasis) && !g.emphasis.lit.has(id));
    element.classList.toggle('is-unmatched', faded && !matchesQuery(g.byId.get(id).label, query));
  }
  syncMore(g);
  drawEdges(g, g.emphasis);
  const hint = hintOf(g);
  writeText(g.hintText, hint);
  g.hint.hidden = hint === '';
}

/** The node that holds the tab stop: the one that had it, else the selection, else the first. */
function stopId(g) {
  const { focusId, selectedId } = g.state;
  if (g.byId.has(focusId)) return focusId;
  return g.byId.has(selectedId) ? selectedId : g.rows[0]?.id ?? null;
}

function placeStop(g, { focus }) {
  const id = stopId(g);
  g.state.focusId = id;
  let stop = null;
  for (const element of g.nodeLayer.children) {
    const here = element.getAttribute('data-ui-id') === id;
    element.setAttribute('tabindex', here ? '0' : '-1');
    if (here) stop = element;
  }
  if (focus) stop?.focus({ preventScroll: true });
}

/** Lay out and draw the model. Focus a redraw took from the nodes (its node went) goes to the tab stop. */
function render(g) {
  const { nodes, edges } = g.state;
  g.byId = new Map(nodes.map((node) => [node.id, node]));
  g.forest = forestOf(nodes, edges);
  g.rows = treeRows(g.forest);
  g.positions = layoutForest(g.forest);
  if (!g.byId.has(g.state.selectedId)) unselectGone(g);
  const had = g.nodeLayer.contains(g.doc.activeElement);
  reconcileKeyedList(g.nodeLayer, g.rows, { key: (row) => row.id, create: () => nodeElement(g.doc), update: (element, row) => writeNode(g, element, row) });
  paint(g);
  placeStop(g, { focus: had && !g.nodeLayer.contains(g.doc.activeElement) });
  g.minimap.drawNodes();
  if (!g.fitted) g.views.start();
  g.applyView();
}

/** A selected node the model no longer draws is not selected; the model's own selection waits to be drawn again (a folded parent opened). */
function unselectGone(g) {
  const id = g.state.selectedId;
  if (id !== null && id === g.seen.selectedId) g.wait.selectedId = id;
  g.state.selectedId = null;
}

/** Make `id` the selection and the tab stop; with `focus`, focus it and bring it into view. The reader's choice: nothing waiting is taken after it. */
function select(g, id, { focus }) {
  Object.assign(g.wait, { selectedId: null, focusId: null });
  g.state.selectedId = id;
  g.state.focusId = id;
  paint(g);
  g.minimap.drawNodes();
  placeStop(g, { focus });
  if (focus) g.views.reveal(id, { report: true });
}

function onSearch(g, text) {
  g.state.query = text;
  paint(g);
  const count = g.state.nodes.filter((node) => matchesQuery(node.label, text)).length;
  if (text.trim() !== '') g.say(count === 0 ? noMatchWords(g) : g.labels.matches.replace('{count}', String(count)));
  g.callbacks.onQuery?.(text);
}

/** Keys in the search box: Escape clears it and goes back to the nodes; Enter or Down goes to the first match. */
function onSearchKey(g, event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (g.search.value !== '') { g.search.value = ''; onSearch(g, ''); }
    placeStop(g, { focus: true });
    return;
  }
  if (event.key !== 'Enter' && event.key !== 'ArrowDown') return;
  const first = g.state.query.trim() === '' ? null : g.rows.find((row) => matchesQuery(g.byId.get(row.id).label, g.state.query));
  if (!first) return;
  event.preventDefault();
  select(g, first.id, { focus: true });
}

function toolbar(g) {
  const { doc, labels, life } = g;
  const bar = el(doc, 'div', { className: `${GRAPH}-toolbar` });
  g.search = input(doc, { type: 'search', label: labels.search, placeholder: labels.searchPlaceholder, className: `${GRAPH}-search`,
    signal: life.signal, onInput: (value) => onSearch(g, String(value ?? '')) });
  life.on(g.search, 'keydown', (event) => onSearchKey(g, event));
  bar.append(g.search,
    button(doc, { className: `${GRAPH}-zoom-out`, label: '−', ariaLabel: labels.zoomOut, signal: life.signal, onClick: () => g.zoomAt(0.8) }),
    button(doc, { className: `${GRAPH}-zoom-in`, label: '+', ariaLabel: labels.zoomIn, signal: life.signal, onClick: () => g.zoomAt(1.25) }),
    button(doc, { className: `${GRAPH}-fit`, label: labels.fit, signal: life.signal, onClick: () => g.fit({ report: true }) }));
  return bar;
}

/**
 * Take what the model says that the reader may also change - the selection, the search, the view, the node to bring into view -
 * only when the model changed it. A selection or a focus whose node the model does not draw yet waits for it (`takeWaiting`).
 */
function adopt(g, model, replaced) {
  const { seen, wait, state } = g;
  const selectedId = model.selectedId ?? null;
  if (selectedId !== seen.selectedId) {
    seen.selectedId = selectedId;
    wait.selectedId = selectedId;
    if (selectedId === null) state.selectedId = null;
  }
  const query = String(model.query ?? '');
  if (query !== seen.query) {
    seen.query = query;
    state.query = query;
    g.search.value = query;
  }
  g.views.adopt(model.viewport, replaced);
  const focusId = model.focusId ?? null;
  if (focusId !== seen.focusId) {
    seen.focusId = focusId;
    wait.focusId = focusId;
  }
}

/**
 * Take, once, what waits for a node the model now draws: the selection (with the tab stop) and the node to bring into view.
 * The id to bring into view, or null.
 */
function takeWaiting(g) {
  const { wait, state } = g;
  const drawn = (id) => id !== null && state.nodes.some((node) => node.id === id);
  if (drawn(wait.selectedId)) {
    state.selectedId = wait.selectedId;
    state.focusId = wait.selectedId;
    wait.selectedId = null;
  }
  if (!drawn(wait.focusId)) return null;
  const id = wait.focusId;
  wait.focusId = null;
  state.focusId = id;
  return id;
}

function surface(g) {
  const { doc } = g;
  // The viewport pans and zooms by itself; the root is the control (`data-cc-control`), so its gestures are not the canvas's.
  g.viewport = el(doc, 'div', { className: `${GRAPH}-viewport` });
  g.world = el(doc, 'div', { className: `${GRAPH}-world` });
  g.svg = svg(doc, 'svg', { class: `${GRAPH}-edges`, 'aria-hidden': 'true', width: 1, height: 1 });
  g.nodeLayer = el(doc, 'div', { className: `${GRAPH}-nodes`, attrs: { role: 'tree' } });
  g.overlay = svg(doc, 'svg', { class: `${GRAPH}-edges ${GRAPH}-overlay`, 'aria-hidden': 'true', width: 1, height: 1 });
  g.world.append(g.svg, g.nodeLayer, g.overlay);
  g.minimap = createMinimap(g);
  g.viewport.append(g.world, g.minimap.element);
  g.hint = el(doc, 'p', { className: `${GRAPH}-hint` });
  g.hintText = textNode(doc, g.hint);
}

/** Say on the root which gestures the host takes, so the sheet shows their affordances and cursors. */
function markAbilities(root, callbacks) {
  for (const [name, callback] of [['data-can-move', 'onDropOn'], ['data-can-link', 'onConnect'], ['data-can-fold', 'onToggle'], ['data-can-menu', 'onMenu']]) {
    if (typeof callbacks[callback] === 'function') root.setAttribute(name, '');
  }
}

function graphState(doc, life, root, callbacks) {
  const g = { doc, life, root, callbacks, labels: { ...GRAPH_LABELS, ...callbacks.labels }, markerId: uniqueId(`${GRAPH}-arrow`),
    view: { x: 0, y: 0, k: 1 }, fitted: false, auto: null, positions: new Map(), byId: new Map(), forest: forestOf([], []), rows: [], emphasis: null,
    drag: null, draft: null, panned: false, state: { nodes: [], edges: [], selectedId: null, focusId: null, query: '' },
    seen: { selectedId: undefined, query: undefined, focusId: undefined, viewport: undefined }, wait: { selectedId: null, focusId: null } };
  g.countOf = (id) => g.byId.get(id)?.childCount ?? g.forest.children.get(id)?.length ?? 0;
  g.render = () => render(g);
  g.select = (id, options) => select(g, id, options);
  return g;
}

/**
 * @param {HTMLElement} host
 * @param {{onActivate?: (id: string) => void, onToggle?: (id: string, collapsed: boolean) => void,
 *   onDropOn?: (id: string, targetId: string) => void, onConnect?: (fromId: string, toId: string) => void,
 *   onViewport?: (view: {x: number, y: number, scale: number}) => void, onAdd?: (parentId: string) => void,
 *   onDelete?: (id: string) => void, onMenu?: (id: string, point: {x: number, y: number}) => void,
 *   onQuery?: (text: string) => void, labels?: Partial<typeof GRAPH_LABELS>}} [callbacks]
 * @returns {{update(model: object): void, fit(): boolean, destroy(): void}}
 */
export function createGraph(host, callbacks = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  // A control (`data-cc-control`): the canvas under the page leaves this view's drags to it, so a host marks nothing.
  const root = el(doc, 'div', { className: GRAPH, attrs: { role: 'region', [CONTROL_ATTR]: true } });
  markAbilities(root, callbacks);
  const g = graphState(doc, life, root, callbacks);
  surface(g);
  g.views = createViewModel(g);
  root.append(toolbar(g), g.hint, g.viewport);
  g.region = createLiveRegion(root);
  g.say = (text) => say(g.region, text);
  bindGraph(g);
  host.append(root);
  return {
    update(model = {}) {
      if (life.dead) return;
      const { nodes, edges } = normalizeGraph(model.nodes ?? [], model.edges ?? []);
      const replaced = g.state.nodes.length > 0 && !nodes.some((node) => g.byId.has(node.id));
      Object.assign(g.state, { nodes, edges });
      const label = String(model.label ?? 'Relationships');
      root.setAttribute('aria-label', label);
      g.nodeLayer.setAttribute('aria-label', label);
      adopt(g, model, replaced);
      if (g.drag) return;
      const reveal = takeWaiting(g);
      render(g);
      if (reveal !== null) g.views.reveal(reveal, { report: false });
    },
    fit: () => (life.dead ? false : g.fit({ report: true })),
    destroy() {
      if (life.destroy()) root.remove();
    }
  };
}

