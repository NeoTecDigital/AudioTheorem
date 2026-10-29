/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Drawer: a side region that stays part of the page, and folds away into the
 * control that brings it back.
 *
 *   const drawer = createDrawer(host, { onToggle: (open) => setOpen(open) });
 *   drawer.panel.append(menu);
 *   drawer.update({ open: true, label: 'Menu', collapseTo: menuButton });
 *
 * NOT A DIALOG. The region is `panel`, and what is in it is the host's. It
 * traps nothing, the rest of the page stays live beside it, Escape is not its
 * key, and opening it moves no focus.
 *
 * CONTROLLED. `open` is the model's. `collapseTo` is the control the region
 * folds into: while the drawer holds it, it carries `aria-expanded` and
 * `aria-controls`, and - when the host gave `onToggle` - a press on it reports
 * `onToggle(open)` with the state asked for. The drawer then shows what the
 * next model says. A host that already hears that control gives no `onToggle`.
 *
 * A SHARED CONTROL HAS ONE OWNER. Several drawers may name the same
 * `collapseTo`. The last to take it owns it: the control carries that drawer's
 * region and state, and only that drawer hears its press. The others keep
 * their place in line - each still folds toward the control and hands it focus
 * - and a redraw that names the same control does not take it again. When the
 * owner lets go (another `collapseTo`, none, or `destroy`), the one before it
 * owns the control again, with the state it has by then. The control is bare
 * only when no drawer names it.
 *
 * IT TRAVELS, THEN IT IS GONE. Closing shrinks and fades the region toward the
 * centre of `collapseTo`: transform and opacity only, so the page is not laid
 * out again while it moves. Only when it arrives is it `hidden` and `inert`,
 * and focus that was inside it goes to `collapseTo`. Opening runs the same
 * travel backwards, and a change of mind turns a travel round where it stands.
 * The first model is a state, not a change, so it is shown at once; so is
 * every change for a user who asked for reduced motion. Where the region sits
 * and how wide it is are the host's.
 */
import { prefersReducedMotion } from '../addons/motion.js';
import { createLife, documentOf, el, uniqueId } from './dom.js';
import { injectUiStyles } from './styles.js';

const CLASS = 'cloudcanvas-ui-drawer';

/** How long the region travels: inside the 120 to 180 ms that reads as one move and not as a wait. */
const TRAVEL_MS = 160;

