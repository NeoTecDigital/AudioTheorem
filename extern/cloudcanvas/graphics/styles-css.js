/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The whole stylesheet: every add-on's CSS chunk (`./css/`) as one string.
 *
 * Each chunk belongs to the add-on that needs it and is injected by that code,
 * once, when it first runs - a page pays for the rules it uses. This is the
 * other way in: `injectCanvasStyles()` (`./styles.js`) puts every chunk in the
 * document at once, and an add-on finding it there adds nothing. Data, not
 * code; nothing imports this module directly except `./styles.js`.
 */

import { LIVE_REGION_CSS } from './css/announce.js';
import { BOARD_CSS } from './css/board.js';
import { CARD_CSS } from './css/card.js';
import { DRAG_CSS } from './css/drag.js';
import { FOCUS_CSS } from './css/focus.js';
import { LAYOUT_CSS } from './css/layout.js';
import { MENU_CSS } from './css/menu.js';
import { PAN_CSS } from './css/pan.js';
import { RESIZE_CSS } from './css/resize.js';
import { SELECT_CSS } from './css/select.js';
import { SVG_STATE_CSS } from './css/svg-state.js';
import { TOAST_CSS } from './css/toast.js';

/**
 * Every chunk, in the order the whole sheet holds them: the board, then the
 * surfaces and state classes that sit on it, then the overlays.
 *
 * Token groups: foundations (`--cc-font`, `--cc-type-*`, `--cc-space-*`,
 * `--cc-radius-*`, `--cc-shadow-*`, `--cc-z-*`) and parts (`--cc-bg`,
 * `--cc-text*`, `--cc-accent`, `--cc-focus*`, `--cc-card-*`, `--cc-scope-*`,
 * `--cc-badge-*`, `--cc-btn-*`, `--cc-meter-*`). `LIGHT_THEME` (`./theme.js`) is
 * the reference override set.
 */
export const CSS_CHUNKS = /* @__PURE__ */ Object.freeze([
  BOARD_CSS,
  PAN_CSS,
  CARD_CSS,
  LAYOUT_CSS,
  SELECT_CSS,
  FOCUS_CSS,
  DRAG_CSS,
  RESIZE_CSS,
  SVG_STATE_CSS,
  MENU_CSS,
  TOAST_CSS,
  LIVE_REGION_CSS
]);

/** The whole stylesheet. Injected once per document by `injectCanvasStyles()`. */
export const CANVAS_DEFAULT_CSS = /* @__PURE__ */ CSS_CHUNKS.join('');
