/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * `cloudcanvas/ui`: product-agnostic DOM controls.
 *
 * Every control has the same shape - `create<Name>(host, callbacks)` mounts it
 * into `host` and returns `{ update(model), destroy() }` - takes plain data in
 * and reports through callbacks, and never owns the application's state. None
 * of them needs a canvas session. Each injects the kit stylesheet into its
 * document on first mount (`injectUiStyles`), themed through `--cc-*` tokens.
 * Nothing runs at import: an unused import of this entry bundles to nothing.
 */

export {
  BUTTON_CLASS, FIELD_CLASS, SR_ONLY_CLASS, documentOf, el, button, isOff, setOff, input, textNode, writeText, clamp, uniqueItems, focusablesIn, uniqueId,
  createLife, itemIdOf
} from './dom.js';
export { setValue, setLabel, show, keepFocus, placeChildren, rowCache } from './render.js';
export { nextIndex, setTabStop, isTypingTarget } from './roving.js';
export { UI_CSS, UI_STYLE_ID, injectUiStyles } from './styles.js';
export { UI_TOKENS } from './tokens.js';
export { trackDrag, DRAG_START_PX, TOUCH_DRAG_DELAY_MS, TOUCH_DRAG_START_PX } from './drag.js';

export { createDialog } from './dialog.js';
export { confirmDialog } from './confirm.js';
export { createContextActions } from './context-actions.js';
export { createContextWindow } from './context-window.js';
export { createDrawer } from './drawer.js';
export { createTabs } from './tabs.js';
export { createMenu } from './menu.js';
export { createPopover } from './popover.js';
export { createSplitter, splitterLimits, splitterKeyValue } from './splitter.js';
export { createResults } from './results.js';
export { createStatus, STATUS_LABELS } from './status.js';
export { createBadge, formatCount, countLabel } from './badge.js';
export { createBreadcrumbs } from './breadcrumbs.js';
export { createTree } from './tree.js';
export { createProgress } from './progress.js';
export { createSwitch } from './switch.js';
export { ICON_NAMES, ICON_CLASS, createIcon } from './icons.js';
export { createSelect } from './select.js';
export { createChips } from './chips.js';
export { createNavBar } from './navbar.js';
export { createEmptyState } from './empty.js';
export { createCombobox } from './combobox.js';
export { createToaster } from './toast.js';
export { createComposer } from './composer.js';
export { createVoiceDraft, VOICE_MAX_LENGTH, VOICE_MESSAGES } from './voice-draft.js';
export { createVoiceInput, VOICE_LABELS } from './voice.js';
export { renderMarkdown, createMarkdownView, toggleTaskLine, safeHref } from './markdown.js';

export { createKanban, moveVerdict } from './kanban.js';
export { createCalendar, CALENDAR_LABELS } from './calendar/calendar.js';
export {
  CALENDAR_VIEWS, addDays, addMinutes, addMonths, atMinutes, dayKey, daysBetween, fromDayKey, minutesOfDay,
  monthGrid, sameDay, shiftAnchor, startOfDay, startOfMonth, startOfWeek, toDate, touchesDay, viewDays
} from './calendar/dates.js';
export { createTimeline, TIMELINE_LABELS } from './timeline/timeline.js';
export { TIMELINE_SCALES } from './timeline/model.js';
export { createGraph, GRAPH_LABELS } from './graph/graph.js';
export { layoutGraph } from './graph/layout.js';
export { reconcileKeyedList } from '../addons/keyed-list.js';
export { isControlTarget } from '../addons/trait.js';
