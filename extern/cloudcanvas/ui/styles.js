/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The UI kit's stylesheet: one `<style>` per document, injected by the first
 * control that mounts there, never at import.
 *
 * Same discipline as the canvas sheet (`../graphics/style-gates.js`): every
 * themable value is a `var(--cc-*, <dark default>)` read, every class carries
 * the `cloudcanvas-` prefix, and there is no `!important` outside structural
 * resets. The kit's own tokens chain to the core's (`--cc-ui-surface` falls back
 * to `--cc-card-bg`), so a host that already themes the canvas themes the kit.
 */
import { UI_CONTROLS_CSS } from './css/controls.js';
import { UI_FORMS_CSS } from './css/forms.js';
import { UI_OVERLAYS_CSS } from './css/overlays.js';
import { UI_VIEWS_CSS } from './css/views.js';
import { UI_GRAPH_CSS } from './css/graph.js';
import { UI_TIMELINE_CSS } from './css/timeline.js';
import { UI_CALENDAR_CSS } from './css/calendar.js';
import { UI_CONTEXT_CSS } from './css/context.js';
import { UI_MENU_CSS } from './css/menu.js';
import { UI_TABS_CSS } from './css/tabs.js';
import { UI_TAB_LAYERS_CSS } from './css/tabs-layers.js';

/** Id of the kit's single style element. */
export const UI_STYLE_ID = 'cloudcanvas-ui-styles';

/** The whole kit sheet, for a host that ships its CSS as a file instead. */
export const UI_CSS = `${UI_CONTROLS_CSS}${UI_FORMS_CSS}${UI_OVERLAYS_CSS}${UI_VIEWS_CSS}${UI_CALENDAR_CSS}${UI_GRAPH_CSS}${UI_TIMELINE_CSS}${UI_CONTEXT_CSS}${UI_MENU_CSS}${UI_TABS_CSS}${UI_TAB_LAYERS_CSS}`;

/**
 * Put the kit sheet in `doc` once. An existing element is returned untouched:
 * rewriting a live `<style>` invalidates every rule already matched.
 * @param {Document} [doc]
 * @param {{nonce?: string}} [options] a CSP nonce for the style element
 * @returns {HTMLStyleElement|null} null without a document
 */
export function injectUiStyles(doc = globalThis.document, { nonce } = {}) {
  if (!doc?.createElement || !doc.head) return null;
  const existing = doc.getElementById(UI_STYLE_ID);
  if (existing) return existing;
  const style = doc.createElement('style');
  style.id = UI_STYLE_ID;
  if (nonce) style.setAttribute('nonce', String(nonce));
  style.textContent = UI_CSS;
  doc.head.append(style);
  return style;
}
