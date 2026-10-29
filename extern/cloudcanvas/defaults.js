/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The defaults (`cloudcanvas/defaults`): every add-on trait under its name, the
 * board's CSS chunk, the display widgets, and the reaction built-ins, registered
 * on import - so markup alone makes a live board:
 *
 *   <script type="module">import 'cloudcanvas/defaults'; import { blit } from 'cloudcanvas'; blit('#app');</script>
 *   <div id="app" data-pan data-keyboard>
 *     <div data-blit data-type="card" data-card='{"title":"Hi"}' data-drag data-select data-x="40"></div>
 *   </div>
 *
 * The one module with a side effect on import, and the one that costs every
 * add-on; import the subpaths instead to pay only for what a page uses.
 */
import { blit } from './core/index.js';
import { builtinActions } from './addons/actions.js';
import { announce } from './addons/announce.js';
import { connect } from './addons/connect.js';
import { cursors } from './addons/cursors.js';
import { drag } from './addons/drag.js';
import { edit } from './addons/edit.js';
import { focus } from './addons/focus.js';
import { history } from './addons/history.js';
import { keyboard } from './addons/keyboard.js';
import { gap, layout } from './addons/layout.js';
import { observe } from './addons/observe.js';
import { offload } from './addons/offload.js';
import { pan } from './addons/pan.js';
import { physics } from './addons/physics.js';
import { reactions } from './addons/reactions.js';
import { resize } from './addons/resize.js';
import { select } from './addons/select.js';
import { style } from './addons/style.js';
import { svgState } from './addons/svg-state.js';
import { registerDisplayTypes } from './addons/types.js';
import { injectBoardStyles } from './graphics/styles.js';

/** Every trait `cloudcanvas/defaults` names, by the name markup uses. */
export const DEFAULT_TRAITS = /* @__PURE__ */ Object.freeze({
  drag, select, resize, focus, physics, connect, svgState, edit, layout, gap, style, offload,
  pan, keyboard, announce, cursors, history, reactions, observe
});

blit.use(DEFAULT_TRAITS);
injectBoardStyles();
registerDisplayTypes();
builtinActions();
