# Harmonic instrument delivery ledger

Scope: user's five-phase Linux release plan; Rust authoritative, Nova native, browser HUD only.
No publishing. Root Git metadata is unusable (`git status` fails); no branches/commits invented.

| Phase | Expected deliverables / gate | Actual / status |
|---|---|---|
| 1 Contracts & baseline | Freeze contracts, ownership, baseline defects and fixtures | Complete: contracts/inventory/fixtures authored; baseline native link and browser syntax defects captured. Shared additions (mode intervals, acknowledged table data, processing flag) coordinated. |
| 2 Foundation | Source native build, callback audio, authenticated local controls, main-thread Nova | Implemented; source/native ABI and in-process gates pass. Real-rtrb clean locked release build now passes; live device/socket/window gates remain blocked. |
| 3 Instrument & interpretation | Bounded synthesis/files, independent fields/history/roots/cadence; deterministic tests | Implemented; numeric/timeline/allocation regressions pass with the actual rtrb transport. Complete alias/file corpus coverage remains open. |
| 4 Experience | Focused HUD, connected scene, two modes, attributed particles; functional + visual QA | Implemented core experience;9 browser tests pass; geometry previews reviewed. Live visual/comprehension gate and selected phase-trace UI and live review remain open. |
| 5 Release verification | Clean release build, packaged launch, hardware/visual/performance evidence | NOT ACCEPTED. Hardware, live launch, full soak and human visual gates blocked/incomplete. See QA.md. |

## Frozen ownership and integration
- Root: `src/contracts.rs`, `src/audio/**`, `src/runtime.rs`, `src/main.rs`, `src/lib.rs`, root Cargo manifest, release/integration tests and ledger.
- Analysis component: `src/analysis/**`, AudioTheorem feature gates and adapter/tests. Existing engine/theory/dsp retained as legacy regression fixtures only.
- Nova component: `extern/Nova/**`, `nova_bridge/**`, `src/visualizer/**`, `build.rs`, native tests/documentation.
- HUD/control component: `src/server/**`, `web/**`, protocol and browser tests/documentation.
- Shared contracts are frozen in `src/contracts.rs` and `docs/CONTRACTS.md`; changes require root coordination.
- Components implement tests; consolidated QA after component development, corrections verified.

## Baseline defects
- `cargo test --offline`: fails linking `-lnova_bridge`; build script trusts cached archive and stale absolute path in target.
- `node --check web/daw-harness.js`: syntax error, unescaped backtick inside template literal.
- Sleep-driven producer/per-sample mutex; FFT/theory on rendering path; browser duplicate synth.
- Unauthenticated socket, permissive CORS, arbitrary filesystem CloudCanvas route.
- Note-off recomputes scale and voice identity collides between sources; disconnect panics everyone.
- Nova bridge independently owns Vulkan; upstream Nova is unused; native loop runs away from main thread.
- Old fixed 144-bin spectrum and projected-energy contamination need replacement, not relabeling.

## QA / success metrics
Correctness, security, efficiency, code quality reviewed together. New owned files <=500 lines,
functions <=50 lines, nesting <=3. Record actual test counts and failures, not assumed passes.
Release targets: callback p99 < half deadline, zero callback allocation/underruns in 30-minute
hardware soak; native p95 <=16.7ms / p99 <=25ms, fast visualization p95 <=80ms; bounded memory.
Human review must distinguish logical/measured/projected facts and cadence without inspectors.

## Phase outcomes and action items
- Phase1: architecture and source ownership frozen; baseline defects reproducible; contracts in
  CONTRACTS.md and fixtures in component/test modules. No Git metadata available to commit.
- Phase2: removed duplicate live renderer/audio ownership, native archive reliance, filesystem asset
  route, unauthenticated control and browser synthesis. Native source build+ABI verified, production
  initially lacked rtrb; the requested native-spatial iteration resolves the real-dependency clean build.
  Action: hardware-backed coordinated launch.
- Phase3: callback DSP and off-thread analysis/decoding delivered.99 integrated Rust tests pass with
  explicit temporary test-double transport at initial delivery; current real-transport suite108 passes.
  Action: remaining alias/file corpus and hardware soak. Numeric confidence remains separate from compatibility.
- Phase4: modular HUD, stable source identity, acknowledged camera/controls and connected scene.
 9 browser tests and software geometry checks pass. Action: live UI and explicit visual review;
  selected source summation remains outstanding, not silently removed.
- Phase5: release not certified; no push/publication performed. Evidence and exact blocked gates in
  QA.md; component details in AUDIO.md, ANALYSIS.md, NATIVE.md and HUD.md.

## Expected versus actual deviations
- Delivery used concurrent component implementation across foundation/instrument/experience followed
  by one consolidated correction/verification stage. Separate product exit gates remain explicit.
- RustFFT pinned to cached6.4.1 (same planned scratch API), CPAL0.15.3; rtrb0.3.2 retained as required.
- Cached ArrayQueue was used only in a temporary testing patch while waiting for requested substitution
  approval. No approval received; no production substitution, repository Cargo patch or claimed real
  transport pass. Production lock entry restored to the published registry checksum after test runs.
