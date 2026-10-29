# Nova scene migration / ABI v2

## Ownership
`extern/Nova/Nova.{h,cpp}` now exposes nonblocking `poll()` and `draw()` APIs.
`extern/Nova/Scene/` owns SDL, Vulkan device/surface/swapchain, programmable shader pipeline,
frame synchronization, uploads, resizing, minimize behavior, and teardown. This is the linked
Nova implementation; the old blocking demo `Core/` remains unlinked reference code.

The old independent 2,436-line Vulkan bridge is archived as
`nova_bridge/legacy/*.reference`, not built. Its useful quad/line geometry, camera orbit,
Vulkan device/presentation idioms were migrated and decomposed rather than preserving the
unsafe unbounded upload and reused dynamic buffers. `nova_bridge/nova_visualizer.cpp` is
now only a checked C ABI and adapter to the actual Nova library. No duplicate Vulkan owner
is linked or instantiated.

The application's music scene and camera adapter live in `src/visualizer/`.
Nova accepts an application transform and geometry; it does not interpret music or PCM.
Two mapped vertex buffers are fence-protected independently. Render-finished semaphores
are per swapchain image. Acquire and frame-fence readiness are nonblocking; the caller
consumes latest state rather than queueing rendering work. Resize/teardown wait for the GPU.
Minimizing skips scene construction/rendering without changing the engine clock.

## ABI and limits
- `NOVA_ABI_VERSION = 2`; explicit struct size, vertex stride, count, and capacity.
- 262,144 triangle-list vertices; upload validates before copying, including finite data.
- Input pointers are borrowed for that call only. Handle is valid only until one destroy.
- Handle operations and destruction run on the creating main OS thread. Rust's wrapper
  is deliberately `!Send` and `!Sync`.
- Errors return negative status with bounded NUL-terminated UTF-8 diagnostic; all C++
  exceptions are contained. Create always clears the output before any work; `unique_ptr`
  cleanup tears down partially initialized state. Destroy-null is safe.
- Vertex `[position:4, color:4]`: 32 bytes; Upload 88 bytes on supported Linux x86_64;
  Events 1,584 bytes (128 bounded physical-key events plus focus/reset state). ABI tests check layout and hostile lengths/nonfinite values.
- Shader pipelines are configurable through Nova's SPIR-V spans. App shader sources are
  built by `glslc` and embedded in Cargo OUT_DIR, never loaded from workstation paths.

## Visual semantics
The scene connects matrix cells (octave rows -1..10), logarithmic full-band Hz spectrum,
stereo actual min/max PCM history, and signed recent left-channel samples. There is no
spectral-bin-to-PCM-index arithmetic or invented repeated waveform slice.
Measured energy fills cells; independently computed logical compatibility borders remain
visible for candidates. Cyan diamonds mark played voices. Projected ratio links are
translucent dashed paths and do not reach PCM. Logical/spectral roots and top competing
modes remain distinct; interval polygons come from authoritative model intervals.

Contribution events retain frequencies, source identity, sample interval and layer.
Measured events connect to the corresponding actual history time; file bands never receive
invented instrument names. Decorative progression uses audio sample time, not wall time.
Reduced motion removes moving particles but preserves links. Both modes use the same
compatibility palette, physical coordinates and facts; immersive changes lens, glow and particle budget.
Quality degradation drops decorative particles first. Inactive silence remains neutral.

## Verification and limitations
Tests are authored; execute only in the consolidated QA stage with root integration.
`NOVA_VALIDATION=1` enables Khronos validation when installed. No device/validation/soak
results are claimed until recorded in `docs/PLAN.md`. Neither implementation nor a static
screenshot constitutes user visual-comprehension approval.

- Migrated scene deliberately omits old fictitious spectral-wave terrain and old six
  unrelated scene themes. Side-by-side semantic comparison must reject those old effects.
