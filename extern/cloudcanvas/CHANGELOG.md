# Changelog
<!-- Written by Richard Christopher, Copyright 2026 NeoTec, LLC -->

All notable changes to CloudCanvas. Versions follow semantic versioning; this file
records the migration surface, not the commit history.

## 0.5.0 (2026-09-29)

The blit release. The Pin engine is gone; CloudCanvas is now a two-export core and a set of add-ons,
each its own subpath, each costing nothing unless imported. `import 'cloudcanvas'` is 6.9 KB gzipped (0.4:
about 60 KB). Projects that must stay on the Pin API can pin the `legacy/0.4` branch of
`CloudsEcosys/cloudcanvas`.

### Breaking

- **`cloudcanvas` exports exactly `blit` and `type`.** Every other capability moved to an add-on
  subpath (`cloudcanvas/drag`, `pan`, `select`, `resize`, `focus`, `keyboard`, `menu`, `announce`,
  `cursors`, `motion`, `layout`, `style`, `edit`, `place`, `history`, `connect`, `physics`, `svg-state`,
  `reactions`, `lazy`, `offload`, `observe`, `types`, `widget`); `cloudcanvas/defaults` names them all.
- **The session, `Pin`, particles and the trait classes are removed**, with the renderer, the manager,
  hydration of `data-cc-*`, reload strategies and utility Pins. Hierarchy is the DOM, state is keyed by
  element, events are native `CustomEvent`s, and the frame is one read/write loop per root.
- **Save format v2** writes blit trait names (`drag`, `select`, `resize`, `focus`) and drops `reload`;
  both v1 documents and v2 documents written by pre-release builds load unchanged (legacy trait names are
  aliased on load, `select` widgets load as `dropdown`).
- **Widget factories take a parent blit**, not a session: `createButtonPin(session, o)` is
  `createButton(parent, o)`, and so on through the kit; contents live under the widget's type key.
- **The sandbox speaks boards**: `createBoard`, `serializeBoard`, `deserializeBoard`, `clearBoard`,
  `autoSaveBoard`, `attachBoardPart`; the static export bundles `dist/cloudcanvas.board.iife.js`.
- `cloudcanvas/styles` is `cloudcanvas/graphics`; the `cloudcanvas/styles.css` alias is removed.
- **CSS ships per add-on.** Each add-on puts its own chunk in the page once, the first time it runs; the
  board's (the root's canvas surface and type, and `user-select: none` so a gesture never selects page
  text) comes with `createBoard`, `cloudcanvas/defaults` and `injectBoardStyles()`. `injectCanvasStyles()`
  and `CANVAS_DEFAULT_CSS` are every chunk at once. The 0.4 shell's rules (`.cloudcanvas-host`, the layer
  classes, the focus veil, `.cloudcanvas-primitive-card`, `cc-elevated`) are gone, with the tokens only
  they read: `--cc-z-svg`, `--cc-z-plane`, `--cc-z-veil`, `--cc-z-elevated`, `--cc-focus-veil`.
- **The display widgets' classes are `cloudcanvas-card-*`** (`CLS`, `cloudcanvas/types`), the slotted
  type's `cloudcanvas-card-slot*`. The drag grip is on every drag blit and CSS shows it (selected and
  `chrome: false`, or `{handle: true}`), so a `chrome` write needs no drag restart. `KEY_BINDINGS.pin` is
  `KEY_BINDINGS.blit`; `createPinIconSVG` is removed; `--cc-sticky-pin(-shadow)` is
  `--cc-sticky-pinhead(-shadow)`.

### Migration

`node scripts/migrate-0.5.js <dir>` lists every 0.4 call in a codebase with its 0.5 form.

| 0.4 | 0.5 |
|---|---|
| `createCanvasSession({container})` | `blit(host)`; or `createBoard(host)` (`cloudcanvas/sandbox`) for the standard add-ons |
| `session.createPin({type, contents, parent, width, height, ...})` | `parent.blit({id, type, [type]: contents, w, h, drag, select, ...})` |
| `session.getPin(id)` / `removePin(id)` | `app.find(id)` / `b.remove()` |
| `pinManager.getRootPins()` / `getAllPins()` | `app.blits` / `allBlits(app)` |
| `pin.setContent(k, v)` / `pin.contents.get(k)` | `setContent(b, k, v)` / `contentOf(b)[k]` (`cloudcanvas/widget`) |
| `defineComponent({build, update})` | `widget({name, html, keys, bind, render})` |
| `pin.addTrait(name, o)` / `removeTrait` / `replaceTrait` | `b.set({name: o})` / `b.set({name: false})` |
| `DraggableTrait`, `SelectableTrait`, `ResizableTrait`, `FocussableTrait`, `ConnectableTrait` | the `drag`, `select`, `resize`, `focus`, `connect` add-ons, named with `blit.use` |
| `pin.setPosition(x, y, z)` / `resizePin(p, w, h)` | `b.set({x, y, z})` / `b.set({w, h})` |
| `reparentPin(p, parent)` / `reorderChild` | `move(b, parent)` (`place`) / `reorder(b, before)` (`layout`) |
| `pin.getGlobalBounds()` | `b.bounds` |
| `pin.transmit(new PinEvent(t, {payload}))` | `b.emit(t, payload)` |
| `pinManager.onSignal(fn)` | `app.on(type, fn)` |
| `session.focus(pin, {promote})` / `pushFocus` / `popFocus` | `go(app, b, {promote})` / `back(app)` (`history`) |
| `viewport.zoomToFit(box)` | `app.view(b)`, or `cameraOf(app).fit(box, rect)` |
| `pin.beginEdit()` / `endEdit()` | `begin(b, node)` / `end(b)` (`edit`) |
| `setPinStyle` / `getPinStyle` | `setStyle` / `getStyle`, or `b.set({style})` (`style`) |
| `pin.layout = 'row'`, `pin.layoutGap = 8` | `b.set({layout: 'row', gap: 8})` |
| `pin.chrome = false`, `pin.bordered = false` | `b.set({chrome: false})`, `b.set({bordered: false})` |
| `attachReactions(session)`, `reactionsFor(session)` | `app.set({reactions: true})`, `reactionsOf(app)` |
| `serializeSession` / `deserializeSession` | `serializeBoard` / `deserializeBoard` |
| `data-pin-id`, `.cloudcanvas-pin` | the element id, `[data-blit]` |
| `.cloudcanvas-pin-title` and every `cloudcanvas-pin-*` template class | `.cloudcanvas-card-title`, ... (`CLS`, `cloudcanvas/types`) |