- Root control/analysis and native geometry are implemented, not hardware-validated. Device restart
  currently requires relaunch. GPU effects use layered geometry rather than HDR postprocess bloom.
- All implementation/review and verification remained local. No remote publication or invented VCS state.

## Requested iteration — native playing, screen HUD, spatial spectrum streams
- Intent: native keyboard performance; essential overlay data fixed to the Nova screen, not a
  duplicate browser control panel; upright pitchclass/octave source wall streaming particles
  through genuine 3D depth into the measured continuous-frequency spectrum (user sketch).
- Design/ownership (single implementer): generic bounded SDL key events in Nova + versioned ABI;
  native client/held-key controller through the existing authoritative runtime; music geometry,
  audio-timed streams and screen HUD in the Rust visualizer. Browser controls remain unchanged.
- Development: physical scancode identities, focus/overflow release isolation and ordered commands;
  separate world/HUD coordinate spaces; frequency- and measured-power-aligned curved trajectories;
  preserved actual PCM history and distinct logical/measured/projected encodings.
- Consolidated QA after implementation: keyboard/lifecycle/queue isolation, ABI, spatial endpoints,
  screen anchoring, history fidelity, capacity and syntax/build tests; software previews both modes;
  security, efficiency and owned-code limits. Live hardware results only if actually available.
- Status: implementation and consolidated software QA complete; live hardware/visual gates pending. Root Git remains unusable; pre-change copies
  retained locally at /tmp/nova-spatial-before, no fabricated commits or publication.

### Native-spatial iteration outcome (2026-10-29)
- Delivered native physical-key playing, octave/instrument shortcuts, ordered acknowledgements,
  per-native-generation focus/overflow/teardown release, and global Escape panic. Browser controls
  and their independent held voices remain intact. Native ABI v2 carries bounded input events.
- Delivered screen-space status/legend/cadence HUD, with camera-independent overlay and reserved
  upload space; no duplicate sound-design panel. World now has an upright source wall, real-depth
  streams ending on the continuous measured spectral profile, and a separate actual-PCM floor.
- Correctness/security QA:108 native-default Rust tests and105 no-native tests pass against actual
  pinned rtrb,9 browser regressions pass, source C++/shader and ABI/input tests pass, ASan/UBSan pass
  (LSan still unavailable). Native cancellation is independent of browser/file playback; no new
  network route, auth exception, upload path or browser synthesis was introduced.
- Efficiency/quality QA:bounded128 key events,64 pending native commands,16,384 stream events;
  no new audio-callback allocation. Production Clippy and owned line gates pass (including native
  input). CPU-only scene fixture p95/p99:precise1.246/1.407ms, immersive1.716/1.799ms, not GPU timing.
- Expected versus actual:both visual modes internally inspected as software geometry captures;
  interpolation was corrected so stream endpoints lie on the rendered log-frequency profile;
  HUD stays fixed under orbit; waveform remains signed/selected actual PCM. Final preview
  review also separated colliding spectrum/history titles and restored bracket-key glyphs. Full GPU polish and
  human visual approval remain pending. No claim that illustrative curves are acoustic propagation.
- Build blocker resolved:real rtrb is now cached; clean locked release build in previously empty
  /tmp/nova-spatial-clean passes without a patch/archive substitute. Cargo.lock is unchanged.
  Updated launch artifact:target/release/nova-daw. No Git commits or publication.
- Remaining actions:run the updated app on the enabled desktop, review actual keyboard/focus and
  both visual modes, then complete the previously recorded audio/GPU/performance release gates.
  Sandbox still denies localhost bind and SDL reports no available video device; no audio device.

## Requested iteration — full PCM and spectrum history streams
- Intent: actual PCM visible beside the pitchclass grid as a depth-running waveform history;
  measured spectrum retains past profiles as a scrolling waterfall, not just the live slice.
- Frozen design (single implementer): expose bounded, native-only immutable history views from the
  engine's existing 30-second PCM/analysis rings; no renderer-invented past, no browser payload
  multiplication, no audio-thread work. Exact timestamps, stereo extrema/raw samples, measured
  spectral profiles and original compatibility accompany each retained historical slice.
- Native scene: parallel +Z age axes matching particle flow; raised stereo PCM waterfall beside
  the source wall, spectral waterfall extending from the current spectrum. Existing history
  duration/offset controls select both; overview envelopes and signed sample zoom are distinguished.
- QA after development: exact PCM coverage/extrema, differing historical spectra, silence/gaps/
  reset/seek, selection, immutable/bounded snapshots, depth/direction and geometry limits, both
  software previews; security/efficiency/code-quality review and release build. Hardware gates
  remain separate. Root Git remains unusable; pre-change copies in /tmp/nova-history-before.
- Status: implementation and consolidated software QA complete; hardware visual approval remains open.

