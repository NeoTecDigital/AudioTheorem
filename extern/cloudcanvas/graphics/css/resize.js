/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The resize add-on's CSS chunk (`../../addons/resize.js`), injected once when the trait first starts.
 */

/** The eight resize handles and the resizing state. */
export const RESIZE_CSS = `/*
 * Resize handles, appended by the resize trait: direct children of the blit, so
 * a content render never takes them away. Each carries \`data-cc-control\`, which
 * is what makes the pan add-on decline the deferred capture and the drag add-on
 * stand down on it (\`CONTROL_SELECTOR\`, \`../../addons/trait.js\`).
 *
 * Visibility is the \`hidden\` property, written by the trait - so no \`display\` is
 * declared here, and the user-agent \`[hidden]\` rule keeps working on a page that
 * never loaded this stylesheet. The reset below only defends it from a host
 * sheet that gives every div a display value.
 */
.cloudcanvas-resize-handle {
  position: absolute;
  box-sizing: border-box;
  width: var(--cc-resize-handle-size, 10px);
  height: var(--cc-resize-handle-size, 10px);
  border-radius: var(--cc-radius-sm, 6px);
  background: var(--cc-resize-handle-bg, var(--cc-accent, #38bdf8));
  box-shadow: var(--cc-resize-handle-ring, 0 0 0 1px rgba(8, 10, 16, 0.65));
  z-index: var(--cc-z-drag, 1100);
  touch-action: none;
}

.cloudcanvas-resize-handle[hidden] {
  display: none !important;
}

/* A coarse pointer gets a target it can actually hit. */
@media (pointer: coarse) {
  .cloudcanvas-resize-handle {
    width: var(--cc-resize-handle-size-coarse, 20px);
    height: var(--cc-resize-handle-size-coarse, 20px);
  }
}

/*
 * One rule per direction: where the handle sits on the box, and what the pointer
 * says it will do. The \`translate\` is what centres it *on* the edge rather than
 * inside it, so the affordance straddles the boundary it moves.
 */
.cloudcanvas-resize-handle[data-cc-resize-handle="nw"] {
  top: 0;
  left: 0;
  transform: translate(-50%, -50%);
  cursor: nwse-resize;
}

.cloudcanvas-resize-handle[data-cc-resize-handle="n"] {
  top: 0;
  left: 50%;
  transform: translate(-50%, -50%);
  cursor: ns-resize;
}

.cloudcanvas-resize-handle[data-cc-resize-handle="ne"] {
  top: 0;
  right: 0;
  transform: translate(50%, -50%);
  cursor: nesw-resize;
}

.cloudcanvas-resize-handle[data-cc-resize-handle="w"] {
  top: 50%;
  left: 0;
  transform: translate(-50%, -50%);
  cursor: ew-resize;
}

.cloudcanvas-resize-handle[data-cc-resize-handle="e"] {
  top: 50%;
  right: 0;
  transform: translate(50%, -50%);
  cursor: ew-resize;
}

.cloudcanvas-resize-handle[data-cc-resize-handle="sw"] {
  bottom: 0;
  left: 0;
  transform: translate(-50%, 50%);
  cursor: nesw-resize;
}

.cloudcanvas-resize-handle[data-cc-resize-handle="s"] {
  bottom: 0;
  left: 50%;
  transform: translate(-50%, 50%);
  cursor: ns-resize;
}

.cloudcanvas-resize-handle[data-cc-resize-handle="se"] {
  bottom: 0;
  right: 0;
  transform: translate(50%, 50%);
  cursor: nwse-resize;
}

/* A resize is a drag of the box: it clears its neighbours the same way, and the
   grab cursor must not fight the direction cursor under the pointer. */
[data-blit].is-resizing {
  z-index: var(--cc-z-drag, 1100);
  cursor: default;
}

`;