### Added

- **The core**: `blit()` handles over any element, HTML or SVG; potential, indexed and root blits; `set` /
  `spec` round-trips through `data-*`; `id` as the root's index key; `type()` over `<template>` with text
  slots; named and anonymous traits; custom ports; one frame loop per root that stops when idle.
- **Add-ons** carried over from the engine and new: `reactions` (with the action registry and toasts),
  `lazy` (children on demand), `offload` (off-screen parking), `widget`, `history`, `place`, `style`,
  `layout`, `edit`; `drag` gains a grip for chromeless controls and stands down in selectable text; `focus`
  takes `frame: false`; `keyboard` takes `tabStop: false`; `pan` takes `press: false`.
- **Connectors route edge to edge**: a curve leaves the face nearest its target (from the
  `cloudcanvas-mcp` branch).
- **The board** (`cloudcanvas/sandbox`): `createBoard`, board parts, and the board runtime bundle for
  exported sites.
- **The site builder** runs on one board: one inspector in three configurations, one structure panel,
  sample layouts as data, reactions, themes, undo, device frames and a vector pencil.

### Fixed

- **Stored XSS from custom-type fields.** A custom type's `html` field reached a card's markup path; the
  loader and the builder's gate now refuse the reserved `html` key on custom-type instances, and slot
  fields under reserved keys (`html`, prototype keys, `cc:`) are dropped with a warning (2026-09-17).
- **Markup only through declared sinks.** Type slots are text unless the template marks one
  `data-slot-html`; widget contents are written as text; see SECURITY.md for the complete list.
- **SVG state and the vectorizer** (added 2026-09-24 without review) were reviewed, tested and folded into
  `cloudcanvas/svg-state`; the pencil's vector blit validates path data and view boxes before they reach
  an attribute.
- A removed view root no longer leaves the board showing nothing.
- A refused widget content key no longer leaves the blit unable to start its traits.

## 0.4.0 (2026-09-04)

### Added

- **`pin.bordered` - the card's border, toggled on its own.** A Pin option
  (`bordered: false`) and a real get/set pair, finer-grained than `chrome` and
  independent of it: `chrome: false` takes the whole card away for a component that
  draws its own, while this leaves the surface, padding, radius and shadow exactly
  where they were and withholds only the border. The state is one class
  (`is-borderless`) on the root element, so it is writable at any time rather than a
  construction-time invariant like `utility` and `selectableText`.
  The stylesheet's half is `border-color: transparent`, **not** `border: none`:
  `box-sizing: border-box` only makes a *specified* width include its border, so
  removing the border shrinks a self-sizing card by 2px in each axis and moves the
  content box of an explicitly-sized one by the same amount. The toggle is a repaint
  and moves nothing, which a browser test asserts to the subpixel.
  *Migration*: none - `bordered` defaults to `true`, which is what every Pin already did.

- **`ResizableTrait` - pointer resizing from edge and corner handles.** Opt-in, and
  holding the trait *is* the toggle: `pin.addTrait('resizable', options)` grants it,
  `pin.removeTrait('resizable')` cancels any live gesture and takes every handle
  element back out of the DOM.
  Options: `directions` (any subset of `n s e w ne nw se sw`, all eight by default;
  an unknown one throws rather than being silently dropped), `minWidth`/`minHeight`
  (default 40 x 24), `maxWidth`/`maxHeight` (unbounded, and never resolved below the
  matching floor), `alwaysVisibleHandles` (default false - handles follow
  `pin.selected` through the `select` signal, which is the canvas-editor convention
  and keeps an idle canvas clean; a Pin built with `selectable: false` needs this
  option).
  Structurally the twin of `DraggableTrait`: the same `DRAG_THRESHOLD_PX` (imported,
  not restated), the same one-way gate, the same announce-at-the-threshold discipline
  so a click on a handle is silent, and the same missing-event cancellation
  convention. Deltas are projected through `screenToCanvas` at both ends, so a resize
  is correct at every zoom and survives a pan mid-gesture. A near-edge drag (`n`/`w`
  components) moves the origin to hold the far edge still, including while the box is
  clamped against its own minimum.
  Handles are direct children of the Pin's **root** element - not the content node,
  which display traits rebuild - and each carries `data-cc-control` (so the pointer
  router declines the deferred capture and `DraggableTrait` stands down) plus
  `data-cc-resize-handle="<direction>"`, identity-checked against the trait's own map
  so a child Pin's handle never resizes its parent.

- **Two new Pin signals, `resize:start` and `resize:end`**, added to
  `PIN_SIGNAL_TYPES` and therefore relayed by `PinSignalBus` like every other one.
  `resize:start` carries `{width, height, direction}` - the box the gesture is
  leaving from, mirroring `drag:start` - and `resize:end` carries
  `{width, height, cancelled}`, mirroring `drag:end`.
  *Migration*: a handler subscribed through `PinManager.onSignal` now sees two more
  event types; filter on `event.type` as the existing drag handlers already do.

- **`resizePin(pin, width, height)`** applies a new box programmatically: the DOM
  write, the particle write and the invalidation a resize owes the renderer, in one
  call. `pin.particle.setSize` alone has never resized anything on screen and still
  does not; this is the supported route.

- **`data-cc-bordered="true|false"`** is honoured by `hydrate()`: `bordered` joins
  the boolean-coerced option set, so authored markup cannot silently pass the
  *string* `"false"` (which is truthy) and be ignored.

- **Exported**: `ResizableTrait`, `resizePin`, `RESIZE_DIRECTIONS`, `RESIZE_HANDLE_ATTR`,
  `RESIZE_HANDLE_CLASS`, `MIN_RESIZE` from the package root, and the trait is
  registered as `'resizable'` in `TraitRegistry` so the registry name works from the
  built bundle. `CONTROL_ATTR` is now named in `src/pins/pin-element.js` rather than
  only spelled inside `CONTROL_SELECTOR`, because code that *writes* the attribute
  needs the same string the two layers reading it were built from.