## Requested publication — neotecdigital/AudioTheorem
- User requests synchronizing AudioTheorem so this application becomes its new head.
- History-stream iteration was interrupted mid-development; it is not a verified publication
  candidate yet. Asked whether to finish/verify it or publish the last verified native-spatial build.
- Asked for explicit publication workflow: PR with source-branch push permission, or direct
  non-force update of the target's existing default branch. No branch layout is assumed.
- Initial inspection: root still lacks usable Git metadata. GitHub API requests for repository
  metadata and branches fail to connect; web access also failed. Target permissions, branches,
  protection rules and current remote contents are not yet verified. Nothing committed or pushed.
- Next: once access and choices are available, fetch the actual target checkout, read its instructions,
  preserve remote history, integrate the approved source tree, verify, and publish through the approved
  workflow. No force push, invented root repository, or silent publication of unfinished work.

### History-stream outcome and publication status
- Delivered authoritative native-only immutable history views, full-coverage signed stereo PCM
  envelopes/raw zoom, historical spectral waterfall rows, +Z age axes, shared selection controls,
  matching temporal contribution anchors and gap/reset/seek isolation. No browser/audio ownership change.
- Correctness/security:115 native-default Rust tests and112 no-native tests pass;9 browser regressions
  and native C++/shader/ABI/input checks pass. Native history is omitted from JSON and all drawing data
  is bounded. No network endpoints, authentication exceptions or file import paths were added.
- Efficiency/code quality:production Clippy and owned limits pass.32-second virtual analysis/history
  diagnostic p95/p99=1.932/2.214ms. CPU scene fixture p95/p99 precise5.380/5.852ms, immersive5.896/6.544ms.
  These are CPU diagnostics, not GPU frame timing, physical audio or hardware-soak certification.
- Expected versus actual:full retained PCM coverage is rendered as extrema envelopes at wide zoom,
  not fabricated oscillations; raw samples are preserved at close zoom. Historical spectral drawing
  uses at most48 recorded timestamps/160 peak-preserving bands per row. Software previews reviewed
  in both modes; no repeated-current-frame history. Live workstation visual approval remains required.
- User confirmed:finish the work, then sync/push to neotecdigital/AudioTheorem. This is publication
  authorization, not authorization to force-push or discard the destination's existing history.
- Publication remains technically blocked:git and gh are installed, but CODEX_SANDBOX_NETWORK_DISABLED=1;
  git reports DNS failure, gh cannot connect, and the permitted escalation request was denied by policy.
  No target branch/permissions/contents could be fetched; no remote commit or push is claimed. An optional
  GitHub integration was offered but has not been confirmed connected. No further bypass attempted.
- Prepared a source-only transfer snapshot/bundle excluding nested Git metadata, targets, machine-private
  state and build artifacts. Build that snapshot to verify vendored modified Nova/theory sources are
  sufficient. Once authorized network access is available, fetch the actual target, inspect its branch
  layout/instructions, integrate without replacing remote history, and push via the approved workflow.
- Source-transfer verification completed:clean release build of `/tmp/AudioTheorem-current-source`
  into fresh `/tmp/audiotheorem-source-build` passes with real dependencies and vendored modified
  sources. Unused compiled upstream example/Windows build-helper executables were excluded from
  the source transfer; the workspace source was preserved. Bundle: `/tmp/AudioTheorem-current-source.tar.gz`.

## Requested iteration — compact PCM beside spectrum history
- Intent: move actual PCM out of the pitchclass-to-spectrum space and place it beside spectrum
  history, smaller and less visually intrusive. Preserve full recorded history and stereo evidence.
- Frozen scope (single implementer): waterfall layout, its labels/temporal anchors and regression
  tests only; align PCM/spectral +Z time origins, reduce PCM width/height/opacity, share age markers.
  No audio/analysis, browser, native ABI or publication changes.
- QA: layout separation/compact bounds, signed extrema and temporal-link regressions; full Rust
  suite, production Clippy, line limits, both software previews, and release build. Hardware visual
  acceptance remains separate. Pre-change copies: `/tmp/nova-compact-pcm-before`.
- Status: implementation and consolidated software QA complete. Existing transfer bundle predates
  this requested revision.
- Delivered: floor-level stereo strip immediately right of spectrum history; shared origin/depth
  clock and one age axis; width reduced53%, amplitude scale57%, reduced opacity/stroke sizes.
  Actual history coverage, signed stereo data, temporal contribution identity and camera are unchanged.
- Expected versus actual: requested middle region is now clear. Both software modes reviewed; QA
  detected age-label/HUD overlap and corrected spacing/size, with a new default1080p regression.
  The original raised-wall placement is superseded by this requested adjacent compact layout.
- Correctness/security/efficiency/quality:117 default Rust tests and9 browser tests pass; no new
  surfaces, audio work or growing state; bounded drawing and owned line gates pass. Source comparison
  confirms changes stay within the four scoped waterfall module/test files plus docs/evidence.
