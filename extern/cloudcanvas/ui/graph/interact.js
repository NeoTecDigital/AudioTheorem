/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * What the graph does with a press, a drag, a wheel and two fingers.
 *
 * A NODE DRAG IS A REQUEST. Dragged by its body (with `onDropOn`), a node
 * follows the pointer and the node under it lights up as the target; let go
 * there, `onDropOn(id, targetId)` asks for the move. Dragged from its link
 * handle (with `onConnect`), a line follows the pointer instead and the node
 * stays; let go on another node, `onConnect(fromId, toId)` asks for the
 * link. Let go anywhere else, nothing is asked and the node is drawn where
 * the layout puts it: the kit applies nothing.
 *
 * THE VIEW. A drag on the ground pans, as does a drag on a node that cannot
 * be moved; two fingers pan and pinch; the wheel pans, and Ctrl (a trackpad
 * pinch) or a mouse notch zooms around the pointer. Every move of the view the
 * user makes is reported once it rests (`onViewport`).
 */
import { PINCH_ZOOM_K, WHEEL_ZOOM_K, isDiscreteWheel, normalizeWheelDeltas, wheelZoomFactor } from '../../addons/pan.js';
import { trackDrag } from '../drag.js';
import { isMore } from '../item-more.js';
import { drawDraft, drawEdges } from './edges.js';
import { onGraphKey } from './keys.js';
import { setDropTarget } from './marks.js';
import { pressMore, syncMore } from './more.js';
import { HANDLE_CLASS, NODE_CLASS, TOGGLE_CLASS, placeNode } from './node.js';

const NODE = `.${NODE_CLASS}`;
const MINIMAP = '.cloudcanvas-ui-graph-minimap';

/** What a press on `target` drags: the node (`move`), a link from it (`link`), or nothing the graph may ask about. */
function dragModeOf(g, target) {
  if (!target.closest?.(NODE) || target.closest(`.${TOGGLE_CLASS}`) || isMore(target)) return null;
  if (target.closest(`.${HANDLE_CLASS}`)) return g.callbacks.onConnect ? 'link' : null;
  return g.callbacks.onDropOn ? 'move' : null;
}

/** The world point under a client point. */
function worldAt(g, point) {
  const rect = g.viewport.getBoundingClientRect();
  return { x: (point.x - rect.left - g.view.x) / g.view.k, y: (point.y - rect.top - g.view.y) / g.view.k };
}

/** The node under the pointer that a drag from `drag.element` may end on, or null. */
function targetAt(g, drag, point) {
  const node = g.doc.elementFromPoint?.(point.x, point.y)?.closest?.(NODE) ?? null;
  return node && g.nodeLayer.contains(node) && node !== drag.element ? node : null;
}

function startDrag(g, element, point, mode) {
  const id = element.getAttribute('data-ui-id');
  g.drag = { mode, id, element, press: point, origin: { ...g.positions.get(id) }, target: null };
  if (mode === 'move') element.classList.add('is-dragging');
  syncMore(g);
}

function moveDrag(g, point) {
  const drag = g.drag;
  if (drag.mode === 'move') {
    const at = { x: drag.origin.x + (point.x - drag.press.x) / g.view.k, y: drag.origin.y + (point.y - drag.press.y) / g.view.k };
    g.positions.set(drag.id, at);
    placeNode(drag.element, at);
    drawEdges(g, g.emphasis);
  } else {
    drawDraft(g, drag.id, worldAt(g, point));
  }
  setDropTarget(drag, targetAt(g, drag, point));
}

/** End the drag: clear its marks, draw the model again (the node springs back), then ask for what it was dropped on. */
function endDrag(g, point) {
  const { mode, id, element, target } = g.drag;
  setDropTarget(g.drag, null);
  g.drag = null;
  element.classList.remove('is-dragging');
  drawDraft(g, id, null);
  g.render();
  if (!point || !target) return;
  const targetId = target.getAttribute('data-ui-id');
  if (mode === 'move') g.callbacks.onDropOn(id, targetId);
  else g.callbacks.onConnect(id, targetId);
}

function bindNodeDrag(g) {
  trackDrag(g.life, g.viewport, {
    selector: NODE,
    canStart: (item, event) => !g.drag && dragModeOf(g, event.target) !== null,
    onStart: (item, point, target) => startDrag(g, item, point, dragModeOf(g, target)),
    onMove: (point) => { if (g.drag) moveDrag(g, point); },
    onEnd: (point) => { if (g.drag) endDrag(g, point); }
  });
}

const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const apart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Pan by one pointer from where it went down, or pan and pinch by two from where the second went down. */
function follow(g, gesture, pointers) {
  const points = [...pointers.values()];
  const rect = g.viewport.getBoundingClientRect();
  if (points.length === 1) {
    g.view = { ...gesture.view, x: gesture.view.x + points[0].x - gesture.at.x, y: gesture.view.y + points[0].y - gesture.at.y };
  } else {
    const centre = middle(points[0], points[1]);
    const anchor = { x: (gesture.at.x - rect.left - gesture.view.x) / gesture.view.k, y: (gesture.at.y - rect.top - gesture.view.y) / gesture.view.k };
    const k = g.clampScale(gesture.view.k * apart(points[0], points[1]) / gesture.span);
    g.view = { k, x: centre.x - rect.left - anchor.x * k, y: centre.y - rect.top - anchor.y * k };
  }
  g.fitted = true;
  g.applyView({ report: true });
}