- **A right-click menu of the canvas's own, and a registry to put commands on it.**
  `registerMenuItem({id, label, when, action, group})` / `unregisterMenuItem(id)`
  (plus the `MenuRegistry` class and its `menuRegistry` singleton) from the package
  root. `when(session, context) -> boolean` decides visibility per opening and
  `action(session, context)` runs on click, where `context` is `{pin, x, y}` and
  `pin` is null on bare canvas. Ids are unique - re-registering one throws rather
  than displacing a command something else registered - registration order is render
  order, and items sharing a `group` render together, separated from the next group
  by a rule. `menuRegistry.clear()` restores the built-ins, exactly as
  `TraitRegistry.clear()` does.
  Built in by default: `nav-back` ("Back"), `nav-forward` ("Forward"), and the
  Pin-scoped `bring-to-front` / `send-to-back`.
  The menu is one element in the session's overlay layer, built by `mount()` and
  removed by `destroy()`; every item is a real `<button>` inside `role="menu"`, so
  keyboard operation is the platform's. It closes on an outside `pointerdown`, on
  `Escape`, and on running a command - and hands focus back to the host on the way
  out.
  **The native menu is still a real outcome.** If no command's `when()` passes, the
  event is left completely alone and the platform's own menu opens as it always did;
  suppression is earned by having something better to show.
  *Migration*: none, unless a page relied on right-clicking a Pin doing nothing.

- **`bringToFront(pin)` / `sendToBack(pin)`** move a Pin's element among its
  siblings - paint order among equals *is* document order, so there is no z-index
  bookkeeping to keep in step. Send-to-back stops in front of the focus veil, which
  is the plane's deliberate first child. Elevation (`cc-elevated`, `cc-dragging`)
  is the orthogonal axis and still outranks both.

- **`session.goForward(options)` - Forward to `popFocus()`'s Back.** `popFocus()`
  now pushes the state it leaves onto a forward stack (`session._forwardStack`), and
  `goForward()` pops it back, sharing one `restoreState` with `popFocus` so the pair
  is symmetric rather than merely similar. Any *new* navigation - `focus`,
  `pushFocus`, `promoteToRoot`, `focusParent`, `unfocus` - invalidates the forward
  history, which is the standard browser rule and is enforced in exactly one place
  (`focusPin`, which every new navigation runs through and neither traversal does).
  `goForward()` with nothing ahead is a no-op rather than a reset: it announces
  nothing, publishes nothing, and moves nothing.
  *Migration*: none. `canGoBack(session)` / `canGoForward(session)` are exported from
  `src/engine/navigation.js` for chrome that needs to enable or disable its own
  buttons.

- **The new `.cloudcanvas-context-menu*` rules** in `CANVAS_DEFAULT_CSS`, reading
  `--cc-menu-bg`, `--cc-menu-border`, `--cc-menu-item-bg`, `--cc-menu-item-bg-hover`,
  `--cc-menu-min-width` and `--cc-z-menu` - each chaining through a card or button
  token to a foundation one, so a theme that restyles cards restyles the menu with
  them and nothing new has to be named.

- **A "Sandbox" tab on the product site: a working site builder** (`examples/`,
  six new files - `website-sandbox.js` plus `-chrome`, `-widgets`, `-inspector`,
  `-profiles` and `.css`). A palette of the sixteen `lib/` base widgets and a
  Container; click to place one at the middle of the view (cascaded so repeats
  never stack exactly) or drag it from the palette to a point, converted through
  `session.viewport.screenToCanvas`; a drop onto a Container nests it in that
  Pin's scope. Every placed widget is draggable, selectable and `resizable`. An
  Inspector shows for a single selection with two-way X / Y / Width / Height,
  a `bordered` checkbox, and one editor per content key - text, number, checkbox,
  or a JSON textarea for arrays and objects, which refuses invalid JSON rather
  than writing half a value to the canvas.
  Profiles auto-save to `localStorage` through `autoSaveSession`; the toolbar
  carries New, Save As, Load, Delete, Download as ZIP (`downloadStaticSite`) and a
  live save indicator. **Opening the tab restores the last profile with no click**,
  which is the feature the rest of it exists to serve. `restoreTree` brings the
  `resizable` trait, the border state and the card chrome back with it.
  The site shell barely moved - a `data-tab="sandbox"` button and panel in
  `website.html`, and the module's entry in `LAZY_TAB_MODULES` - because the tab
  claims itself through `registerTab('sandbox', mount)` exactly as Examples does.
  The one further shell change is the page's light theme: `setTheme` now applies
  `{...LIGHT_THEME, ...LIB_LIGHT_THEME}` rather than the core set alone, because
  the Sandbox is the first tab to render base-kit widgets and their nine tokens
  (`--cc-tone-*`, `--cc-input-*`, `--cc-track-bg`, `--cc-thumb-bg`) were otherwise
  left on their dark fallbacks in light mode. The two sets share no key, so this
  is purely additive and no other tab's rendering changes.
  Nothing in `src/` or `lib/` changed to make it work; the one capability it had
  to supply itself is **click-to-select**, which the core deliberately does not
  wire (see ARCHITECTURE.md §2.17).
  Covered by `tests/browser/website-sandbox.test.js`: fifteen checks against the
  real page in real chromium, including a page reload that must restore the exact
  layout untouched, and a Download as ZIP that must produce a file on disk an
  independent extractor can read.

### Changed

- **BREAKING (behaviour): `session.focus(pin)` now promotes.** Zooming into a Pin and
  making it the parent view were always the same gesture; having them be two calls
  (`focus` and `promoteToRoot`) meant the interesting one was the one nobody reached
  for. `focus(pinOrId, options)` defaults `options.promote` to `true`, so the
  targeted Pin becomes the render root - its subtree plus its full ancestor chain
  stay mounted, everything else demotes, and the breadcrumb is what leads back out.
  `pushFocus` and `promoteToRoot` are unchanged, and `popFocus()` still restores
  exactly what was left.
  The two internal call sites that are the *user's* "zoom into this pin" gesture went
  with the default: `FocussableTrait`'s click-to-focus and keyboard `Enter` on a
  roved-to Pin. Everything else that focuses (`focusParent`, the internal camera
  work) is unchanged and still camera-only.
  *Migration*: pass `{promote: false}` for the old camera-only behaviour -
  `session.focus(pin, {promote: false})` is exactly what `focus(pin)` used to do.
  For a Pin whose click should look without zooming in, `new FocussableTrait({
  focusOnClick: true, promote: false })`.

