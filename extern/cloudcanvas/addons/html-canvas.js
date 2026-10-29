/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * html-canvas: a blit's own HTML drawn through the GPU, where the browser has HTML-in-Canvas (Chromium, behind
 * `--enable-blink-features=CanvasDrawElement` today). `htmlCanvas(b)` moves the blit's content - not its child
 * blits - into a `<canvas layoutsubtree>` filling it. The browser keeps laying that content out, so it stays
 * focusable, accessible and hit-testable where it is drawn; each time it changes, the canvas captures it
 * (`drawElementImage`) into a texture canvas of its own and clears itself, so the page shows the HTML once, drawn
 * by the GPU, composited with GPU content: tilted, in `z` order, under or over other GPU blits. The capture needs
 * the content painted, so the blit's element stays painted (`paintedProxy`) - give its look to its content.
 * Without the API it changes nothing and returns null: keep such a blit on the default port, where the browser
 * paints it as usual.
 *
 *   const off = htmlCanvas(card);   // card on the `gpu` port of a `gpu(app)` root
 */
import { BLIT_ATTR, stateOf } from '../core/state.js';
import { gpuContent, paintedProxy } from './gpu.js';

/** Marks the canvas `htmlCanvas` put in a blit. */
export const HTML_CANVAS_ATTR = 'data-blit-html-canvas';

/** Whether this browser can draw live HTML into a canvas. */
export function htmlCanvasSupported() {
  return typeof HTMLCanvasElement !== 'undefined' && 'layoutSubtree' in HTMLCanvasElement.prototype
    && typeof globalThis.CanvasRenderingContext2D?.prototype?.drawElementImage === 'function';
}

/** A node the blit owns as content: not a child blit, nor anything holding one. */
function isContent(node) {
  return node.nodeType !== 1 || !(node.matches(`[${BLIT_ATTR}]`) || node.querySelector(`[${BLIT_ATTR}]`));
}

/**
 * Draw a blit's HTML through the GPU.
 * @returns {(() => void)|null} off - the content moves back, the canvas goes - or null without the API
 */
export function htmlCanvas(b) {
  if (!htmlCanvasSupported()) return null;
  if (!stateOf(b.el)) throw new TypeError('htmlCanvas: not a blit');

  const canvas = document.createElement('canvas');
  canvas.setAttribute(HTML_CANVAS_ATTR, '');
  canvas.layoutSubtree = true;
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' });
  const content = document.createElement('div');
  Object.assign(content.style, { width: '100%', height: '100%' });
  // Each moved node leaves a marker, so `off()` puts it back exactly where it was among the child blits.
  const moved = Array.from(b.el.childNodes).filter(isContent).map((node) => {
    const marker = document.createComment('');
    node.replaceWith(marker);
    content.appendChild(node);
    return [node, marker];
  });
  canvas.appendChild(content);
  b.el.prepend(canvas);
  paintedProxy(b);
  const texture = document.createElement('canvas');

  let version = 0;
  const draw = () => {
    const { w, h } = b.size;
    const ratio = globalThis.devicePixelRatio || 1;
    const [width, height] = [Math.max(1, Math.round(w * ratio)), Math.max(1, Math.round(h * ratio))];
    // Resizing clears the canvas and asks for another paint, so only when the box really changed.
    if (canvas.width !== width || canvas.height !== height) Object.assign(canvas, { width, height });
    if (texture.width !== width || texture.height !== height) Object.assign(texture, { width, height });
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // Drawn at the origin, where the content is laid out, so hit-testing already matches: no transform to apply.
    ctx.drawElementImage(content, 0, 0);
    const copy = texture.getContext('2d');
    copy.clearRect(0, 0, width, height);
    copy.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, w, h);
    version += 1;
    gpuContent(b, { texture, version });
  };
  canvas.addEventListener('paint', draw);
  canvas.requestPaint?.();

  return () => {
    canvas.removeEventListener('paint', draw);
    for (const [node, marker] of moved) {
      if (marker.parentNode) marker.replaceWith(node);
      else b.el.insertBefore(node, canvas);
    }
    for (const node of Array.from(content.childNodes)) b.el.insertBefore(node, canvas);
    canvas.remove();
    gpuContent(b, null);
    paintedProxy(b, false);
  };
}
