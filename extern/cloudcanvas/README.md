<!-- Written by Richard Christopher, Copyright 2026 NeoTec, LLC -->

# CloudCanvas

A client-side GUI framework in two exports. A **blit** is a thin handle over any DOM element, HTML or SVG,
placed on an infinite canvas; the DOM tree is the hierarchy, events are native, and state lives in a
`WeakMap` keyed by the element, so the browser owns every lifetime. Everything else - dragging, panning, a
menu, layout, saving - is an add-on you import only when a page uses it.

```
npm install cloudcanvas
```

Native ES modules, no runtime dependencies. Node.js 20+ for the tooling only.

## Quick start

<!-- quickstart -->
```js
import { blit, type } from 'cloudcanvas';
import { drag } from 'cloudcanvas/drag';
import { pan } from 'cloudcanvas/pan';

blit.use({ drag, pan });
type('note', { html: '<h3 data-slot="title"></h3><p data-slot="body"></p>' });

const app = blit('#app');     // a root: plane, overlay, camera, one frame loop
app.set({ pan: true });       // drag empty canvas to pan, the wheel to zoom

const note = app.blit({ type: 'note', x: 40, y: 40, fill: { title: 'Hello', body: 'Drag me.' }, drag: true });
note.on('drag:end', (event) => console.log('came to rest at', event.detail.payload));
```
<!-- /quickstart -->

`#app` is any element with a size. That is the whole application: 7.8 KB gzipped for the core, plus
2.0 KB for drag and 2.7 KB for pan. 

## The model