- **Re-focusing the Pin that is already the promoted root stacks nothing.**
  `promoteToRoot` now re-frames instead of pushing a second identical entry: with
  promotion as the default outcome of every click and every Enter, a duplicate is a
  Back that goes nowhere, and repeat activation is exactly how one arrives at it.

### Fixed

- **The example pages boot again.** `examples/app.js`, `website.js`,
  `website-showcase.js` and `gallery.js` still imported the component library
  (`createBreadcrumbPin`, the chat/calendar/flow factories, `injectComponentStyles`,
  the gallery's six) from `../src/index.js` after 0.3.0 moved that library to
  `lib/components/`, so every example page died at module evaluation with
  *"does not provide an export named ..."*. They import from
  `../lib/components/index.js` now, which is where the package's `./components`
  export points. The core surface is unchanged; only the examples were wrong.

### Notes

- **Why a resize writes the DOM as well as the particle.** The renderer never writes
  a Pin's box: its read phase *reads* `offsetWidth`/`offsetHeight` into the particle,
  so `particle.setSize` on its own changes nothing on screen and is overwritten by the
  next measurement. `resizePin` writes the element's inline size (with `max-width: none`,
  so the card's readable-measure clamp cannot cap a width the user just dragged out),
  writes the particle, then `invalidate('content')` - which queues
  the next read phase *and* puts the Pin in the frame's dirty set, so connectors
  anchored to its centre and the scope well it sits in both follow it.

## 0.3.0 (2026-09-03)

The syntax-refinement release: a correctness fix for DOM adoption, the adoption/
hydration API that fix unlocked, a concision pass across `Pin`'s public surface, two
small API merges, a documentation correction on `transmit()`, and prebuilt
distribution bundles. Every deprecated name keeps working - `Removed in 0.4.0`.

### Fixed

1. **A Pin built from `options.element` (adoption) is now interactive.** `setupElement`
   was only ever applying `cloudcanvas-pin` inside `createDefaultElement`, which never
   runs when a caller supplies their own element - so an adopted Pin's `DraggableTrait`/
   `SelectableTrait`/keyboard actions silently never fired, because the pointer and
   keyboard routers resolve every event through `.closest('.cloudcanvas-pin')`. The class
   is now applied unconditionally and additively in `setupElement` itself.
   *Migration*: none - this only makes previously-broken adoption work.

### Added

2. **`session.adopt(element, options)`** turns a real, pre-existing DOM element - hand-
   authored or server-rendered, children and all - into a live Pin with zero framework-
   side re-creation of its markup. Backed by a new `preserve` display type whose
   `build`/`update` are both true no-ops.
3. **`session.hydrate(container, selector = '[data-cc-pin]')`** walks a container for
   matching elements and adopts each one, inferring parent/child Pin relationships from
   DOM nesting and reading `data-cc-*` attributes as construction options (numeric keys
   throw on a non-numeric value rather than silently producing `NaN`; boolean keys accept
   only the literal strings `"true"`/`"false"`). A whole static page becomes a canvas with
   no `createPin` calls at all.
4. **`Pin` gains read-only `x`/`y`/`z`, `magnitude`, `gradient`, and `displayTrait`
   getters**, and real `get`/`set` pairs for `selected`, `dragging`, and `pinned`,
   matching the `lazy` accessor already on the class.
5. Prebuilt distribution bundles: `dist/cloudcanvas.esm.js` (+ `.min.js`) for
   `<script type="module">` over http(s), and `dist/cloudcanvas.iife.js` (+ `.min.js`)
   exposing `window.CloudCanvas` for the strict zero-server `file://` case - confirmed
   empirically that an ESM bundle, even at a single file, still fails under `file://`
   (Chromium's module loader requires a CORS-mode fetch regardless of file count), so
   only the IIFE build satisfies "open the HTML file with nothing running." Built by
   `npm run build` (esbuild, devDependency-only), a release-time step never required for
   framework development.

### Deprecated (removed in 0.4.0)

6. **Pure forwarding getters** now delegate to the collection they wrapped -
   `getContent`/`hasContent`/`getAllContents` (→ `pin.contents`), `getTrait`/`hasTrait`/
   `getTraits` (→ `pin.traits`), `getChildren` (→ `pin.children`), `getVectors`/
   `getVector`/`getPrimaryVector`/`getMagnitude`/`getGradient` (→ `pin.particle`, or the
   new `pin.magnitude`/`pin.gradient` getters). *Migration*: read the Map/Set/particle
   directly, or use the new getter.
7. **`setSelected`/`setDragging`/`setPinned`** → assign `pin.selected`/`pin.dragging`/
   `pin.pinned` instead.
8. **`getType`/`setType`** → `getDisplayTrait`/`setDisplayTrait` (the old names return/
   accept a trait instance, not a string, which the old names actively misled about).
9. **`Viewport#focusOn`** → `Viewport#zoomToFit` (identical math, one call site); the
   canonical name now throws `TypeError` on a box that describes nothing instead of
   silently framing the origin.
10. **`session.resetView()`** → `session.unfocus()` (undifferentiated one-line alias).

### Documentation

11. **`ARCHITECTURE.md`'s `transmit()` section was wrong** about what it dispatches on -
    corrected to state precisely that `transmit()` dispatches on the **Pin instance**
    (not `.element`), walking the Pin's `.parent` graph, which is why it survives
    detachment and reaches elementless utility Pins. For an ordinary, always-mounted UI
    subtree, native `pin.element.dispatchEvent(new CustomEvent(type, {bubbles:true}))` +
    `parentPin.element.addEventListener(...)` already works today via real DOM nesting
    and is now documented as the default reach, with `transmit()` reserved for what
    native bubbling structurally cannot do.
12. `src/index.js`'s 126 exports are now grouped into three banked comment sections -
    start here, everyday, advanced/custom-host-authors - with `createCanvasSession`/
    `Pin`/`PinEvent` moved to the top of the file.

### Packaging

13. **The pre-built pin-board component library moved from `src/components/` to
    `lib/components/`**, and the core barrel (`src/index.js`) no longer re-exports it -
    neither the flat 25-name list nor the `components` namespace object. Two defects
    this closes: the top-level `traitRegistry.registerDefaults(registerComponentTraits)`
    call that ran the moment anyone imported `cloudcanvas` (registering 12 component
    traits into the shared registry as a side effect of importing the *core*) is gone -
    registration is explicit-only now, same discipline as `lib/index.js`'s base kit -
    and every file that library imported through deep paths into `src/pins/traits/*` and
    `src/graphics/primitives/primitives.js` now goes through the public API only.
    Measured effect: a core-only bundle (`npm run build`) dropped from 67 modules /
    310 KiB to 54 modules / 240 KiB (unminified).
    *Migration*: the public import specifier is unchanged - `cloudcanvas/components`
    still resolves, now to `lib/components/index.js`. Only a consumer importing the
    internal path `cloudcanvas/src/components/...` directly (never a supported path)
    needs to update it. `lib/` also gained its own package export (`cloudcanvas/lib`)
    and joined the published `files` whitelist - it shipped on disk since 0.2.0 but was
    never actually publishable.

## 0.2.0 (2026-09-02)

The conjugate-render release. The frame loop, the trait registry, the event system,
and the reload lifecycle all changed shape, and the interaction, accessibility and
design layers arrived on top of them. Every numbered item below carries its
migration path; where it reads *Migration: none*, the change is additive.

### Rendering & contents

1. **Content keys render as text; markup requires the explicit `html` key.**
   Display templates build their subtree once and thereafter write through `Text.data`
   and attributes, so `title`, `body`, `author`, `caption`, and `label` values are
   escaped by the DOM and can no longer inject markup.
   *Migration*: a Pin that genuinely needs markup sets the `html` content key (supported
   by `raw`, and by `card` as a per-Pin override that replaces the whole card template).

2. **A custom `render` receives the Pin's content element and runs only on content changes.**
   `DisplayTrait({ render })` is called as `render(pin, contents, contentElement, context)`
   with `.cloudcanvas-pin-content` - never the Pin's root element and never its scope
   container, so no display implementation can detach mounted child Pins. It runs from the
   renderer's write phase for Pins marked content-dirty, not once per frame.
   *Migration*: renderers that wrote into `pin.element` write into the supplied element
   instead. A renderer that must keep the build-once contract can pass a
   `{ build, update }` template pair instead, which outranks `render`.

3. **The trait registry is definition-based; trait instances are per-Pin.**
   `TraitRegistry` stores `{ name, ctor, defaults }` definitions and never instances.
   - `register(name, ctor, defaults)` - **throws** on a duplicate name (silently replacing
     a definition other code depends on was the old behaviour) and on a non-function ctor
     or empty name. `unregister(name)`, `has(name)`, `get(name)`, `list()` and `clear()`
     (which restores the built-in set) complete the surface.
   - `create(name, options)` returns a **fresh instance every call**, shallow-merging caller
     options over the registered defaults; `capabilities` is the one additive key, so a
     caller extends the capability set instead of erasing it.
   - The registry holds definitions only. The live instance index is
     `PinManager.traitIndex` / `capabilityIndex`.
   *Migration*: code that reached into the registry for a shared trait instance now looks
   up `manager.getPinsByTrait(name)` / `getPinsByCapability(cap)`; two Pins declaring the
   same trait name no longer share connections, selection, or drag state.

4. **`PinEvent` no longer assigns `target`; the origin is `detail.source`.**
   `PinEvent extends CustomEvent`, so the DOM owns `target` during dispatch. The `target`
   constructor option is accepted only as a legacy alias for `source`.
   *Migration*: read `event.detail.source` (or `event.payload` for the value). `cancelled`
   remains as an alias for `defaultPrevented`.

5. **`pin.lazy` is a derived getter over `reload`.**
   `lazy` reads `reload === 'lazy'`; assigning it sets `reload` to `'lazy'` or `'active'`.
   Reload state is otherwise the single flag, and an unknown strategy string **throws**
   rather than silently downgrading a Pin's lifecycle.
   *Migration*: declare `reload: 'active' | 'persistent' | 'lazy'`; `lazy: true` still works
   as the construction alias.

6. **Removed: `typeRegistry`, `VectorPointerTrait`, `ScopeTrait.title`.**
   *Migration*: `typeRegistry` -> `traitRegistry`; `VectorPointerTrait` -> the
   `vector-pointer` display type (`type: 'vector-pointer'`, or
   `new DisplayTrait({ displayType: 'vector-pointer' })`); a scope caption is ordinary
   contents on the scope Pin.

### API surface

7. **`Pin.addTrait` throws instead of failing quietly.**
   An unregistered trait name, a non-string/non-`PinTrait` argument, a name/instance
   mismatch, and a second trait of a name the Pin already carries all throw. A trait whose
   `onAttach` throws is rolled back, never left half-registered.
   *Migration*: use `replaceTrait(nameOrTrait, options)` to swap a trait, and `setType()`
   for the display trait (atomic: the previous display traits are restored if the swap fails).

8. **`Pin.setContents` throws when the display trait's `allowedKeys` rejects a key.**
   The merge is rolled back first, so a Pin is never left half-updated.
   *Migration*: declare `allowedKeys` deliberately (it is `null` - unconstrained - by
   default), or catch the error at the call site.

9. **`ParticleEngine` takes no constructor options.**
   `new ParticleEngine(options)` silently ignored everything passed to it; the constructor
   now declares its own state only.
   *Migration*: configure motion per particle (`friction`, `mass`, `pinned`) and per session
   via `addForceField(fn)`.

10. **Session focus framing defaults come from the target's `FocussableTrait`.**
    `focus()` / `pushFocus()` read `padding` and `maxZoom` off the focused Pin's own trait;
    caller options still win.
    *Migration*: move per-target framing onto the trait
    (`new FocussableTrait({ padding, maxZoom })`) instead of repeating it at every call site.
    `FocussableTrait` is now framing only: `cursorColor`, `label` and `showFrustum` are no
    longer read, because the reticle is the session's `cursor-focus` cursor rather than a
    per-Pin drawing. Reskin the cursor definition once instead of configuring every Pin.

11. **The default export is gone from `src/index.js`; named exports only.**
    A hand-maintained aggregate object drifts every time a symbol is added.
    *Migration*: `import { createCanvasSession, Pin } from 'cloudcanvas'`, or
    `import * as CloudCanvas from 'cloudcanvas'` for a namespace object.

### Graphics primitives

12. **Colors and URLs crossing the markup boundary are validated, not just escaped.**
    `safeColor()` accepts only hex, `rgb()/rgba()/hsl()/hsla()`, bare keywords, and
    `var(--name[, fallback])` (the fallback is validated in turn); anything else degrades to
    the fallback color. `safeUrl()` passes relative and `http(s)` URLs and `data:image/*`,
    rejecting `javascript:` and `data:text/html`. `safeNumber()` keeps `NaN`/`Infinity` out
    of paths and attributes.
    *Migration*: a badge, stroke, or connector color that was previously an arbitrary string
    (`#fff;"><img onerror=...>`, or any CSS expression outside the grammar) now renders as
    the fallback instead of as markup.

13. **`createGradientMeterSVG` renders 0% when `min === max`.**
    The degenerate span previously divided by zero and produced `NaN%` in the inline width.
    *Migration*: none; a zero-width span is now a defined, empty meter.

### Design system

14. **Every template class is namespaced: `pin-*` is now `cloudcanvas-pin-*`.**
    The 13 class names the built-in display templates emit are declared once, in the
    exported `CLS` table (`import { CLS } from 'cloudcanvas'`), and matched by
    `CANVAS_DEFAULT_CSS`. Full map: `pin-header` -> `cloudcanvas-pin-header`,
    `pin-title` -> `cloudcanvas-pin-title`, `pin-badge-slot` -> `cloudcanvas-pin-badge-slot`,
    `pin-body` -> `cloudcanvas-pin-body`, `pin-footer` -> `cloudcanvas-pin-footer`,
    `pin-author` -> `cloudcanvas-pin-author`, `pin-action-btn` -> `cloudcanvas-pin-action-btn`,
    `pin-needle-slot` -> `cloudcanvas-pin-needle-slot`, `pin-gauge` -> `cloudcanvas-pin-gauge`,
    `pin-label` -> `cloudcanvas-pin-label`, `pin-meter-slot` -> `cloudcanvas-pin-meter-slot`,
    `pin-media` -> `cloudcanvas-pin-media`, `pin-caption` -> `cloudcanvas-pin-caption`.
    The vector-pointer body additionally carries `cloudcanvas-pin-gauge-row`.
    *Migration*: rename the selectors in any host stylesheet, or delete them - the
    framework now ships a complete default look for all of them.

15. **Templates emit no inline styles; the default stylesheet is fully tokenized.**
    Layout and color that used to live in `style` attributes on the gauge, label, media
    and caption nodes are class rules in `CANVAS_DEFAULT_CSS`, so a host rule can
    override them without `!important`. Every themable value in that sheet is a
    `var(--cc-*, <dark default>)` read: the dark theme *is* the fallback chain.
    *Migration*: a host rule that previously lost to an inline style now wins. Retint
    with tokens (`--cc-card-bg`, `--cc-btn-*`, `--cc-text-muted`, ...) rather than
    restating rules.

16. **`applyTheme(host, vars)` and `LIGHT_THEME`; `injectSessionStyles(css)` splits off
    the base sheet.** `applyTheme` writes `--cc-*` custom properties onto a host element
    (a `null` value removes one token, a `null` map clears them all); `LIGHT_THEME` is the
    frozen reference override set. `injectCanvasStyles()` is now write-once: it never
    rewrites a base `<style>` the document already has, and its `customCSS` argument is
    deprecated in favour of `injectSessionStyles(css)`, which returns a removable
    `<style data-cc-session>` element.
    *Migration*: `injectCanvasStyles(css)` still works and still injects, but the CSS now
    lands in its own element; take the return value of `injectSessionStyles` and remove it
    on teardown.

### Interaction

17. **The wheel scrolls the canvas; it no longer always zooms.**
    A `wheel` event is normalized to pixels of intent (`deltaMode` 0/1/2 x 1/16/host
    height) and clamped to +/-160px per event, then routed three ways: `ctrl`/`meta`
    is a trackpad pinch and zooms about the pointer (`exp(-d * 0.01)`); an unmodified
    event that looks like a discrete notch (non-pixel `deltaMode`, or vertical-only,
    integral, and >= 40px) zooms about the pointer at ~1.2x per notch
    (`exp(-d * 0.0015)`, exactly reversible); **everything else pans the camera**,
    on both axes, against the gesture. A purely horizontal event never zooms, and
    `deltaY === 0` never zooms. The maths is pure and exported from
    `src/engine/wheel.js` (re-exported by `pointer.js`); every constant is tunable.
    *Migration*: a page that relied on "any wheel = zoom" now gets a two-axis pan
    from a trackpad. Zoom programmatically (`viewport.zoomAt`) or bind your own
    handler if you need the old behaviour.

18. **Gestures require the primary pointer's main button, and touch pinches.**
    A gesture starts only on `isPrimary && button === 0` - a right or middle button
    no longer pans - with one deliberate exception: the second finger of a touch
    pinch, admitted only while exactly one gesture pointer is already down. Two live
    pointers cancel any drag or pan and become a pinch (zoom by the separation ratio
    about the *previous* midpoint, plus midpoint translation); lifting back to one
    finger resumes the pan with no jump. `contextmenu` is suppressed **only**
    mid-gesture; idle, the native menu opens as the platform intended.
    *Migration*: none, unless you drove the canvas with a non-primary button.
    Removed dead session fields: `activePointer`, `touchPinchDist`, `dragOffset`.

19. **A pointer gesture that starts on a control is not captured.**
    `setPointerCapture` retargets the rest of the stream - including the `click`
    computed from it - so capturing on the host made every `<button>`, `<a>`,
    `<input>`, `<select>`, `<textarea>`, `<label>` and `contenteditable` inside a Pin
    unclickable. Capture is now declined for those, and for a press inside selectable
    text. The window listeners deliver the gesture either way.
    *Migration*: none. Interactive content inside a Pin now works.

20. **`selectableText: true` makes a Pin's text selectable.**
    The Pin's element gains `is-selectable-text`, the content node gets
    `user-select: text` and a text cursor, and a `pointerdown` inside it is flagged
    (`_ccTextRegion`) so `DraggableTrait` stands down and the press places a caret.
    The **header row stays the drag handle** - `.cloudcanvas-pin-header` keeps
    `user-select: none` and `cursor: grab` - as does the card's own padding, so the
    Pin is still movable. Nested child Pins are unaffected: they are reached through
    the scope container, never the parent's content node.
    *Migration*: opt in per Pin (`createPin({ selectableText: true })`).

### Accessibility

21. **The canvas is fully keyboard-drivable (`src/engine/keyboard.js`).**
    The host is a *single* tab stop (`tabindex="0"`, never overwriting an author's),
    and Pins are roving targets (`tabindex="-1"`), so Tab never walks through
    hundreds of cards. Host-focused: arrows pan 40px (x4 with Shift), `+`/`=` and
    `-`/`_` zoom 1.2x about the host centre, `0` resets, `Enter` drops into the Pins,
    `Escape` pops focus, `Home` unfocuses. Pin-focused: arrows rove **reading order**
    (top-to-bottom then left-to-right over participating, awake Pins), `Enter`
    focuses the Pin, `Escape` returns to the host. Handled keys are defaulted away
    and nothing is taken from an editable target or a native control. The table is
    exported as `KEY_BINDINGS`; `ensureVisible(session, pin)` and `readingOrder(session)`
    are exported beside it.
    *Migration*: none, but `role="application"` (below) ships *because* these keys do.

22. **ARIA identity, and a live region for everything transient.**
    The host takes `role="application"`, `aria-roledescription="canvas"` and an
    `aria-label` (`options.label`, default "Interactive canvas"); Pins take
    `role="group"`, `aria-roledescription="pin"` and an `aria-label` funnelled from
    their `title` content on every render (change-gated, so an idle frame still
    writes nothing). The SVG and cursor layers are `aria-hidden="true"`. One polite
    `role="status"` region (`.cloudcanvas-live-region`) announces focus changes
    ("Focused X" / "Focus cleared"), provider results ("N items loaded") and provider
    failures. **Author values are never overwritten**, on any of these attributes.
    *Migration*: a host that already declared a role or label keeps both.

23. **Reduced motion is honoured by construction.**
    `prefersReducedMotion()` (exported from `viewport.js`) caches one `matchMedia`
    query and tracks changes; when it matches, `animateTo` jumps to the target and
    fires `onComplete` synchronously, so every camera path - `focus`, `pushFocus`,
    `popFocus`, `resetView`, `ensureVisible` - collapses at one choke point. The CSS
    half is a `@media (prefers-reduced-motion: reduce)` block over pins, the focus
    veil and the SVG slots' inline transitions.
    *Migration*: none.

24. **Badge text contrast is computed, and a theme can take the decision back.**
    For a six-digit hex tint, `createBadgeSVG` composites the fill over the assumed
    card surface and picks whichever default foreground clears 4.5:1 (asserted for the
    whole tint sweep). That colour has to be inline, so it is emitted as the
    *fallback* of a token read - `color: var(--cc-badge-text-override, <computed>)` -
    because an inline declaration outranks any host-level token and a theme that
    merely redefined `--cc-badge-text` was silently losing (light-theme badges measured
    ~1.15:1). `LIGHT_THEME` now sets `--cc-badge-text-override`, which is an explicit
    theme choice: one colour cannot be the best foreground for every tint, but on a
    light card the whole range wants dark text. The assumed surface is a parameter
    (`createBadgeSVG(label, color, { surface })`), and `relativeLuminance` /
    `contrastTextFor` / `compositeOver` are exported from the package root.
    *Migration*: a theme that retinted badge text through `--cc-badge-text` should
    set `--cc-badge-text-override` as well; the old token still styles hand-authored
    badge markup.

### Layout & layering

25. **A scope well is a state the renderer grants, not the default.**
    Every Pin owns a `.cloudcanvas-pin-scope` container, so an empty one now costs
    nothing at all: `display: none`, no border, no gap. The box, dashed outline,
    gap and clipping arrive with `cc-populated`, written only when a live child is
    actually inside, together with a `min-height` measured from the children's own
    offsets. **A populated well clips** (`overflow: var(--cc-scope-overflow, hidden)`),
    so a child can no longer spill over its parent's siblings.
    *Migration*: a Pin whose children were deliberately overflowing sets
    `--cc-scope-overflow: visible`. Authored heights on scope Pins should be dropped -
    the well measures itself.

26. **Focus elevation is a chain, and it dims what it is not.**
    Raising one element cannot lift it out of an ancestor's stacking context, so
    focusing (or dragging) a Pin walks the parent chain and marks every scope above it
    (`cc-elevated` / `cc-dragging`, `--cc-z-elevated` / `--cc-z-drag`). A focus also
    raises `.cloudcanvas-focus-veil` - a plane-level dimmer, on by default, disabled
    with `--cc-focus-veil: transparent`.
    *Migration*: pages relying on the old flat z-order may need to restate their own
    layering through the `--cc-z-*` tokens.

27. **`session.place({ width, height, near, anchor, margin })` picks a free spot.**
    A deterministic ring search out from the viewport centre (or an anchor, or a
    near-Pin's centre) that returns the first canvas top-left where the padded box
    hits no existing Pin. Exported as `place` too.
    *Migration*: replace random scatter (`Math.random() * 800`) at spawn sites.

28. **Global SVG groups only redraw for the camera if they ask to.**
    The SVG layer carries the same transform as the plane, so a canvas-space trait's
    geometry survives a pan or a zoom untouched. A group is now rewritten on a camera
    move only when its trait declares `screenSpace = true`; every built-in trait draws
    in canvas space and is skipped, which takes a full rebuild of every connector out
    of every frame of every camera animation.
    *Migration*: a custom `global-render` trait that projects to screen space itself
    must set `screenSpace = true` on its instances.

### Also in this release (non-breaking)

- `ConjugateRenderer`: one three-phase frame (structure -> batched reads -> writes), a
  three-float position diff instead of per-frame transform writes, and content work only
  for Pins marked dirty.
- Reload strategies (`active` / `persistent` / `lazy`) with a `loadChildren` provider that
  is single-flight, run-once, removal-race-safe, and re-armed by `unload()`; a rejected
  provider transmits a bubbling `childrenerror` event.
- Root promotion (`promoteToRoot`, `pushFocus(pin, { promote: true })`) with live
  breadcrumbs (`pin.breadcrumb()`, `session.breadcrumb()`) and full restore on `popFocus()`.
- Persistent per-trait `<g data-trait>` SVG groups: an idle frame performs zero `innerHTML`
  assignments.
- Frame-rate independent simulation: `dt` derives from the rAF timestamp and damping is
  `friction ** dt`.
- Null-pin cursors: one utility Pin (`__cursor__`) carrying `cursor-focus`, `cursor-selected`
  and `cursor-activated`, each tracking an independent target and drawing into a persistent
  `<g data-cursor>` in the overlay. Utility Pins are filtered out of every caller-facing
  query (`getAllPins`, root/active lists, spatial queries). Cursors are registry definitions:
  re-register one and call `session.remountCursors()` to reskin a live session, targets and
  all. A cursor draws only on a visible target - awake, mounted, and inside the promoted
  render root - and hides without forgetting the Pin, so it returns when the Pin does.
- Pin lifecycle signals (`activate`, `deactivate`, `select`, `destroy`) re-broadcast by
  `PinManager.onSignal(handler)`, giving the session one subscription point for state that
  changes inside a Pin.
- Trait-level dirty signalling for the SVG group layer: a `global-render` trait that mutates
  its own state bumps `this.revision`, and the group redraws on the next frame without
  waiting for anything to move. `ConnectableTrait.connectTo` / `disconnectFrom` do so.
- `pin.transmit()` accepts native `Event`/`CustomEvent` instances (wrapped, never mutated)
  and dispatches natively, so plain `addEventListener` subscribers receive Pin events.
- `npm run test:browser`: a Playwright smoke suite under `tests/browser/`, separate from
  the headless `npm test` unit and integration suites. `tests/browser/fixtures/bare.html`
  is a page with no CSS of its own, so the framework's default look is asserted from
  computed styles rather than eyeballed.
- Accessibility and interaction CSS: a `:focus-visible` ring on host and pins, a pin
  hover lift, 28px action buttons that grow to 44px under `@media (pointer: coarse)`,
  the `.cloudcanvas-live-region` visually-hidden class, and the `is-selectable-text`
  rules. The stylesheet itself moved to `src/graphics/styles-css.js` - it is data, not
  code - and is re-exported unchanged from `styles.js`.
- Connector strokes default to `var(--cc-connector, rgba(56, 189, 248, 0.6))`, so a theme
  retints the graph edges without touching any `ConnectableTrait`.
- The focus reticle was redesigned: corner brackets around the target rather than a
  dashed box, and the frustum spikes now reach from the focused Pin's **parent scope**
  corners - the real box of the scope it lives in - instead of the whole viewport,
  which is what every reticle used to claim as its parent. A Pin at the canvas root
  has no parent scope and so draws no frustum at all.
- `cc-moving`: `will-change: transform` is granted while a Pin is actually in motion
  and swept ~30 frames after it stops, so a canvas of stationary Pins costs no layers.
- `npm run test:browser` now runs two suites: `smoke.test.js` (the canvas end to end)
  and `acceptance.test.js` (the UI review's own probes - pinch through CDP, reduced
  motion, the parent-scope frustum, nine non-overlapping spawns, real text selection,
  badge contrast under both themes, and the reticle caption's contrast on the bare page).
- **The focus reticle's caption has its own colour token, `--cc-cursor-label`.** The
  stroke is a marker read as a shape; the caption is text with a WCAG floor, and the
  focus red it used to inherit measured **2.29:1** on the default canvas. The caption
  now paints `var(--cc-cursor-label, var(--cc-text, #e2e8f0))`, so it is the canvas's
  own body colour by default and a theme that moves `--cc-text` carries it along;
  `LIGHT_THEME` states `#1e293b` explicitly. Measured on the zero-CSS fixture: 15.31:1
  dark, 13.41:1 light. `CursorFocusTrait` takes `labelColor`, and
  `createFocusCursorSVG(bounds, { labelColor })` is the primitive-level knob; the
  caption element carries `.cloudcanvas-focus-cursor-label`.
  *Migration*: none. A reskin that wanted the caption in the reticle colour passes
  `labelColor` explicitly.
- **`destroy()` hands the host element back as it was found.** The session used to
  leave the `cloudcanvas-host` class, `role`, `aria-roledescription`, `aria-label` and
  `tabindex` on a host it no longer occupied. Each is now *recorded when written* and
  reversed only if this session was the one that added it - the mount path's
  author-values-win rule, read from the other end - so a page that had already labelled
  or classed its own canvas keeps every value through a full mount/destroy cycle, and a
  bare `<div>` comes back with zero attributes and zero children.
  *Migration*: none, unless you relied on the residue to style a torn-down host.
- **A press on a control inside a Pin no longer starts a drag, and a click wobble no
  longer moves the card.** `DraggableTrait` stands down for the same control list the
  pointer router already declines to capture for (`button`, `a[href]`, `input`,
  `select`, `textarea`, `label`, `contenteditable` - one exported `CONTROL_SELECTOR` in
  `src/pins/pin-element.js`, read by both layers), and translation begins only after
  the pointer has travelled more than `DRAG_THRESHOLD_PX` (3px, deliberately under
  `FocussableTrait`'s 5px click-travel guard so the two agree about what a click is).
  The drag offset is still measured at the press, so a real drag is exact - the travel
  spent crossing the threshold is carried, not swallowed.
  *Migration*: none. A gesture that must move a Pin from a button has to drag its chrome.
- The focus veil is `aria-hidden="true"`, alongside the SVG layer and the cursor overlay:
  it is a dimming surface with no content of its own. `.cloudcanvas-pin-author` states
  `line-height: 1.45` - the sheet's body ratio - instead of inheriting whatever the host
  page declared and moving the footer row's height with it.
- **`options.displayTrait` is the sanctioned custom-display path**, and
  `injectSessionStyles` is removable rather than host-scoped. Both are documented in
  ARCHITECTURE (§2.2 and §2.13): a display trait passed through `traits: [...]` throws,
  because the default has already claimed the name `display` and a Pin holds at most one
  trait per name; and a session stylesheet's rules are global for as long as the element
  is in the document, so consumers scope their own selectors under a host they control.

## 0.1.0

Initial release: Pin model, trait system, particle engine, viewport, and the example harness.
