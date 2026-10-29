/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * connect: connectors from the blit to the blits whose ids it lists, edge to
 * edge, drawn in an `<svg>` on the root's plane so they ride the camera.
 *
 * Each curve leaves the face of the blit's box nearest its target and meets the
 * target's facing edge, on the axis with the larger gap (`edgeConnectorPathData`).
 *
 *   blit.use({ connect });
 *   app.blit({ id: 'a', connect: { connections: ['b'] } });
 *
 * Options: `connections` (or `targets`, `connectTo`), `stroke`
 * (`var(--cc-connector, ...)`), `strokeWidth` (2), `dashed` (true). One
 * `<g data-trait="connectable">` per root holds one keyed `<path>` per
 * connection, reconciled in the write phase: each attribute is written only
 * when it moved, and a connector whose target left the document goes.
 */
import { schedule } from '../core/frame.js';
import { stateOf } from '../core/state.js';
import { SVG_NS, h } from '../graphics/primitives/element.js';
import { connectorPathData, edgeConnectorPathData, safeColor, safeNumber } from '../graphics/primitives/primitives.js';
import { reconcileKeyedList } from './keyed-list.js';
import { defineTrait } from './trait.js';

/** The connector colour, themable through `--cc-connector`. */
export const CONNECTOR_STROKE = 'var(--cc-connector, rgba(56, 189, 248, 0.6))';

/** The marker on the `<svg>` a root's plane-space drawings go into. */
export const SVG_LAYER_ATTR = 'data-blit-svg';

/** The group name the connector layer's `<g>` carries (`data-trait`). */
const NAME = 'connectable';

/** @type {WeakMap<object, object>} root -> its connector group */
const GROUPS = /* @__PURE__ */ new WeakMap();

function init(options) {
  return {
    connections: new Set(options.connections || options.targets || options.connectTo || []),
    stroke: options.stroke || CONNECTOR_STROKE,
    strokeWidth: options.strokeWidth || 2,
    dashed: options.dashed !== undefined ? options.dashed : true,
    // Bumped on every change, so a layer gating its redraws sees a mutation in here.
    revision: 0,
    // Scratch list for a dependency gate, refilled in place: no garbage on idle frames.
    _dependencies: []
  };
}

/* ------------------ CONNECTIONS ------------------ */

export function addConnection(s, id) {
  const before = s.connections.size;
  s.connections.add(id);
  if (s.connections.size !== before) s.revision += 1;
}

export function removeConnection(s, id) {
  if (s.connections.delete(id)) s.revision += 1;
}

/* ------------------ DRAWING ------------------ */

/**
 * One connector to draw: its key, the path between two boxes - edge to edge for
 * a full `{minX, maxX, minY, maxY, centerX, centerY}` box, centre to centre for
 * a `{centerX, centerY}` point - and the drawing record's stroke.
 */
export function connectorItem(key, from, to, s) {
  const boxes = Number.isFinite(from.minX) && Number.isFinite(to.minX);
  return {
    key,
    d: boxes ? edgeConnectorPathData(from, to) : connectorPathData(from.centerX, from.centerY, to.centerX, to.centerY),
    stroke: safeColor(s.stroke, CONNECTOR_STROKE),
    strokeWidth: safeNumber(s.strokeWidth || 2, 2),
    dashed: s.dashed
  };
}

/** Write one item into its `<path>`, each attribute only when it moved (cached on the node). */
export function writeConnector(node, item) {
  const cache = node._ccConnector || (node._ccConnector = {});
  const dash = item.dashed ? '6,4' : 'none';

  if (cache.d !== item.d) { cache.d = item.d; node.setAttribute('d', item.d); }
  if (cache.stroke !== item.stroke) { cache.stroke = item.stroke; node.setAttribute('stroke', item.stroke); }
  if (cache.strokeWidth !== item.strokeWidth) {
    cache.strokeWidth = item.strokeWidth;
    node.setAttribute('stroke-width', String(item.strokeWidth));
  }
  if (cache.dash !== dash) { cache.dash = dash; node.setAttribute('stroke-dasharray', dash); }
}

/** Reconcile a group's `<path>`s to `items`: kept by key, created and removed as needed. */
export function updateConnectors(host, items) {
  reconcileKeyedList(host, items, {
    key: (item) => item.key,
    create: () => h('path', { fill: 'none', 'vector-effect': 'non-scaling-stroke' }),
    update: writeConnector
  });
}

/* ------------------ THE ROOT'S LAYER ------------------ */

/**
 * The `<svg>` on the root's plane that plane-space drawings go into, made on
 * first use. It takes no pointer and no accessibility-tree presence.
 */
export function svgLayerOf(root) {
  const existing = root.plane.querySelector(`:scope > svg[${SVG_LAYER_ATTR}]`);
  if (existing) return existing;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute(SVG_LAYER_ATTR, '');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none';
  root.plane.appendChild(svg);
  return svg;
}

/** A blit's global box as the edge-routing box a connector reads. */
function boxOf(b) {
  const { x, y, w, h: height } = b.bounds;
  return { minX: x, minY: y, maxX: x + w, maxY: y + height, centerX: x + w / 2, centerY: y + height / 2 };
}

/** Whether a blit's element is on the board: in the document, and not inside a branch a promotion hid. */
function shown(element) {
  return element.isConnected && !element.closest('[hidden]');
}

/** The connected blit an id names in the root's document, or null when it is not shown. */
function targetOf(root, id) {
  const element = root.host.ownerDocument.getElementById(String(id));
  const state = element && shown(element) ? stateOf(element) : null;
  return state && state.handle ? state.handle : null;
}

/** The write pass: every shown source's connectors to a shown target. */
function drawGroup(root, group) {
  const items = [];
  for (const [b, s] of group.sources) {
    if (!shown(b.el)) continue;
    for (const id of s.connections) {
      const target = targetOf(root, id);
      if (target && target !== b) items.push(connectorItem(`${b.el.id}->${id}`, boxOf(b), boxOf(target), s));
    }
  }
  updateConnectors(group.host, items);
}

/** Join the root's group; the last source out takes the group and its pass. */
function mount(s, b, root) {
  let group = GROUPS.get(root);
  if (!group) {
    const host = document.createElementNS(SVG_NS, 'g');
    host.setAttribute('data-trait', NAME);
    svgLayerOf(root).appendChild(host);
    group = { host, sources: new Map(), pass: null };
    group.pass = () => drawGroup(root, group);
    root.hooks.write.add(group.pass);
    GROUPS.set(root, group);
  }
  group.sources.set(b, s);
  schedule(root);

  return () => {
    group.sources.delete(b);
    if (group.sources.size > 0) { schedule(root); return; }
    root.hooks.write.delete(group.pass);
    group.host.remove();
    GROUPS.delete(root);
  };
}

export const connect = /* @__PURE__ */ defineTrait({ init, mount });