/** The gesture the pointers down now start: a pan from one, a pinch from two. */
function gestureOf(g, pointers) {
  const points = [...pointers.values()].slice(0, 2);
  const at = points.length === 2 ? middle(points[0], points[1]) : points[0];
  return { at, view: { ...g.view }, span: points.length === 2 ? Math.max(1, apart(points[0], points[1])) : 1 };
}

/** Travel (px) after which a press on the ground, or on a node that cannot be moved, is a pan and not a press. */
const PAN_SLOP_PX = 4;

/** The click that ends a pan is the pan's: it opens nothing. */
function holdClick(g) {
  g.panned = true;
  g.life.later(() => { g.panned = false; }, 0);
}

/** Hold a pointer for the pan. Only once the press has become one: held at the press, a press on a node would lose the click that opens it. */
function capture(g, pointerId) {
  try { g.viewport.setPointerCapture?.(pointerId); } catch { /* the pointer already ended */ }
}

function bindPan(g) {
  const pointers = new Map();
  let gesture = null;
  g.life.on(g.viewport, 'pointerdown', (event) => {
    const target = event.target;
    if (event.button !== 0 || g.drag || target.closest?.(MINIMAP) || pointers.size >= 2) return;
    if (target.closest?.(NODE) && (dragModeOf(g, target) !== null || target.closest(`.${TOGGLE_CLASS}`) || isMore(target))) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture = { ...gestureOf(g, pointers), moved: pointers.size > 1 };
  });
  g.life.on(g.viewport, 'pointermove', (event) => {
    if (!pointers.has(event.pointerId) || g.drag) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!gesture.moved && apart(gesture.at, { x: event.clientX, y: event.clientY }) > PAN_SLOP_PX) gesture.moved = true;
    if (!gesture.moved) return;
    for (const id of pointers.keys()) capture(g, id);
    g.viewport.classList.add('is-panning');
    follow(g, gesture, pointers);
  });
  const end = (event) => {
    if (!pointers.delete(event.pointerId)) return;
    if (gesture?.moved) holdClick(g);
    gesture = pointers.size > 0 ? { ...gestureOf(g, pointers), moved: true } : null;
    if (!gesture) g.viewport.classList.remove('is-panning');
  };
  g.life.on(g.viewport, 'pointerup', end);
  g.life.on(g.viewport, 'pointercancel', end);
}

function bindWheel(g) {
  g.life.on(g.viewport, 'wheel', (event) => {
    event.preventDefault();
    const rect = g.viewport.getBoundingClientRect();
    const { dx, dy } = normalizeWheelDeltas(event, rect.height);
    const pinch = event.ctrlKey || event.metaKey;
    if (pinch || isDiscreteWheel(event)) {
      g.zoomAt(wheelZoomFactor(dy, pinch ? PINCH_ZOOM_K : WHEEL_ZOOM_K), { x: event.clientX, y: event.clientY });
      return;
    }
    g.view = { ...g.view, x: g.view.x - dx, y: g.view.y - dy };
    g.fitted = true;
    g.applyView({ report: true });
  }, { passive: false });
}

function onPress(g, event) {
  if (pressMore(g, event.target)) return;
  const element = event.target.closest?.(NODE);
  if (!element || !g.nodeLayer.contains(element) || !g.byId.has(element.getAttribute('data-ui-id'))) return;
  const id = element.getAttribute('data-ui-id');
  if (g.panned) return;
  if (event.target.closest(`.${TOGGLE_CLASS}`)) {
    if (g.callbacks.onToggle && g.countOf(id) > 0) g.callbacks.onToggle(id, !g.byId.get(id).collapsed);
    return;
  }
  if (event.target.closest(`.${HANDLE_CLASS}`)) return;
  g.select(id, { focus: false });
  g.callbacks.onActivate?.(id);
}

function onMenu(g, event) {
  const element = event.target.closest?.(NODE);
  if (!g.callbacks.onMenu || !element || !g.nodeLayer.contains(element)) return;
  event.preventDefault();
  g.callbacks.onMenu(element.getAttribute('data-ui-id'), { x: event.clientX, y: event.clientY });
}

/** Wire the graph's presses, keys, menu, wheel, pan, pinch and node drags. */
export function bindGraph(g) {
  g.life.on(g.viewport, 'click', (event) => onPress(g, event));
  g.life.on(g.viewport, 'contextmenu', (event) => onMenu(g, event));
  g.life.on(g.viewport, 'keydown', (event) => onGraphKey(g, event));
  g.life.on(g.viewport, 'focusin', (event) => {
    const element = event.target.closest?.(NODE);
    if (element && g.nodeLayer.contains(element)) g.state.focusId = element.getAttribute('data-ui-id');
  });
  bindPan(g);
  bindWheel(g);
  bindNodeDrag(g);
}