/** The travel, as the closing move: from in place to unseen and small at the point it folds into. */
const TRAVEL = /* @__PURE__ */ Object.freeze([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.2)' }]);

/** The private properties the sheet reads the travel's origin from. */
const ORIGIN_X = '--drawer-origin-x';
const ORIGIN_Y = '--drawer-origin-y';

/** The drawers that name each control, in the order they took it: the last is its owner. */
const HOLDERS = /* @__PURE__ */ new WeakMap();

/** The drawer that owns `anchor`, or none when no drawer names it. */
function ownerOf(anchor) {
  return HOLDERS.get(anchor)?.at(-1) ?? null;
}

/** Write on `anchor` what its owner says - the region it controls and whether that is open - or leave it bare when it has none. */
function writeOwner(anchor) {
  const owner = ownerOf(anchor);
  if (!owner) {
    anchor.removeAttribute('aria-expanded');
    anchor.removeAttribute('aria-controls');
    return;
  }
  anchor.setAttribute('aria-controls', owner.root.id);
  anchor.setAttribute('aria-expanded', String(owner.state.open === true));
}

/**
 * Aim the travel at the centre of `anchor`, measured in the region's own box.
 * A control with no box - none given, or one that is not drawn - is no
 * direction: the aim is cleared and the sheet's own origin stands.
 */
function aim(root, anchor) {
  const to = anchor?.getBoundingClientRect();
  if (!to || !(to.width > 0) || !(to.height > 0)) {
    root.style.removeProperty(ORIGIN_X);
    root.style.removeProperty(ORIGIN_Y);
    return;
  }
  const box = root.getBoundingClientRect();
  root.style.setProperty(ORIGIN_X, `${to.left + to.width / 2 - box.left}px`);
  root.style.setProperty(ORIGIN_Y, `${to.top + to.height / 2 - box.top}px`);
}

/** The region as it is when closed: off the page and out of reach. Focus it held would be lost with it, so the control takes it. */
function conceal(root, anchor) {
  const held = root.contains(root.ownerDocument.activeElement);
  root.hidden = true;
  root.inert = true;
  if (held && anchor?.isConnected && typeof anchor.focus === 'function') anchor.focus();
}

/** The region as it is when open: on the page and in reach before it travels, so it arrives usable. */
function reveal(root) {
  root.hidden = false;
  root.inert = false;
}

/**
 * Arrive. A closed region leaves the page while its travel still holds it at
 * the fold point, so it is never drawn in place again; then the travel, which
 * has run its course, is let go and holds no style.
 */
function settle(drawer) {
  const { root, state } = drawer;
  if (!state.open) conceal(root, state.anchor);
  state.motion?.cancel();
  state.motion = null;
}

/**
 * Go to the model's state. A travel in flight is turned round where it stands;
 * otherwise one starts, aimed at the control - or, with no move to make (the
 * first model, reduced motion), the region simply arrives.
 */
function travel(drawer, moving) {
  const { root, state } = drawer;
  if (state.motion) {
    state.motion.reverse();
    return;
  }
  if (state.open) reveal(root);
  if (!moving || prefersReducedMotion()) {
    settle(drawer);
    return;
  }
  aim(root, state.anchor);
  state.motion = root.animate(TRAVEL, { duration: TRAVEL_MS, easing: 'ease-in', fill: 'both', direction: state.open ? 'reverse' : 'normal' });
  state.motion.onfinish = () => settle(drawer);
}

/**
 * End a travel in flight without arriving anywhere. It is finished before it
 * is cancelled, so its `finished` promise resolves for whoever awaits it.
 */
function halt(state) {
  const motion = state.motion;
  if (!motion) return;
  state.motion = null;
  motion.onfinish = null;
  motion.finish();
  motion.cancel();
}

/** Let go of the control the region folds into: the drawer leaves the line, and the control says what its owner now says. */
function release(drawer) {
  const anchor = drawer.state.anchor;
  if (!anchor) return;
  drawer.state.anchor = null;
  if (drawer.press) anchor.removeEventListener('click', drawer.press);
  const others = HOLDERS.get(anchor).filter((holder) => holder !== drawer);
  if (others.length > 0) HOLDERS.set(anchor, others);
  else HOLDERS.delete(anchor);
  writeOwner(anchor);
}

/** Hold `anchor` as the control the region folds into, in place of the one before it: the drawer takes it last, so it owns it. */
function hold(drawer, anchor) {
  if (drawer.state.anchor === anchor) return;
  release(drawer);
  drawer.state.anchor = anchor;
  if (!anchor) return;
  HOLDERS.set(anchor, [...(HOLDERS.get(anchor) ?? []), drawer]);
  if (drawer.press) anchor.addEventListener('click', drawer.press);
}

/**
 * @param {HTMLElement} host where the region is appended
 * @param {{onToggle?: (open: boolean) => void}} [callbacks] `onToggle` hears a press on `collapseTo`, with the state asked for
 * @returns {{panel: HTMLElement, update(model: {open?: boolean, label?: string, collapseTo?: Element|null}): void,
 *   destroy(): void}} `panel` is the region: the host appends its content there
 */
export function createDrawer(host, { onToggle } = {}) {
  const doc = documentOf(host);
  injectUiStyles(doc);
  const life = createLife();
  const root = el(doc, 'div', { className: CLASS, attrs: { id: uniqueId(CLASS), role: 'region', hidden: true, inert: true } });
  host.append(root);
  const state = { open: null, anchor: null, motion: null };
  const drawer = { root, state, press: null };
  // Every drawer that names a control hears its press; only the owner answers it.
  if (typeof onToggle === 'function') drawer.press = () => { if (ownerOf(state.anchor) === drawer) onToggle(!state.open); };
  life.add(() => release(drawer));
  life.add(() => halt(state));
  return {
    panel: root,
    update(model = {}) {
      if (life.dead) return;
      const was = state.open;
      state.open = Boolean(model.open);
      root.setAttribute('aria-label', String(model.label ?? 'Side panel'));
      hold(drawer, model.collapseTo ?? null);
      if (state.anchor) writeOwner(state.anchor);
      if (state.open !== was) travel(drawer, was !== null);
    },
    destroy() {
      if (life.destroy()) root.remove();
    }
  };
}