- Current compositor uses ordered translucent geometry, not full depth/postprocess bloom.
  Immersive glow is restrained geometric layering, not a dedicated HDR bloom pass.
- Camera orbit/zoom and native key input use one ordered bounded native controller; rendering
  uses only the subsequently acknowledged snapshot camera, not speculative mouse state.
- Cadence UI shows current tension/direction/settling, a bounded 30-second trace of actual
  analysis-frame tensions, and timed completed arrivals. Selected phase-summation traces
  are not yet exposed.
- Public release still requires Linux hardware performance, resize/minimize/validation,
  partial-init fault injection, sanitizer runs, and explicit review of both modes.

## Original migration QA results (historical, 2026-10-29)
- `NOVA_TEST_FLAGS='-O2 -Werror' nova_bridge/tests/run.sh`: PASS, source shader/C++
  build and ABI/null/overflow/version/nonfinite/failed-create assertions.
- Isolated Cargo harness `/tmp/nova-visual-qa` points at the real `build.rs`, contracts,
  and visualizer sources (only serde/cc dependencies): 13 native Rust tests PASS;
  no-native geometry tests also pass. This avoids the separately blocked rtrb download,
  not a substitute for the final integrated application build.
- Isolated `cargo clippy --all-targets -- -D warnings`: PASS, native and no-native.
- `ASAN_OPTIONS=detect_leaks=0 NOVA_TEST_FLAGS='-O1 -g -fsanitize=address,undefined
  -fno-omit-frame-pointer' nova_bridge/tests/run.sh`: PASS boundary tests. LeakSanitizer
  cannot run under this environment's ptrace; leak verification remains unclaimed.
- `NOVA_VALIDATION=1 .../native-tests --window`: BLOCKED, SDL reports no available
  video device; explicit x11 also unavailable. `vulkaninfo --summary` reports no valid
  GPUs. Environment DISPLAY variables do not establish usable graphics access.
- Both presentation modes received internal software geometry preview inspection
  (`/tmp/nova-geometry/*.svg/png`, deterministic fixture, explicitly not GPU capture).
  This found/fixed immersive activation depth misalignment and an opaque inner-glow
  darkening issue. It is not user approval or native/Vulkan visual certification.
- All new Rust files are under500 lines and functions under50 after rustfmt; native
  functions/classes are similarly decomposed. Archived reference code is not compiled.

### Historical selection QA correction
Native history now uses the selected PCM interval's first sample and exclusive last end,
not the current analysis frame end. Axes show exact sample coordinates and selected duration;
a scrubbed right edge is never labeled NOW. At sample-level zoom both signed stereo channels
connect actual adjacent samples, without bridging gaps or rectifying negative values.
Contribution endpoints use the real overlapping interval within the selected window; events
outside the window are omitted rather than clamped onto edges. Projected paths still never
reach PCM. Bus-processing contributions only produce the explicit processing label, never
an invented zero-Hz spectral path.

Isolated native tests: 20 PASS (7 added selection/signed-PCM/gap/contribution/processing
regressions); native and no-native Clippy `-D warnings` PASS. Source limits rechecked after
rustfmt. Full device/visual/performance gates remain as recorded above.

## Native spatial revision
`src/native_input/` owns physical key/held-voice identity, local octave/instrument preferences and
bounded pending acknowledgements. Nova only transports SDL input; all synthesis still runs in Rust.
Native generations use slot zero, independently cancellable from browser leases and file playback.
Focus loss, minimize, event overflow, queue failure and controller teardown cannot leave native notes held.

The former flat dashboard is replaced by an upright source wall, curved spatial contribution streams,
a forward spectrum cross-section and an actual PCM floor. Frequency endpoints coincide with the
rendered logarithmic spectral profile; each historical particle retains its emission-time endpoint.
The curve between data endpoints is explicitly illustrative, not invented measured wave/phase data.
Continuous spectrum retains out-of-matrix frequencies; those frequencies do not get fake matrix origins.
Temporal links exist only for PCM intervals overlapping the selected history. Projected links never
become measured heights or temporal links. Bus protection remains an explicit HUD status.

