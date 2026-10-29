/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The layout add-on's CSS chunk (`../../addons/layout.js`), injected once when a
 * container first takes a layout. Core selectors only (`[data-blit]`,
 * `[data-scope]`). Every mode states its cross-axis start edge: a flow container
 * decides where its children sit, never how big they are (a stretch would be
 * measured back as the child's own size).
 */

/** The three flow modes, and the flow child dropping out of absolute placement. */
export const LAYOUT_CSS = `
[data-blit].is-layout-row, [data-scope].is-layout-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: var(--cc-layout-gap, var(--cc-space-2, 8px));
}
[data-blit].is-layout-column, [data-scope].is-layout-column {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--cc-layout-gap, var(--cc-space-2, 8px));
}
[data-blit].is-layout-grid, [data-scope].is-layout-grid {
  display: grid;
  grid-auto-flow: row;
  align-items: start;
  justify-items: start;
  grid-template-columns: var(--cc-grid-columns, repeat(auto-fill, minmax(120px, 1fr)));
  gap: var(--cc-layout-gap, var(--cc-space-2, 8px));
}
[data-blit-root] [data-blit].is-flow-child {
  position: relative;
  top: auto;
  left: auto;
}
`;
