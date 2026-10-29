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