- Final verification:114 no-native Rust tests, production Clippy with warnings denied and locked
  offline release build also pass. Updated launch artifact: `target/release/nova-daw`.
  Desktop/human visual approval remains open. Remote publication stays blocked as recorded above;
  the earlier transfer bundle does not include this revision. Root Git metadata remains unusable;
  no commits or pushes claimed, and the scoped source delta is saved with QA evidence.

## Publication retry — latest compact-PCM source
- User explicitly requests the current code be pushed to `NeoTecDigital/audiotheorem`.
- Rechecked the destination with `gh repo view`, `gh api .../branches`, and `git ls-remote`:
  GitHub API remains unreachable and git cannot resolve `github.com`. No remote refs or contents
  were obtained. Root Git metadata is still unusable. No commit, push or remote-head change occurred.
- Refreshing the existing source-only transfer with the compact-PCM revision and verification
  evidence; this supersedes the previous bundle, not any remote repository. Expected remote sync
  remains unfulfilled until authorized network access is available. No access-control bypass attempted.
- Next action with access: inspect target instructions/actual branch layout, preserve remote history,
  apply the authorized workflow, push and verify the destination head SHA against the intended commit.
- Preparation verified: updated source transfer matches workspace source and contains no excluded
  metadata/build/private directories; its locked offline release build passes. Refreshed bundle:
  `/tmp/AudioTheorem-current-source.tar.gz`. This is still not a push or a verified remote synchronization.

## Requested iteration — double pitchclass table scale and publish
- Clarified intent: double the table's current width and height, not make its width twice the
  spectrum's. Scale cells, borders, labels, activation/root/mode marks and contribution origins
  together around the table center; leave spectrum/PCM history and camera unchanged.
- Frozen scope: shared matrix-local/world transform, field/axis/mode geometry and tests. No audio,
  interpretation, history, input, browser or native ABI changes. Single implementer; consolidated QA
  follows implementation, including both software previews and source build.
- GitHub access now succeeds: `NeoTecDigital/AudioTheorem`, admin access, default `main` at96b2237;
  `master` at9fd7020, with unrelated history. Cloned into `/tmp/AudioTheorem-sync` on local `main`.
  Asked for the explicit source-branch/PR exception or direct non-force main publication choice.
  Preserve both histories; do not force push. Prior network-blocked entries are historical.
- Status: implementation in progress; no remote changes yet.
- Additional user-authorized visual requirement: source emission radius/intensity follows actual
  per-band amplitude; continuous cents positions within pitch cells instead of rounding source
  origins. Freeze a bounded, absolute-power display response, deterministic emission-disc spread,
  exact spectral destinations and separate logical/projected meanings. No per-frame peak normalization.
- Publication explicitly authorized: push verified `main`, preserve current upstream `master` as
  `legacy-master`, then fast-forward `master` to `main`'s identical head. Local integration merge
  1b2d76b preserves both unrelated histories; its sole README conflict kept the master's content
  before replacing the application in a separate commit. Both remote branches are unprotected.
- Development/QA delivered: 2× grid width/height, continuous cents origins and amplitude-driven
  emission discs/brightness/size/density sharing the cell's absolute-power display response.
 125 default-native tests,122 no-native tests,9 browser regressions, production Clippy, line gates
  and locked release build pass. Histories, audio semantics and compatibility hues are unchanged.
- Expected versus actual: source geometry scales as requested. To keep both modes readable, title
  and root/mode annotations were compactly reflowed; PCM heading moved beside its strip to avoid
  enlarged note labels. Software preview review plus HUD-bound regressions pass after these fixes.
- Security/efficiency: bounded deterministic emitter jitter illustrates amplitude, not frequency
  uncertainty; silent/non-finite energy emits nothing. No input or audio-callback surface changed.
  Existing event/vertex budgets remain; new tests verify measured endpoints and energy unchanged.
- Source-sync verification: the real main-branch checkout builds locked/offline from packaged sources
  without nested dependency metadata or a pre-existing native archive. Credential/artifact scan clean.
- Live desktop QA now possible: authenticated control, real48kHz f32 stereo default device, Vulkan
  rendering in both modes, resize and panic/finite shutdown exercised. Nonblank native captures
  reviewed; interactive camera changes mean these are not fixed-framing fixtures.
- Failed release gate recorded:177 ALSA underrun warnings in the25-second rerun; CPAL's errors counter
  remained0, latest callback size131 despite requested256, observed callback max1714µs. Action item:
  diagnose backend/device scheduling and xrun observability; no full audio/visual release certification.
  User-authorized source publication proceeds as an implementation candidate, not a certified release.
- Publication preparation complete: retain old remote master9fd702026a0aefec6216cf7a0bf42906268f2332
  as legacy-master, push integration main non-forced, then fast-forward master. Restore the verified
  fetched Git metadata to the originally metadata-less workspace after integration is committed.

### Publication outcome — verified upstream
- Implemented source commit `3dece154e5e15f055ca579c66a7d429116b5149a` was pushed to
  `NeoTecDigital/AudioTheorem/main`; `master` was fast-forwarded to that same commit.
