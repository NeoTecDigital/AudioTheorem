/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The reactions add-on's CSS chunk (`../../addons/actions.js`), injected once by
 * the first toast: the `notify` action's toasts, stacked in the root's overlay.
 * Themed through the tokens.
 */

/** The toast stack and one toast per variant; `is-shown` slides it in. */
export const TOAST_CSS = `/* ------------------ TOASTS ------------------ */

.cloudcanvas-toasts {
  position: absolute;
  right: 24px;
  bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 360px;
  z-index: var(--cc-z-overlay, 60);
  pointer-events: none;
}

.cloudcanvas-toast {
  padding: var(--cc-space-3, 12px) var(--cc-space-4, 16px);
  border: 1px solid var(--cc-card-border, rgba(255, 255, 255, 0.12));
  border-left: 4px solid var(--cc-accent, #3b82f6);
  border-radius: var(--cc-radius-md, 8px);
  background: var(--cc-menu-bg, rgba(15, 23, 42, 0.92));
  color: var(--cc-text, #f8fafc);
  font-family: var(--cc-font, system-ui, sans-serif);
  font-size: var(--cc-type-sm, 13px);
  line-height: 1.4;
  box-shadow: var(--cc-shadow-2, 0 10px 25px -5px rgba(0, 0, 0, 0.5));
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: auto;
}

.cloudcanvas-toast.is-shown { opacity: 1; transform: translateY(0); }
.cloudcanvas-toast-success { border-left-color: #22c55e; }
.cloudcanvas-toast-warning { border-left-color: #eab308; }

`;
