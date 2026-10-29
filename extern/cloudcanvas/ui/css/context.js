/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Nonmodal floating windows and their shared actions. Private viewport
 * properties are written by the window's geometry observer, not theme state.
 */
export const UI_CONTEXT_CSS = `
.cloudcanvas-ui-context-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cc-space-1, 4px);
}
.cloudcanvas-ui-context-actions-pin[aria-pressed="true"] {
  background: var(--cc-ui-selected, var(--cc-btn-bg-hover, rgba(56, 189, 248, 0.22)));
  font-weight: var(--cc-weight-semibold, 600);
}
.cloudcanvas-ui-context-window {
  position: fixed;
  box-sizing: border-box;
  top: calc(var(--context-viewport-top, 0px) + var(--context-viewport-height, 100dvh) - var(--cc-space-2, 8px) - env(safe-area-inset-bottom, 0px));
  right: calc(var(--context-viewport-right, 0px) + var(--cc-space-2, 8px) + env(safe-area-inset-right, 0px));
  transform: translateY(-100%);
  z-index: var(--cc-z-ui-context, 1200);
  width: min(28rem, calc(var(--context-viewport-width, 100vw) - 2 * var(--cc-space-2, 8px) - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  max-height: calc(var(--context-viewport-height, 100dvh) - 2 * var(--cc-space-2, 8px) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-2, 8px);
  overflow: auto;
  padding: var(--cc-space-3, 12px);
  font-family: var(--cc-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
  color: var(--cc-text, #e2e8f0);
  background: var(--cc-ui-surface, var(--cc-card-bg, rgba(30, 41, 59, 0.85)));
  border: 1px solid var(--cc-card-border, rgba(255, 255, 255, 0.1));
  border-radius: var(--cc-radius-md, 10px);
  box-shadow: var(--cc-shadow-2, 0 12px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.09));
  backdrop-filter: blur(var(--cc-card-blur, 12px));
  overflow-wrap: anywhere;
}
.cloudcanvas-ui-context-window:focus-visible {
  outline: var(--cc-focus-ring-width, 2px) solid var(--cc-focus-ring, var(--cc-accent, #38bdf8));
  outline-offset: calc(-1 * var(--cc-focus-ring-width, 2px));
}
.cloudcanvas-ui-context-window-header, .cloudcanvas-ui-context-window-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cc-space-2, 8px);
  min-width: 0;
  flex: none;
}
.cloudcanvas-ui-context-window-header { justify-content: space-between; }
.cloudcanvas-ui-context-window-title {
  flex: 1 1 100%;
  min-width: 0;
  margin: 0;
  font-size: var(--cc-type-lg, 15px);
  font-weight: var(--cc-weight-semibold, 600);
}
.cloudcanvas-ui-context-window-tools { justify-content: flex-end; width: 100%; }
.cloudcanvas-ui-context-window-description { flex: none; margin: 0; color: var(--cc-text-muted, #94a3b8); }
.cloudcanvas-ui-context-window-body { min-width: 0; min-height: 0; overflow: auto; }
.cloudcanvas-ui-context-window-body > * { max-width: 100%; box-sizing: border-box; }
`;