- Old master is preserved exactly as upstream `legacy-master` at
  `9fd702026a0aefec6216cf7a0bf42906268f2332`. Creation and master advancement used one atomic push;
  neither existing branch was force-pushed. Both original histories remain ancestors of the new head.
- Verified the three upstream ref SHAs with Git, and main independently with the GitHub API.
  Subsequent documentation-only receipt updates advance main/master together, leaving legacy fixed.
- Workspace Git metadata is restored from the verified checkout; local branch remains `main`
  tracking `origin/main`. Desktop libsecret credential storage stalled before publication;
  a per-command authenticated gh credential helper completed the push without changing global config.
- Requested visual features and source synchronization are complete. Audio release certification
  remains blocked by the recorded ALSA underruns and outstanding soak/performance gates; do not
  confuse publication of the implementation candidate with certification of the entire release.

## Review/design request — full-song flow, harmonic compass, dense spectrum
- Scope: user requests integration review and UI design, not implementation yet. Reviewed current
  asset/import, sample-clock playback/seek, history selection, scene geometry, native input ABI,
  HUD and harmonic fields at main94462a5. No application code or remote refs changed in this review.
- Current evidence: decoded stereo assets are already available off-thread (256MiB upload/10minute
  limits); live PCM/analysis retain30seconds, clear on seek/epoch discontinuity, and expose at most
 48 spectral rows ×160 drawing bands /3072 PCM summary points. Native events expose orbit/wheel,
  not pointer coordinates/buttons for hit testing. HUD already receives independent fields and84
  root/mode candidates. Spectrum strokes are world-space quads; Nova uses single-sample rasterization.
- Proposed experience: fixed bright playback line, quieter incoming source-song spectrum and
  outgoing elapsed history; linked compact stereo waveform; whole-song overview always available,
  local zoom and Fit Song, Follow toggle. The enlarged matrix remains a current-time cross-section,
  not a false performed-note transcription of a recording. Particle route duration must not imply
  a delayed audio/playhead; source-preview contributions and actual output remain distinguishable.
- Required architecture: cancellable, CPU/memory-budgeted off-thread asset index and multiresolution
  tiles, keyed by asset identity/rate/model version. Prioritize overview then visible range; reuse
  decoded Arc-owned PCM, not a second full copy. Keep actual-output rings separate from precomputed
  source material, which cannot include future live synth mixing, gain changes or clipping. Reuse
  analysis/theory math without running a full song through the real-time coordinator's history path.
- Timeline contract proposal: exact asset-frame cursor/rate plus engine-sample/epoch mapping,
  source/output provenance, cache coverage/status and seek generation. Seeking invalidates live
  continuity but not the immutable song cache. Source harmonic history is separate from live
  cadence state; scrubbing cannot inject future evidence into actual root/cadence estimates.
  The source ribbon follows asset time; actual-output lanes retain engine time, especially during
  pause/live playing. Map the two only across known contiguous playback segments.
- Recommended interaction (pending approval): left-drag time ruler/overview pauses only file
  playback and previews the cached cursor; release applies one latest-generation seek and restores
  prior play/pause state after acknowledgement. Escape retains panic and cancels scrub without
  resuming; Space toggles transport. Mark
  draft/acknowledged cursors separately. No camera orbit while a HUD/timeline drag owns the pointer.
  Audible continuous scratch-scrubbing is not implied; preserve native instrument releases/panic.
  Extend versioned native pointer ABI and add screen/world picking; add bounded seek smoothing.
- Harmonic compass proposal: stable fifths-ordered12-pitch ring, separate logical/actual spectral
  activity tracks, weighted competing root/mode arcs and explicit confidence/uncertainty. Center
  states Live or Inspecting [song time]; imported recordings never gain explicit played-note marks.
  Selected-scale lower/upper tetrachord membership is an optional overlapping lens, not four
  adjacent fifth sectors. Example C-D-E-F / G-A-B-C and the shared G-A-B-C lens in G major. Derive
  memberships/intervals from the verified AudioTheorem adapter; no separate browser theory engine.
  Keep circles compact in reserved HUD space, not a second full control panel over the main scene.
- Density proposal: target up to192 real time slices (4×), with320 visible frequency bands near
  the play line and adaptive lower detail farther away; zoom may request finer source summaries.
  These are drawing-detail targets, not new FFT precision guarantees. Preserve transients and
  age/resolution metadata; no repeated current slice or invented data across gaps/unindexed ranges.
- Budget finding: current quad strokes cost6 vertices/segment.192×320 needs367,488 spectrum
  vertices alone, exceeding the262,144 total cap; even192×160 costs183,168 before PCM/HUD/particles.
  Do not simply multiply constants: separate spectrum/PCM budgets, use indexed/instanced/tiled
  drawing, explicit degradation and visible-range uploads rather than silent mesh truncation.
- Rendering proposal: screen-stable anti-aliased strokes with proper joins/coverage, optional
  device-supported MSAA, restrained surface fill and a brighter current ridge. More rows alone
  cannot cure subpixel gaps. Generic stroke/tile upload support belongs in Nova, not another renderer.
