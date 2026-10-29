/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Popover: a small non-modal dialog that stands by an anchor - the status a badge opens, the details a row opens.
 *
 *   const pop = createPopover(anchor, { onClose: (reason) => setOpen(false), avoid: tabStrip });
 *   pop.update({ open: true, label: 'Save status', content: statusNode });
 *
 * A `role="dialog"` with the name `label`, not modal: the page behind it keeps working. It is placed under the
 * anchor, or over it when there is no room; it shifts to stay inside the screen and is held to the screen's width,
 * down to 320; and it is kept off what `avoid` names - an element, a rectangle (`{left, top, right, bottom}` or
 * `{x, y, width, height}`) or a list of them, given with the popover or with the model (the model's wins) - by
 * standing on the side that does not cover it. With no side that keeps clear and has room to be read - the anchor is
 * a button in a bar at the top of the screen, and the tab strip it must not cover is right under it - it stands PAST
 * what it avoids, a gap below the strip, still at the anchor's start edge. So the anchor is the button that opens it,
 * and the host needs no element of its own to place it from. `placement: 'top'` wishes for over the anchor first. It
 * is placed again when the model changes and when the window or the visual viewport is resized or scrolled.
 *
 * IT OPENS BY THE MODEL AND CLOSES ITSELF, as a menu does. Escape (heard in the popover and on the anchor) and a
 * press anywhere outside it close it, and `onClose(reason)` says why: 'escape', 'outside' or 'update' (the model
 * said closed). A press on the anchor is not outside: the host's own handler on its anchor answers it, so a
 * toggle does not close the popover on the press and reopen it on the click that ends it. Focus the popover held
 * goes back to the anchor. `destroy` is not a close: it reports nothing.
 *
 * ON OPENING focus moves into it: the first control of its content, else the popover itself. It is on the page only
 * while open, in the nearest `<dialog>` the anchor stands in - so it is above that dialog's layer, not behind it -
 * or else the document's body, unless `host` names where. It stands above a dialog that is not modal and below a
 * menu opened from it (`--cc-z-ui-popover`).
 */
import { createLife, documentOf, el, focusablesIn } from './dom.js';
import { placePopover } from './popover/place.js';
import { injectUiStyles } from './styles.js';

const CLASS = 'cloudcanvas-ui-popover';

/** The node that holds the popover: the host asked for, else the dialog the anchor is in, else the body. */
function mountPoint(pop) {
  return pop.options.host ?? pop.anchor.closest?.('dialog') ?? pop.doc.body;
}

/** Place the popover by the wish and the host's own words on what to avoid. */
function place(pop) {
  const { options, state } = pop;
  placePopover(pop.root, pop.anchor, { avoid: state.avoid ?? options.avoid, prefer: state.placement ?? options.placement });
}

/** Take the popover off the page and say why. Focus it held goes back to the anchor. */
function close(pop, reason, report = true) {
  const { doc, root, state } = pop;
  const held = root.contains(doc.activeElement);
  state.opening?.destroy();
  Object.assign(state, { open: false, opening: null });
  root.remove();
  if (held) pop.anchor.focus({ preventScroll: true });
  if (report) pop.options.onClose?.(reason);
}

/** Escape closes the popover, wherever in it or on its anchor the key is heard, and goes no further. */
function onEscape(pop, event) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  close(pop, 'escape');
}

/** The visual viewport moves and resizes with a pinch or an on-screen keyboard, which the window does not say. */
function listenToViewport(opening, viewport, again) {
  if (!viewport) return;
  opening.on(viewport, 'resize', again);
  opening.on(viewport, 'scroll', again);
}

/** For as long as it is open: Escape, a press outside, and the places the screen can change under it. */
function listen(pop) {
  const { doc, root, anchor } = pop;
  const opening = createLife();
  const again = () => place(pop);
  opening.on(doc, 'pointerdown', (event) => {
    if (!root.contains(event.target) && !anchor.contains(event.target)) close(pop, 'outside');
  }, { capture: true });
  opening.on(root, 'keydown', (event) => onEscape(pop, event));
  opening.on(anchor, 'keydown', (event) => onEscape(pop, event));
  const view = doc.defaultView;
  if (view) {
    opening.on(view, 'resize', again);
    opening.on(doc, 'scroll', again, { capture: true, passive: true });
    listenToViewport(opening, view.visualViewport, again);
  }
  return opening;
}

/** Put the popover on the page, placed, with focus in it. */
function show(pop) {
  const { root, state } = pop;
  mountPoint(pop).append(root);
  state.open = true;
  state.opening = listen(pop);
  place(pop);
  (focusablesIn(root)[0] ?? root).focus({ preventScroll: true });
}

/** The model, checked before anything is drawn, and written: its name, its content, what to avoid and the side wished for. */
function writeModel(pop, model) {
  const label = String(model.label ?? '').trim();
  if (label === '') throw new TypeError('A popover needs a label');
  if (!model.content || typeof model.content !== 'object') throw new TypeError('A popover needs content');
  pop.root.setAttribute('aria-label', label);
  if (pop.root.childNodes.length !== 1 || pop.root.firstChild !== model.content) pop.root.replaceChildren(model.content);
  pop.state.avoid = model.avoid;
  pop.state.placement = model.placement;
}

/**
 * @param {Element} anchor what the popover stands by; it must be on a page
 * @param {{onClose?: (reason: 'escape'|'outside'|'update') => void, avoid?: unknown, placement?: 'bottom'|'top', host?: HTMLElement}} [options]
 * @returns {{update(model: {open?: boolean, label?: string, content?: Node, avoid?: unknown, placement?: 'bottom'|'top'}): void, destroy(): void}}
 */
export function createPopover(anchor, options = {}) {
  const doc = documentOf(anchor);
  injectUiStyles(doc);
  const life = createLife();
  const root = el(doc, 'div', { className: CLASS, attrs: { role: 'dialog', tabindex: '-1' } });
  const pop = { doc, anchor, root, options, state: { open: false, opening: null, avoid: undefined, placement: undefined } };
  return {
    update(model = {}) {
      if (life.dead) return;
      if (!model.open) {
        if (pop.state.open) close(pop, 'update');
        return;
      }
      writeModel(pop, model);
      if (pop.state.open) place(pop);
      else show(pop);
    },
    destroy() {
      if (!life.destroy()) return;
      if (pop.state.open) close(pop, 'update', false);
    }
  };
}
