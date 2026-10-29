/**
 * CloudCanvas - NeoTec, LLC, Richard Christopher
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Menu panel placement: a point anchor clamps inside the host (or opens upward
 * when there is no room below); a box anchor opens beside its trigger.
 */

const NO_INSETS = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });


/**
 * Place a panel in overlay coordinates (client minus the host's cached origin)
 * and fit it in the host. A point anchor (the click) is clamped back inside by
 * its overhang, never past the near edge. A box anchor (a trigger) opens on its
 * committed side and flips only for the first flyout (`allowFlip`); failing
 * both it clamps on that side, since reversing would land on its own ancestors.
 * @returns {'left'|'right'|null} the side a box took
 */
export function placeInHost(m, element, anchor) {
  const hostRect = m.root.hostRect;
  // Insets: edges an app floats chrome over (a status bar, a toolbar) are not the menu's to use.
  const inset = (typeof m.insets === 'function' ? m.insets() : m.insets) || NO_INSETS;
  const originLeft = hostRect.left || 0;
  const originTop = hostRect.top || 0;
  // `|| 0`: a synthetic event without coordinates opens at the host's corner, never at `NaNpx`.
  const hostLeft = originLeft + (inset.left || 0);
  const hostTop = originTop + (inset.top || 0);
  const hostRight = originLeft + (hostRect.width || 0) - (inset.right || 0);
  const hostBottom = originTop + (hostRect.height || 0) - (inset.bottom || 0);
  const box = anchor.mode === 'box';
  element.style.top = `${(box ? anchor.rect.top : (Number(anchor.y) || 0)) - originTop}px`;
  element.style.left = `${(box ? anchor.rect.right : (Number(anchor.x) || 0)) - originLeft}px`;

  const measured = element.getBoundingClientRect();
  const side = box ? placeBoxHorizontally(element, anchor, measured.width, hostLeft, hostRight, originLeft) : null;
  if (!box) clampEdge(element, 'left', measured.right, hostRight, hostLeft - originLeft);
  if (!placeAbove(element, anchor, measured, hostTop, hostBottom, originTop)) {
    clampEdge(element, 'top', measured.bottom, hostBottom, hostTop - originTop);
  }
  return side;
}

/** A point-anchored panel with no room below opens upward, so it never covers where it was opened. */
function placeAbove(element, anchor, box, hostTop, hostBottom, originTop) {
  if (anchor.mode === 'box' || box.bottom <= hostBottom) return false;
  const upperEdge = Math.min(Number(anchor.y) || 0, hostBottom);
  const above = upperEdge - box.height - originTop;
  if (above < hostTop - originTop) return false;
  element.style.top = `${above}px`;
  return true;
}

/** Fit a flyout beside its trigger on the committed side, else (first flyout only) the other, else clamp. */
function placeBoxHorizontally(element, anchor, panelWidth, hostLeft, hostRight, originLeft) {
  const { rect, preferSide, allowFlip } = anchor;
  const fits = { right: rect.right + panelWidth <= hostRight, left: rect.left - panelWidth >= hostLeft };
  const at = { right: rect.right - originLeft, left: (rect.left - panelWidth) - originLeft };
  const order = allowFlip ? [preferSide, 'left', 'right'] : [preferSide];
  const side = order.find((each) => fits[each]);
  if (side) {
    element.style.left = `${at[side]}px`;
    return side;
  }
  const near = hostLeft - originLeft;
  element.style.left = `${preferSide === 'left' ? near : Math.max(near, hostRight - originLeft - panelWidth)}px`;
  return preferSide;
}

/** Pull a far edge back inside the host by its overhang, never past the near edge. */
function clampEdge(element, styleProp, boxFar, hostFar, near) {
  const over = boxFar - hostFar;
  const current = parseFloat(element.style[styleProp]) || 0;
  element.style[styleProp] = `${Math.max(near, current - Math.max(0, over))}px`;
}