- Integration boundaries: asset/index modules under src/analysis + src/runtime, timeline contracts
  under src/contracts; src/visualizer/scene/waterfall and new transport interaction/HUD compass
  modules; Nova Scene pointer/pipeline/buffers and the versioned adapter; browser stays import and
  detailed controls with acknowledged transport/status, not duplicated analysis or rendering.
- Suggested delivery: freeze time/provenance/input/GPU contracts; implement indexed source timeline
  and atomic scrub/seek; implement dense rendering and compass in isolated modules; consolidate
  correctness/security/efficiency/quality QA after each development phase and live comprehension QA.
- Acceptance proposal: whole file accessible before playback; pause freezes source position; seek
  does not destroy source history; preview/output distinction is visible; ambiguity remains visible;
  all12 transpositions/tetrachords match adapter memberships; 4× detail respects explicit budgets;
  pointer capture/focus/cancel cannot leave stuck input; no cross-epoch trails. Include file replace,
  near-end scrub, variable device buffers, slow indexing and noise/silence fixtures. Existing ALSA
  xrun failure makes bounded lower-priority indexing and audio stress tests especially important.
- Expected versus actual: review/design and capacity arithmetic completed, not feature delivery or
  performance certification. Proposal awaits implementation approval; no code tests rerun for a
  documentation-only review. No commits/pushes made for this review.
