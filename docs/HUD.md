# Browser HUD and local protocol (v1)

## Ownership and trust
Rust is the only audio, theory, timing and interpretation authority. The browser edits inputs and
renders acknowledged state. Keyboard Hz conversion and drawing a proposed cycle are input construction,
not an alternate synthesizer or harmonic analysis. No browser audio API, sequencer, remote assets,
filesystem paths, CloudCanvas wildcard, or permissive CORS remains.

Packaged assets use an exact allowlist (`include_str!`), including seven small ES modules. The URL
`http://127.0.0.1:PORT/#token=SESSION` stores the token in per-tab sessionStorage then immediately
removes the fragment. The token is not placed in request URLs or Referer. HTTP requires an exact
Host; supplied Origin must match the bound origin. WebSocket requires matching Origin before upgrade.
CSP limits scripts/styles/connections to self and rejects embedding. Tokens are compared without
content-dependent early exit, although differing token lengths are not hidden.

## Protocol
- `GET /`: packaged HUD. `GET /hud.css`, `GET /panels.css`, `GET /js/<allowlisted-module>.js`: packaged assets.
- `GET /api/state`: complete Snapshot; `Authorization: Bearer SESSION` required.
- `POST /api/panic`: independent emergency silence request; same Bearer authentication. Response
  `silence_requested` is not an applied-state acknowledgement; HUD uses the subsequent Snapshot.
- `POST /api/import`: raw WAV/FLAC bytes; Bearer and `X-Client-Id` for an active socket required.
  One concurrent import, 256 MiB hard streamed-body limit, 120-second upload deadline. Content magic
  is checked before runtime decode. Runtime enforces decoded ten-minute duration and rejects malformed
  media. A disconnect during upload cancels admission. Paths are never accepted.
- `GET /ws`: socket reserved from 31 simultaneous slots. First message, within three seconds:
  `{"type":"auth","token":"SESSION"}`. Authentication frame max512 bytes.
- Server hello: `{"type":"hello","version":1,"client":CLIENT}`. IDs are increasing generations
  times32 plus slot1..31, so runtime disconnect watermarks cannot silence a newer occupant.
- Server state: `{"type":"snapshot","state":SNAPSHOT}`. Initial full state then newest-only updates
  capped at approximately30Hz; intermediate snapshots are not queued. Two-second slow-send deadline.
- Client command: frozen Command JSON, e.g.
  `{"id":1,"at_sample":null,"action":"start","voice":1,"hz":440,"velocity":0.7,"instrument":0}`.
- Server applied response: `{"type":"ack","ack":ACK}`. Error: `{"type":"error","id":ID,"error":"..."}`.
  Malformed messages receive explicit errors. Frames/messages <=16KiB; per-client replaceable/start command rate240/s; release and panic commands bypass that quota.
  A two-second acknowledgement timeout says state may still apply: it is never reported as success.
- Socket drop closes its lease and releases only that identity's voices through runtime's independent
  disconnect signal. Reconnect receives a new identity and complete state; starts are never replayed.

## Controls and acknowledgement
Sound/view controls serialize edits within their group, merging each edit into the newest acknowledged
state. Outputs retain authoritative values while an edit is marked pending. Applied response alone is
insufficient: controls await the corresponding snapshot revision. Wavetable/partials are explicitly
marked drafts until applied; the waveform overlays the last acknowledged cycle behind the draft.
Keyboard activation highlighting is driven by engine voices, not local key-down optimism. Voice IDs
remain stable through octave/instrument changes, pointer cancel, lost capture, blur, visibility loss
and reconnect. Physical key codes preserve key-up when modifier state changes.

The focused panels cover playable notes/Hz, six instruments, wavetable/32 partials, ADSR/filter/gain,
FM/AM/morph, two destination-selectable LFOs, WAV/FLAC import/play/seek, layer/root/mode/cadence overlays,
Pythagorean overlays, camera, both presentation modes and reduced motion. Waveform history duration
(0.002–30 seconds) and look-back (0–30 seconds before present) share the acknowledged view-command
queue. Zero look-back follows the present; native rendering selects actual retained PCM, without
browser waveform reconstruction. Connection, device, analysis
age/lag, overload and panic remain at the top. Candidate scores are explicitly heuristic, not probability.

## Historical sandbox verification (superseded by current PLAN.md evidence)
Tests authored in `tests/browser-controls.mjs` and server unit modules cover syntax, no alternate audio,
stable voice releases, focus/disconnect handling, explicit pending failures, applied snapshots, auth,
Host/Origin, asset traversal rejection, content signature, bounded connection slots and command rate.
Consolidated QA performed:
- `node tests/browser-controls.mjs`: **9/9 passed**, including all seven module syntax checks.
- `cargo test --offline --config 'patch.crates-io.rtrb.path="/tmp/harmonic-queue-test-double"' --lib server::`:
  **10/10 passed** with the explicitly temporary queue TEST DOUBLE, not real rtrb. This includes actual
  Axum Router oneshot requests for authentication, foreign/missing WebSocket origins, exact Host,
  traversal, packaged/security headers, lease admission and actual streamed-byte import bounds.
- `rustfmt --check --edition 2021 src/server/*.rs`: passed. Owned files <=500 lines and functions <=50;
  browser Connection facade was decomposed to keep the class below50 lines.
- Security/efficiency corrections: single streamed import avoids doubling a 256MiB body; release/panic
  bypass command rate quota; generations prevent stale lease reuse; bounded pending browser commands;
  newest-only server snapshots and send deadlines; pointer and typing sources cannot release each other.

Live TCP/WebSocket operation is **not verified**: sandbox denies loopback bind (Operation not permitted).
Static Chromium screenshot attempt with a writable /tmp profile also failed at `setsockopt` with
Operation not permitted. No screenshot, visual approval or live reconnect approval is claimed.
Real-device audio latency and native/browser human comprehension review remain separate release gates.

## Native-spatial revision
Browser assets/controls are unchanged; all9 browser regressions and10 in-process server security
regressions pass with the actual rtrb dependency in the current integrated suite. Native keyboard
uses separate slot0 generations, so its focus loss cannot release browser voices. The Nova window
now has its own compact screen-space performance/interpretation HUD, not a copy of browser editors.
Live browser/socket checks remain blocked by the environment (see QA.md).


## Current native timeline controls
Import stays in the authenticated browser. Nova adds the whole-song overview with coverage,
Fit Song / Follow / zoom, drag-to-preview then atomic seek/resume, Space transport, and the
harmonic compass. Detailed synthesis controls stay in the browser; no new browser theory/audio
engine or duplicated full dashboard was introduced. Native preview state is local navigation;
transport and played-note markers always use acknowledged Rust state. Source file previews and
actual output retain separate identities and clocks. See NATIVE.md and PLAN.md for current live
TCP/WebSocket/native verification; the historical sandbox limitation above no longer applies.
