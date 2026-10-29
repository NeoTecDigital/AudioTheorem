/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The svg-state add-on's CSS chunk (`../../addons/svg-state.js`), injected once when the trait
 * first starts.
 */

/** The SVG state wrapper, host and path. */
export const SVG_STATE_CSS = `/* ------------------ SVG STATE & 3D INTERPOLATION ------------------ */

.cloudcanvas-svg-state-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  pointer-events: none;
  transform-style: preserve-3d;
}

.cloudcanvas-svg-state-host {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
  pointer-events: none;
  transform-style: preserve-3d;
  transform-origin: center center;
}

.cloudcanvas-svg-state-path {
  vector-effect: non-scaling-stroke;
  transform-box: fill-box;
  transform-origin: center center;
}

/* The interpolation writes its own inline transitions. */
@media (prefers-reduced-motion: reduce) {
  .cloudcanvas-svg-state-path,
  .cloudcanvas-svg-state-host {
    transition: none !important;
  }
}

`;