| Concept | What it is |
|---|---|
| **blit** | `blit(el \| selector)` returns the element's handle, the same one every time. Detached or a `<template>`, a blit is *potential* (writes apply at once); inside a root it is *indexed* (placement waits for the frame's write phase); `blit('#app')` on a bare host makes a *root*. |
| **set** | `b.set({...})` routes each key: `x y z w h` to the port, `id` to the element (the root's index), `fill` into `[data-slot]`s as text, a named trait or `port` to its function, everything else to `data-*`. `b.spec` reads it all back, so `parent.blit(b.spec)` reproduces `b`. |
| **tree** | `b.blit(spec)` adds a child (into the blit's `[data-scope]` if its type has one), `b.blits`, `b.parent`, `b.bounds` (global box), `b.remove()`. On a root: `find(id)`, `view(b)` (frame it), `root = b` (promote a branch, hide the rest), `tick(fn, 'read' \| 'write')`. |
| **type** | `type(name, {html, defaults, with})`: a potential blit over a `<template data-type>`, cloned into every instance. Text fills slots; markup only reaches a slot the template marks `data-slot-html`. |
| **trait** | `(b, options, root) => cleanup`. Named with `blit.use({drag})`, switched on by a key (`{drag: true}`, `{resize: {minWidth: 40}}`, `false` stops it) or by markup (`data-drag`); anonymous ones ride `with: [fn]`. |
| **port** | `(b, ctx) => void`: what paints a blit. The default writes a `translate3d` and the declared size, each only when it changed; `b.set({port: fn})` swaps it (a canvas, a GPU pass, anything). |
| **events** | `b.emit(type, payload)` is a bubbling, cancelable `CustomEvent` (`detail = {payload, source}`); add-ons announce the same way (`drag:start`, `select`, `resize:end`, `view:change`, `remove`...), so `app.on(...)` hears the whole board. |

Markup works too: with the add-ons named, `<div data-blit data-x="40" data-drag>Hi</div>` inside a root's
host is a live, draggable blit the moment the root mounts (`cloudcanvas/observe` picks up markup written later).

## Add-ons

One subpath each; an add-on imported but unused bundles to nothing (`sideEffects` allowlist). Sizes are
gzipped: what importing that subpath alone costs, the core code it reaches included (the core by itself is 7.8 KB).

| Subpath | What it adds | gz |
|---|---|---|
| `cloudcanvas` / `cloudcanvas/core` | `blit`, `type` | 7.8 KB |
| `cloudcanvas/drag` | press past 3px moves the blit; a grip for chromeless controls | 2.0 KB |
| `cloudcanvas/select` | `is-selected`, the `select` event, `setSelected` | 1.2 KB |
| `cloudcanvas/resize` | edge and corner handles, min/max, `resize:*` events | 3.2 KB |
| `cloudcanvas/focus` | a zoom target: framing on click, `focus:change` | 1.4 KB |
| `cloudcanvas/pan` | root camera gestures: drag, wheel, trackpad, pinch | 2.8 KB |
| `cloudcanvas/keyboard` | the root as one tab stop; arrows pan, rove, Enter/Space act | 2.4 KB |
| `cloudcanvas/menu` | the root's right-click menu: items by value or a registry, flyouts | 4.5 KB |
| `cloudcanvas/announce` | a polite live region for focus, edits and root changes | 1.3 KB |
| `cloudcanvas/cursors` | focus reticle, selection ring and brackets in the overlay | 4.4 KB |
| `cloudcanvas/motion` | an easing camera: `view()` flies, reduced motion respected | 2.8 KB |
| `cloudcanvas/layout` | `layout: row \| column \| grid \| free`, `gap`, scope wells sized to children | 3.9 KB |
| `cloudcanvas/style` | whitelisted per-blit appearance overrides | 1.6 KB |
| `cloudcanvas/edit` | the edit lock: renders defer while a field has the caret | 0.5 KB |
| `cloudcanvas/place` | free-spot search, `move` (reparent in place), `hit` | 8.8 KB |
| `cloudcanvas/history` | `go` / `back` / `forward` / `reset` over promoted views, `breadcrumb` | 8.3 KB |
| `cloudcanvas/connect` | edge-routed SVG connectors between blits | 3.4 KB |
| `cloudcanvas/physics` | velocity and damping, stepped in the frame | 1.0 KB |
| `cloudcanvas/svg-state` | named SVG states with animated transitions, 3D tilt | 4.8 KB |
| `cloudcanvas/reactions` | "when A emits X, run action Y on B", saved with the board | 12.2 KB |
| `cloudcanvas/lazy` | children loaded on demand from a provider | 0.7 KB |
| `cloudcanvas/offload` | off-screen blits parked out of the DOM, state kept | 1.5 KB |
| `cloudcanvas/gpu` | blits drawn on the GPU (WebGPU, else WebGL2), elements kept as hit proxies; the backend loads on demand (WebGL2 +3.8 KB, WebGPU +4.7 KB); `punch` opens an `over` canvas for DOM blits | 6.5 KB |
| `cloudcanvas/orbit` | Alt + drag turns the camera in 3D, Alt + wheel moves the viewer | 1.0 KB |
| `cloudcanvas/mesh` | lit box, plane and sphere on the GPU, fitted to the blit, turned by `rotate` | 1.3 KB |
| `cloudcanvas/svg-path` | SVG path data filled and stroked as GPU triangles, sharp at any zoom; an inline `<svg>` without a GPU | 8.6 KB |
| `cloudcanvas/sprites` | sheets, frames and animations: one texture per sheet, the CSS background as fallback | 2.5 KB |
| `cloudcanvas/text` | GPU text, re-rastered per zoom bucket; the element keeps the text | 2.1 KB |
| `cloudcanvas/video` | a playing video as a blit, re-uploaded per video frame | 1.6 KB |
| `cloudcanvas/own-canvas` | `ownCanvas(b, draw)`: a blit you draw with Canvas2D | 1.3 KB |
| `cloudcanvas/xml` | `fromXml(parent, source)`: blits from XML, checked whole before anything is built | 1.7 KB |
| `cloudcanvas/html-canvas` | a blit's live HTML drawn by the GPU, where the browser has HTML-in-Canvas (behind a flag today) | 1.1 KB |
| `cloudcanvas/observe` | markup added later becomes blits | 7.9 KB |
| `cloudcanvas/types` | display widgets: `card`, `media`, `vector-pointer`, `raw` | 13.3 KB |
| `cloudcanvas/widget` | `widget({name, html, keys, bind, render})`: a type that renders its contents | 8.8 KB |
| `cloudcanvas/defaults` | every DOM add-on named at once, for markup-first pages (the GPU and content add-ons are imported on their own) | 36.2 KB |

`cloudcanvas/graphics` (the board's CSS, or every add-on's at once), `cloudcanvas/theme` (`applyTheme`, `LIGHT_THEME`, the
`--cc-*` tokens), `cloudcanvas/primitives` (SVG and URL/colour guards) and `cloudcanvas/log` (a pluggable,
non-blocking logger) round out the engine.

## More

This repository is the engine. The widget kit, the board (save, load, static export) and the site builder
are separate packages; the changelog below records the engine's releases. Projects on the 0.4 API can
stay on the `legacy/0.4` branch.

- [CHANGELOG.md](CHANGELOG.md)

## License

MIT. Written by Richard Christopher, NeoTec, LLC.
