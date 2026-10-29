/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Presentation geometry only. These private properties mirror the visible
 * viewport, including keyboard resize and pinch/pan offsets, without polling.
 */
import { visualBox } from '../dom.js';

function writeViewport(root, view) {
  const { left, top, width, height } = visualBox(view);
  if (!(width > 0 && height > 0)) return;
  root.style.setProperty('--context-viewport-width', `${width}px`);
  root.style.setProperty('--context-viewport-height', `${height}px`);
  root.style.setProperty('--context-viewport-top', `${Math.max(0, top)}px`);
  root.style.setProperty('--context-viewport-right', `${Math.max(0, view.innerWidth - left - width)}px`);
}

/** Bind to the host document's viewport and dispose all listeners with life. */
export function bindViewport(root, life) {
  const view = root.ownerDocument.defaultView;
  if (!view) return;
  const refresh = () => writeViewport(root, view);
  life.on(view, 'resize', refresh);
  if (view.visualViewport) {
    life.on(view.visualViewport, 'resize', refresh);
    life.on(view.visualViewport, 'scroll', refresh);
  }
  refresh();
}