Top/bottom HUD panels bypass the camera (negative-W shader marker), remain screen-anchored, and
receive reserved upload capacity. Only data-axis labels/root geometry remain in the world. Full synth
controls and file editing stay in the browser. Both modes use the same coordinates and evidence.
Reduced motion retains static routes. Particle histories cap at16,384, per-mode drawing at4,096/16,384;
quality reduction removes particles first. World triangles use far-to-near translucent compositing;
this remains not a full depth-buffer/HDR pipeline.

Current source-build, real-dependency Rust, native input/ABI/sanitizer, CPU diagnostic and software
preview results are recorded in `docs/QA.md` and `docs/qa-evidence/native-spatial/`. Live GPU/input,
audio hardware and human visual approval still require the enabled workstation.

## PCM / spectrum streaming-history revision
The static PCM floor/recent-only trace is replaced by stereo waterfall rows. Following visual
feedback, PCM is now a compact strip beside the right edge of spectrum history, at the spectrum's
baseline rather than raised beside the pitchclass wall. This clears the wall-to-spectrum particle
space. Its stereo footprint is 2.15 world units wide (previously4.60), with signed amplitude scale
0.30 (previously0.70), thinner strokes and lower opacity. No samples or history duration are removed.
Both waterfalls start at the current spectrum plane and increase in +Z with a shared timestamp axis.
Compact PCM labels sit at the newest end to avoid the screen HUD. The camera is unchanged in both modes.

History comes from the engine, not a renderer-local frame cache. A minimized/slow/new renderer sees
the same retained history. Actual measured profiles and original compatibility are preserved; at most
48 real timestamps are sampled for drawing, not interpolated or repeated into fake prior frames.
PCM rows cover all selected PCM; zoomed-out signed min/max envelopes are labeled, and short selections
show signed raw samples. Use the existing browser **PCM + spectrum history** duration/look-back
controls; durations below about64ms expose raw samples at48kHz. At broader views an unchanging tone's
amplitude envelope is correctly flat, not an invented oscillating waveform.

History scrubbing hides live contribution particles and the live spectrum cross-section so they
cannot be mistaken for the selected past; the pitchclass wall and essential HUD remain current.
Returning look-back to0 restores live contributions. No projected paths become spectral history or
PCM, and temporal links target only actual overlapping PCM chunks. There are no inter-row connections
inventing evidence through analysis gaps. Reset/seek/device epochs clear history in the engine.

## Enlarged table and amplitude-linked emitters
The table's local-to-world transform doubles its width and height around its original center,
without scaling the spectrum/PCM history or changing the camera. Cells, pitch/octave labels,
activation positions and stream origins use that shared transform. Compact root/mode annotations
and the table/PCM headings are reflowed to avoid the HUD and adjoining axes after enlargement.

Emission centers use `69 + 12*log2(hz/440)` with continuous cents displacement within each cell,
wrapping at the B/C cell boundary. Frequencies outside the matrix are still rejected, not clamped.
For measured bands, power remains the measured FFT-band power; logical sources use their existing
squared envelope amplitude and projected links retain explicitly illustrative salience.
A fixed display response `level = sqrt(clamp(sqrt(power), 0, 1))` controls emitter opacity, radius,
particle size/density and measured cell brightness. This is not a calibrated meter or per-frame
peak normalization. Silent/non-finite power emits nothing. Compatibility hue remains unchanged.
Only measured bands draw filled emission footprints; projected links remain dashed/translucent.
Deterministic sample/identity-seeded particles leave a bounded disc around the exact frequency
center and converge at their unchanged exact spectral destination. This spread illustrates
strength, not additional measured frequencies, uncertainty, or acoustic propagation. Event/vertex
caps and newest-snapshot behavior are unchanged; all new work stays off the audio callback.