- Primary references checked: Texas A&M-hosted Steps to Music Theory, Major Scales and Keys
  (https://odp.library.tamu.edu/stepstomusictheory/chapter/major-scales-keys/); Khronos Vulkan
  multisampling tutorial (https://docs.vulkan.org/tutorial/latest/10_Multisampling.html).

### Approved implementation — song landscape / compass / dense strokes
- User approved implementation. Work remains on local main; no new publication requested.
- Contracts frozen: source cache uses asset-frame time, immutable Arc tiles, bounded 50ms
  summaries and exact stereo extrema; engine history remains independent. Native ABI v3 adds
  ordered bounded pointer events and instanced analytic-AA strokes, with explicit capacities.
- Ownership/separation (single implementer): analysis/source + runtime/source own indexing;
  contracts/transport + native_input own seek transactions; Nova owns generic input/stroke GPU
  facilities; scene/song + scene/compass own music presentation. Browser remains authoritative
  import/detail control, not another analysis engine.
- Development deliverables: progressive source overview/index, safe seek/pause/resume,
  Follow/Fit/zoom timeline, dense source/output landscape, two-track harmonic compass and
  selected tetrachord lens. Then one consolidated QA stage including correctness, security,
  efficiency, code limits and native visual workflow verification. Failed gates get corrections.
- Development implemented: separate source-index worker with latest-only immutable tile snapshots,
  shared decoded PCM, exact stereo overview and 50ms multi-window spectrum summaries; per-row
  throttling and import/shutdown cancellation. Source cache stays intact on audio seeks.
- Native transport drafts pause only files; release sends one asset/generation-scoped atomic
  seek/resume. Focus loss, panic and replacement cancel drafts; five-millisecond file transitions
  avoid hard steps. ABI v3 carries ordered pointer events and bounded instance strokes.
- Dense rendering uses 192-row/320-band summaries and generic GPU analytic-AA capsule instances
  rather than expanding history into triangle quads. Source preview is labeled pre-gain, actual
  output remains independent; overview provides Fit, Follow, zoom and pointer scrubbing.
- Compass shows explicit held markers, measured evidence, competing group weights/confidence,
  and an optional selected mode/tetrachord membership lens; source inspection is labeled separately.
- Consolidated QA now begins. Expected: deterministic/index/transport/input/ABI tests, no callback
  allocations, clean production lint and line gates, source build, native rendering/input captures.
  Performance and visual acceptance are not claimed until measured; existing audio soak limitation
  remains open. Implementation choice: visible instances are uploaded per frame, not a persistent
  GPU tile cache; measure before adding cache complexity.
- QA corrections: initial smoke harness assumed a1920×1080 drawable but the tiling compositor
  supplied842×1393, so its coordinates missed the timeline. Harness now floats only its own exact
  X11 window and reads geometry. Narrow-window HUD is aspect-preserving and camera framing adapts.
  A separate virtual X-server attempt was unavailable (Xvfb not installed); final evidence uses the
  real Xwayland/Vulkan window, not a simulated renderer. All injected buttons/keys are released.
- Visual corrections from actual captures: compass notes/candidate arcs no longer overlap captions;
  tetrachord-lens squares/ticks are explicitly not cyan played diamonds; bitmap text pixels join
  cleanly instead of looking dotted; silent PCM lanes dim without changing signed amplitudes.
- Security/code review: new native upload counts/strides/finiteness/HUD split validate before copy;
  ordered128-pointer overflow resets capture and held input. Asset/generation/bounds/panic checks
  run again at the audio owner; importing/replacing a file cannot reuse stale seeks. Source data
  stays out of browser JSON and out of logical/cadence evidence. Scene overflow is explicitly shown
  and reduces decorative load rather than silently hiding a budget failure.

### Song landscape phase — verified outcome / remaining gates
- Delivered all requested interaction components locally: whole-song waveform/index with coverage,
  Fit/Follow/zoom, native scrub pause/atomic seek/resume, a dense source landscape, distinct actual
  output/PCM history, harmonic activity compass and selected mode/tetrachord lens. Default history
  drawing budget is192 real rows (4× prior48) and up to320 frequency bands (2× prior160).
- Consolidated software QA passed:139 native Rust tests (123 library +16 integration),136 no-native
  Rust tests,9 browser tests, production Clippy -D warnings and owned Rust500/50 line gates. Explicit
  callback instrumentation found zero allocations/deallocations for16 voices and for asset transport
  plus fades. Latest targeted library and lint verification passed after final HUD helper extraction.
- Native checks: C ABI v3 layouts, hostile bounds/nonfinite strokes, pointer order/overflow, partial
  create failure, draw/minimize/restore/resize cycles passed under ASan+UBSan and Vulkan validation.
  Leak detection disabled for the native driver process; this is not a driver leak certification.
- Efficiency: offline16-voice callback benchmark p99=588us versus2666us half-deadline gate.
  Dense source fixture:~116k vertices +74,323 stroke instances; precise CPU p95/p99=6303/6416us,
  immersive=5956/6290us. These are CPU geometry timings, not GPU timestamp or hardware-soak claims.
- Live38-second real-device/Xwayland/Vulkan workflow passed: authenticated import, source before
  playback, native drag pause/seek/resume, new epoch, paused source with advancing engine, native
  keyboard input, mode acknowledgements and native Escape panic. Captures at1920×1080 were inspected
  in both modes; quieter source preview, separate actual PCM, lens-vs-played shapes and denser ridges
  are visible. No independent human comprehension acceptance is claimed.
- Capture harness corrections: wait for an exact PID/title visible window and compositor mapping;
  raise/focus that window before capture and input. Hidden/unmapped or cached identical-mode captures
  are not accepted as fresh evidence. Workstation-specific smoke requires Sway/Xwayland, xdotool,
  ImageMagick and Python websockets; core tests/app do not depend on that harness.
- Actual final hardware:48kHz/f32/stereo,256 requested buffer,99 frames latest callback observation,
  callback max415us, zero reported analysis drops/overloads/CPAL errors. ALSA still logged6 underrun
  warnings in the final run (other short runs varied); therefore the zero-underrun release gate is
  FAILED/open, regardless of the CPAL counter.30-minute soak, GPU frame-time/latency measurement,
  ten-minute-file stress and independent visual acceptance remain unfulfilled release gates.
- Expected-versus-actual design notes: bounded50ms source tiles plus view decimation and three FFT
  resolutions were sufficient for current budgets; no persisted multi-level spectral pyramid or
  persistent GPU tile cache was added. Stroke coverage AA replaces the proposed optional MSAA.
  Timeline dragging previews silently and commits once on release; audible scratch-scrubbing is
  intentionally not implemented. Native navigation does not retune or change synthesis controls.
- Evidence: docs/qa-evidence/song-landscape/ (tests/lint/build/CPU timing, native sanitizers,
  redacted live log, authoritative device report and native PNGs). No session secrets are committed.
- Launch: target/release/nova-daw (or cargo run --release). Import WAV/FLAC in the browser, then use
  Nova's bottom timeline. Source indexing is progressive; the blue underline indicates coverage.
- VCS: implementation is recorded on local main only. No new remote publication was requested for
  this phase; remote main/master/legacy-master are unchanged. The earlier completed publication and
  backup remain valid. Future work must not label this candidate as a certified audio release.

## Approved refinement — spectrum mesh, Audio Theorem branding, native controls
- User requests replacing spectrum-history lines with a mesh; additionally supplies AT2/assets
  icon.png for the top-left logo and requests a proper native controls menu. Menu breadth was asked
  asynchronously; mesh/logo implementation proceeds without waiting on that independent preference.
- Frozen boundary: native ABI v4 adds bounded indexed surface geometry; generic indexed GPU support
  stays in Nova. Music adapters stitch measured time/frequency samples without fabricating rows or
  crossing missing source tiles/epochs. Original PCM and played/projected paths remain separate.
- Logo is copied byte-for-byte into packaged assets, never loaded via an absolute workstation path
  at runtime. Generic texture ownership/sampling belongs in Nova; brand layout stays in the adapter.
- Single development phase followed by consolidated correctness/security/efficiency/code-quality
  and native visual QA. No audio-engine redesign or remote publication is included in this refinement.

### Mesh/menu implementation outcome and review
- Delivered the original Audio Theorem PNG in the top-left native HUD; byte-identical SHA256
  `95c7bbe35e519161929a2aaa5073dcfe3f5c4322e52bf7e75d6e37587461b9b3`. Native window is now
  titled AUDIO THEOREM / Nova. Cargo embeds artwork/shaders; SDL2_image is an explicit native dependency.
- Delivered a collapsible Controls menu (click or Tab): song play/pause, output gain, per-native-client
  sound/octave, presentation, logical/measured/projected layers, roots/modes/cadence, reduced motion,
  camera reset, analysis reset, panic. Deep synth controls and file import remain in the browser.
  No answer to the optional breadth question arrived; no full duplicate synthesizer editor was added.
- Delivered connected, shared-vertex spectral surfaces for live/output and indexed song history.
  A dense source uses192x320 vertices, with a separate compact actual-output surface when a file is
  loaded. Triangle stitching retains exact irregular Hz positions and does not cross missing tiles.
  PCM, current spectral ridge, played markers and projected paths remain independent.
- Efficiency review: fixed capacities65,536 vertices/393,216 indices, fence-safe GPU uploads,
  reusable per-vertex depth scratch rather than repeated transform work in the sort comparator.
  Texture upload/decoding happens once off the audio callback; no audio synthesis/state changes.
- Security/correctness review: ABI-v4 size/offset/count/index/finite checks, texture extent/byte-count
  checks, partial-initialization cleanup, no new filesystem/network routes, packaged trusted PNG.
  Menu actions use acknowledged snapshots and bounded coordinator requests; replaceable actions are
  disabled while pending. Focus loss/panic resets menu; menu opening cancels scrubbing without resume.
- QA corrections: removed unused exports caught by Clippy. The old disconnect test's fixed40ms wait
  could inspect a stale worker snapshot under load; it now waits for the actual condition with a
  three-second failure bound. No production disconnect behavior was changed to satisfy the test.
- Live-input harness correction: this workstation's Sway outputs start at global y1080, beyond part
  of Xwayland's root geometry. Pointer warps/focus churn lost clicks; those failed attempts were NOT
  accepted as verification. The final harness uses window-targeted X11 events with SDL XInput2
  disabled for synthetic input, and waits for focus-reset processing. Production input is unchanged.
- Native captures inspected in precise and immersive modes, controls open/closed, and960x1080 narrow
  layout. Brand/artwork, active button state and field distinctions are visible. Some world geometry
  crops at the narrow aspect; the menu/logo remain bounded. This is internal visual review, not
  independent human comprehension acceptance or GPU timing certification.
- Live50-second workflow from /tmp passed menu gain/visibility/presentation, source preview,
  seek/pause/resume, native note identity, and panic checks. BUT the run logged837 ALSA underrun
  warnings and71 analysis drops; callback max832us,48kHz/f32/stereo,256 requested/99 observed frames.
  Zero-underrun release gate is FAILED/open, not waived. Workstation load was around24 on24 CPUs;
  this observation is not proof of cause. No audio scheduling redesign is included in this UI change.
- Remaining release action items: investigate underruns/analysis drops on an isolated reference run,
  then rerun the30-minute soak; measure GPU p95/p99 and audio-to-visual latency; independent visual
  acceptance. Changes are a locally usable UI candidate, not a certified instrument release.
- Evidence: docs/qa-evidence/mesh-menu. Sanitized logs exclude session secrets. The opt-in live harness
  needs Sway/Xwayland, xdotool, ImageMagick, Python websockets and python-xlib; app/core tests do not.
- VCS: local main only for this refinement; no remote branch changes or new publication claimed.

### Refinement exit metrics
- Consolidated software QA:149 native Rust tests,146 no-native,9 browser, production Clippy,
  owned500/50-line gates and C++ -Werror all pass. Native ASan/UBSan/Vulkan validation passes;
  driver leak certification remains excluded (`detect_leaks=0`). Final locked release build passes.
- Dense192x320 source scene CPU p95/p99: precise6731/7481us; immersive6408/6744us. Shared-depth
  caching corrected the initial13.8ms p95 sort cost without decimating evidence. Offline16-voice
  callback p99=493us. Neither metric substitutes for GPU timing or the failed live audio soak gate.
- Expected UI deliverables achieved, with stated menu breadth. Hardware release certification is
  intentionally still open with explicit failures/action items above, not reported as complete.

### User-authorized publication — 2026-10-29
- User requested "push to git" after the mesh/menu candidate was committed locally.
- Expected: publish the two completed feature commits to NeoTecDigital/AudioTheorem, keep main and
  master aligned using the previously authorized workflow, and preserve legacy-master unchanged.
- Actual: fetched all three remote refs, confirmed main/master at94462a5 were ancestors of local
  main, then atomically fast-forwarded both to c543f55f57566a1ddf496ce838b97ba07ac483ad.
  `git ls-remote` verified both feature heads; legacy-master remains exactly
  9fd702026a0aefec6216cf7a0bf42906268f2332. No force push or history replacement was used.
- This publication ledger accompanies the code as a documentation-only fast-forward. Prior test
  evidence and the failed/open live audio gates are unchanged; publication is not release certification.
