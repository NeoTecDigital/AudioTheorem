/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Badge: a count beside something, such as unread messages or open alerts.
 *
 *   const badge = createBadge(host);
 *   badge.update({ count: 120, label: '{count} unread' });  // shows "99+", says "120 unread"
 *
 * THE EYE GETS A FIGURE, THE EAR GETS THE COUNT. The figure is capped (`max`,
 * 99 by default, shown as "99+") and hidden from assistive technology; beside
 * it, visually hidden, is the whole count through `label` - a string with
 * `{count}`, or a function of the count. A zero count hides the badge unless
 * `showZero`; `dot: true` draws a bare marker whose meaning is still spoken.
 * `tone` is success, warning or danger; anything else is the accent. The badge
 * is quiet by default - a count that ticks is not an interruption - and
 * `live: true` makes its changes polite announcements.
 *
 * TWO SHAPES. `shape: 'pill'` is the default. `shape: 'flag'` draws the same
 * figure inside an inline SVG marker (`./badge-flag.js`), planted beside its
 * label the way a map places a marker; a dot flag is an empty pennant. The flag
 * is the badge's tone, stands in front of what it is planted on, and - like
 * the pill's figure - is not there for assistive technology. A host that wants
 * it to stick out of its label gives it a rise (`--cc-ui-flag-rise`).
 */
import { createFlag } from './badge-flag.js';
import { SR_ONLY_CLASS, createLife, documentOf, el, textNode, writeText } from './dom.js';
import { injectUiStyles } from './styles.js';

const CLASS = 'cloudcanvas-ui-badge';

/** The largest figure shown when the model names no cap. */
const DEFAULT_MAX = 99;

/** The tones the kit sheet colours; any other is the accent. */
const TONES = /* @__PURE__ */ new Set(['success', 'warning', 'danger']);

/** `count` as a whole, non-negative number, or null when it is no number at all. */
function wholeCount(count) {
  const value = Number(count);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
}

/**
 * The figure a badge shows: a whole, non-negative count, capped as "max+".
 * @param {number} count
 * @param {number} [max=99] a cap below 1, or no number, is the default
 * @returns {string} '' for a count that is not a finite number
 */
export function formatCount(count, max = DEFAULT_MAX) {
  const whole = wholeCount(count);
  if (whole === null) return '';
  const limit = Number(max);
  const cap = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : DEFAULT_MAX;
  return whole > cap ? `${cap}+` : String(whole);
}

/** The spoken text for `count`: `label` as a function, a `{count}` template, or the bare number. */
export function countLabel(label, count) {
  if (typeof label === 'function') return String(label(count) ?? '');
  if (typeof label === 'string' && label !== '') return label.replaceAll('{count}', String(count));
  return String(count);
}

/**
 * The model a control hands its item's badge: the item's own, a bare number as
 * its count, or none at all - which shows nothing. The nav bar and the tabs
 * both read an item's `badge` through this, so the two cannot come to differ.
 * @param {number|object|null} [badge]
 * @returns {object}
 */
export function badgeModel(badge) {
  if (typeof badge === 'number') return { count: badge };
  return badge && typeof badge === 'object' ? badge : {};
}

/**
 * An item's badge inside the control that draws it, kept across redraws:
 * mounted in `host` the first time its item names one, redrawn after that, and
 * destroyed when the item names none. The tabs and the tree both keep theirs
 * through this.
 * @param {{update(model: object): void, destroy(): void}|null} handle the badge kept from the last draw
 * @param {HTMLElement} host
 * @param {number|object|null} [badge] the item's own `badge`
 * @returns {{update(model: object): void, destroy(): void}|null} the badge to keep, or null for an item with none
 */
export function syncBadge(handle, host, badge) {
  if (badge === undefined || badge === null) {
    handle?.destroy();
    return null;
  }
  const kept = handle ?? createBadge(host);
  kept.update(badgeModel(badge));
  return kept;
}

/** The badge's nodes, hidden until a model gives it a count: a figure for the eye, a sentence for the ear. */
function badgeNodes(doc) {
  const root = el(doc, 'span', { className: CLASS, attrs: { hidden: true } });
  const figure = el(doc, 'span', { className: `${CLASS}-figure`, attrs: { 'aria-hidden': 'true' } });
  const spoken = el(doc, 'span', { className: SR_ONLY_CLASS });
  root.append(figure, spoken);
  return { root, figure, figureText: textNode(doc, figure), spoken: textNode(doc, spoken), flag: null };
}

/**
 * Draw `figure` in the model's shape: as the pill's own text, or inside the
 * flag - built the first time one is asked for, and taken out again when the
 * pill returns, so a pill never carries a trace of it.
 */
function writeShape(nodes, flagged, figure) {
  writeText(nodes.figureText, flagged ? '' : figure);
  if (!flagged) {
    nodes.root.removeAttribute('data-shape');
    nodes.flag?.node.remove();
    return;
  }
  nodes.root.setAttribute('data-shape', 'flag');
  nodes.flag ??= createFlag(nodes.root.ownerDocument);
  nodes.flag.write(figure);
  if (nodes.flag.node.parentNode !== nodes.figure) nodes.figure.append(nodes.flag.node);
}

/** A live badge is a polite status; a quiet one carries no role at all. */
function writeLive(root, live) {
  if (live) {
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
  } else {
    root.removeAttribute('role');
    root.removeAttribute('aria-live');
  }
}

function writeBadge(nodes, model) {
  const count = wholeCount(model.count) ?? 0;
  const shown = count > 0 || model.showZero === true;
  const dot = model.dot === true;
  nodes.root.hidden = !shown;
  nodes.root.classList.toggle('is-dot', dot);
  if (TONES.has(model.tone)) nodes.root.setAttribute('data-tone', model.tone);
  else nodes.root.removeAttribute('data-tone');
  writeShape(nodes, model.shape === 'flag', dot ? '' : formatCount(count, model.max));
  writeText(nodes.spoken, shown ? countLabel(model.label, count) : '');
}

/**
 * @param {HTMLElement} host
 * @returns {{update(model: {count?: number, max?: number, label?: string|((count: number) => string),
 *   showZero?: boolean, dot?: boolean, tone?: 'success'|'warning'|'danger', live?: boolean,
 *   shape?: 'pill'|'flag'}): void, destroy(): void}}
 */
export function createBadge(host) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const nodes = badgeNodes(doc);
  host.append(nodes.root);
  return {
    update(model = {}) {
      if (life.dead) return;
      writeLive(nodes.root, model.live === true);
      writeBadge(nodes, model);
    },
    destroy() {
      if (life.destroy()) nodes.root.remove();
    }
  };
}
