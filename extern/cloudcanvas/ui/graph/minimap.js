/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The minimap: a small picture of the whole graph in the viewport's corner,
 * the part in view framed (as much of it as the picture holds), shown only while the graph does not fit its
 * window. A press on it, or a drag across it, centres the view on that point.
 * It is a picture for the pointer and hidden from assistive technology: the
 * arrows reach every node and Fit shows them all.
 */
import { el, svg } from '../dom.js';
import { NODE_HEIGHT, NODE_WIDTH, boundsOf } from './layout.js';

const PART = 'cloudcanvas-ui-graph-minimap';

/** World units of room around the graph in the picture. */
const MARGIN = 40;

/** Whether the whole graph is inside the viewport at the current view. */
function fitsInView(g, box, rect) {
  const { x, y, k } = g.view;
  return box.left * k + x >= 0 && box.top * k + y >= 0 && box.right * k + x <= rect.width && box.bottom * k + y <= rect.height;
}

/** The world point under a client point on the picture, which is drawn centred at the largest scale that fits (`meet`). */
function worldAt(map, event) {
  const rect = map.element.getBoundingClientRect();
  const { box } = map;
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  const scale = Math.min(rect.width / width, rect.height / height);
  if (!(scale > 0)) return null;
  const left = rect.left + (rect.width - width * scale) / 2;
  const top = rect.top + (rect.height - height * scale) / 2;
  return { x: box.left + (event.clientX - left) / scale, y: box.top + (event.clientY - top) / scale };
}

function centreOn(g, map, event) {
  const point = map.box ? worldAt(map, event) : null;
  const rect = g.viewport.getBoundingClientRect();
  if (!point) return;
  const { k } = g.view;
  g.view = { k, x: rect.width / 2 - point.x * k, y: rect.height / 2 - point.y * k };
  g.fitted = true;
  g.applyView({ report: true });
}

function bindMinimap(g, map) {
  let pressed = null;
  g.life.on(map.element, 'pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    pressed = event.pointerId;
    try { map.element.setPointerCapture?.(event.pointerId); } catch { /* the pointer already ended */ }
    centreOn(g, map, event);
  });
  g.life.on(map.element, 'pointermove', (event) => { if (event.pointerId === pressed) centreOn(g, map, event); });
  const release = (event) => { if (event.pointerId === pressed) pressed = null; };
  g.life.on(map.element, 'pointerup', release);
  g.life.on(map.element, 'pointercancel', release);
}

/**
 * The minimap of graph `g`: `drawNodes()` after a layout, `drawView()` after the view moves.
 * @returns {{element: HTMLElement, drawNodes(): void, drawView(): void}}
 */
export function createMinimap(g) {
  const element = el(g.doc, 'div', { className: PART, attrs: { 'aria-hidden': 'true' } });
  const picture = svg(g.doc, 'svg', { class: `${PART}-picture`, preserveAspectRatio: 'xMidYMid meet' });
  const nodes = svg(g.doc, 'g', {});
  const frame = svg(g.doc, 'rect', { class: `${PART}-view` });
  picture.append(nodes, frame);
  element.append(picture);
  element.hidden = true;
  const map = { element, box: null };
  map.drawNodes = () => {
    const bounds = boundsOf(g.positions ?? new Map());
    map.box = bounds && { left: bounds.left - MARGIN, top: bounds.top - MARGIN, right: bounds.right + MARGIN, bottom: bounds.bottom + MARGIN };
    if (map.box) picture.setAttribute('viewBox', `${map.box.left} ${map.box.top} ${map.box.right - map.box.left} ${map.box.bottom - map.box.top}`);
    nodes.replaceChildren(...[...(g.positions ?? new Map())].map(([id, point]) => svg(g.doc, 'rect', {
      x: point.x, y: point.y, width: NODE_WIDTH, height: NODE_HEIGHT, rx: 8,
      class: `${PART}-node${id === g.state.selectedId ? ' is-selected' : ''}`
    })));
  };
  map.drawView = () => {
    const rect = g.viewport.getBoundingClientRect();
    const bounds = boundsOf(g.positions ?? new Map());
    element.hidden = !bounds || !(rect.width > 0) || !(rect.height > 0) || fitsInView(g, bounds, rect);
    if (element.hidden) return;
    const { x, y, k } = g.view;
    const box = map.box;
    const left = Math.max(box.left, -x / k);
    const top = Math.max(box.top, -y / k);
    const seen = { x: left, y: top, width: Math.min(box.right, (rect.width - x) / k) - left, height: Math.min(box.bottom, (rect.height - y) / k) - top };
    frame.setAttribute('visibility', seen.width > 0 && seen.height > 0 ? 'visible' : 'hidden');
    for (const [name, value] of Object.entries(seen)) frame.setAttribute(name, String(Math.round(Math.max(0, value))));
  };
  bindMinimap(g, map);
  return map;
}
