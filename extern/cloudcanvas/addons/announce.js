/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * announce: one polite live region in the root, and what the root says through
 * it. Focus, edit and root changes are invisible to assistive technology
 * without one - the DOM changed, but nothing was said.
 *
 *   blit.use({ announce });      // then <div id="app" data-announce>
 *   const off = announce(blit('#app'));
 *   app.emit('announce', 'Saved');   // anything else, from anywhere inside
 *
 * Heard on the host, as the native events bubble: `focus:change` (the focus
 * add-on's), `edit` (payload true on entry, false on exit), `children:load` and
 * `children:error` (the lazy add-on's), and `announce` (payload the text). A root change is read each frame from `b.root`. A blit
 * is named by its title (`titleOf`: its `aria-label`, the `title` in its contents, `data-title`), else its id.
 */
import { LIVE_REGION_CSS } from '../graphics/css/announce.js';
import { injectAddonCss, listen, requireRootOf, titleOf } from './trait.js';

/** Class of the live region; the canvas stylesheet hides it visually. */
export const LIVE_REGION_CLASS = 'cloudcanvas-live-region';

/** The visually-hidden rules, inline: the floor under a missing stylesheet or a flattening reset. */
const HIDDEN_STYLE = 'position:absolute;width:1px;height:1px;padding:0;'
  + 'overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0;';

/** Toggled onto a repeat so the region's text changes: a live region announces changes only. */
const NBSP = ' ';

/** A fresh polite region, appended to `host`. @returns {Element|null} null without a document */
export function createLiveRegion(host) {
  if (typeof document === 'undefined' || !host) return null;
  const region = document.createElement('div');
  region.className = LIVE_REGION_CLASS;
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  region.setAttribute('style', HIDDEN_STYLE);
  host.appendChild(region);
  return region;
}

/**
 * Say `text` through `region`. Nothing to say is dropped rather than clearing
 * the region, which would announce twice. @returns {boolean} the text changed
 */
export function say(region, text) {
  if (!region) return false;
  const message = text === null || text === undefined ? '' : String(text).trim();
  if (message === '') return false;
  region.textContent = region.textContent === message ? message + NBSP : message;
  return true;
}

/** A blit's spoken name: its title (`titleOf`), else its id. */
export function nameOf(element) {
  return titleOf(element) || element.id || 'item';
}

/**
 * The listener that says what each event means. A focus leaving is said only if
 * nothing has taken it by the end of the task - the focus add-on unfocuses the
 * old blit before it focuses the new one - and one check covers a burst.
 */
function hearing(region, host) {
  let checking = false;
  const checkCleared = () => {
    checking = false;
    if (!host.querySelector('.is-focused')) say(region, 'Focus cleared');
  };
  return (event) => {
    const { payload } = event.detail ?? {};
    const name = nameOf(event.target);
    if (event.type === 'announce') say(region, payload);
    else if (event.type === 'children:load') say(region, `${payload?.length ?? 0} items loaded in ${name}`);
    else if (event.type === 'children:error') say(region, `Failed to load ${name}`);
    else if (event.type === 'edit') say(region, payload ? `Editing ${name}` : `Finished editing ${name}`);
    else if (payload) say(region, `Focused ${name}`);
    else if (!checking) {
      checking = true;
      queueMicrotask(checkCleared);
    }
  };
}

/** The root trait. @returns {() => void} off, which takes the region away */
export function announce(b, _opts, root) {
  requireRootOf(b, root, 'announce');
  injectAddonCss('announce', LIVE_REGION_CSS);
  const host = b.el;
  const region = createLiveRegion(host);
  const off = listen(host, ['focus:change', 'edit', 'announce', 'children:load', 'children:error'], hearing(region, host));
  let shown = b.root.el;
  const offTick = b.tick(() => {
    if (b.root.el === shown) return;
    shown = b.root.el;
    say(region, shown === host ? 'Viewing the whole canvas' : `Viewing ${nameOf(shown)}`);
  }, 'read');
  return () => {
    off();
    offTick();
    region?.remove();
  };
}
