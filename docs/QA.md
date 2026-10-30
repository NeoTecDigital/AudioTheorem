# Consolidated QA / release gates — 2026-10-29

## Latest refinement — spectral mesh, original branding, native controls
- **149 native /146 no-native Rust tests and9 browser tests pass.** Production Clippy, owned
  Rust line limits, native `-Werror`, ABI-v4 bounds/layout/finite/index tests pass. No queue shim.
- Native ASan/UBSan + Vulkan validation passed indexed draws, partial texture initialization,
  resize/minimize/restore and input-boundary tests. Leak detection was disabled for the driver
  process; this does not certify driver leak freedom.
- Final dense source geometry CPU p95/p99: precise6731/7481us, immersive6408/6744us. Before caching
  vertex depths, this mesh's sort cost produced13846/14882us precise; reusable depth scratch reduced
  that cost without reducing measured history resolution. These are **CPU, not GPU timings**.
-16-voice offline callback p99=493us against2666us half-deadline target at48kHz/256 frames;
  allocation/deallocation and source/transport regressions pass. No audio DSP code changed here.
-50-second native workflow launched from /tmp with embedded artwork/shaders and inspected both
  modes plus a960x1080 menu layout. Engine-acknowledged gain/visibility/style, timeline, keyboard,
  and panic checks pass. Targeted X11 synthetic pointers require the harness's SDL XInput2 override;
  this is not a default-driver hardware-mouse certification. Temporary/stale debug captures omitted.
- **Audio release gate remains failed:**837 ALSA underrun warnings and71 analysis drops in this
  loaded-workstation run; callback max832us, CPAL errors0, overloads0. Do not equate zero CPAL errors
  with zero underruns. Earlier runs also failed this gate. Isolated diagnosis,30-minute zero-underrun
  soak, GPU/latency measurement and independent visual acceptance remain outstanding.
- Source/projection/logical separation is unchanged; meshes interpolate geometry only and do not
  bridge missing source tiles or output epochs. Logo bytes match the supplied asset exactly.
- Evidence: `docs/qa-evidence/mesh-menu/`; implementation on local main only, no new push.


## Current revision — engine-recorded PCM and spectrum waterfalls
-115 native-default Rust tests and112 no-native tests pass;9 browser tests pass. Three diagnostics
 are ignored in normal suites; the two new CPU diagnostics were run separately in release mode.
-Production Clippy/owned source limits and native C++/shader/ABI/input checks pass. Existing callback
 allocation/deallocation and source-isolation tests still pass with real rtrb.
-Exact stereo extrema/coverage, raw sample zoom, historical spectra, bounded rows/bands, gap/epoch/seek
 resets, renderer-independent history, immutable native snapshots and browser JSON omission are tested.
-32-second virtual analysis plus history preparation:p95=1932µs, p99=2214µs (1500 published frames).
 Release geometry fixture:p95/p99 precise5380/5852µs, immersive5896/6544µs. These exclude GPU timing.
-Software previews of both full history streams were inspected; overlapping legend/axis labels were
 corrected. This is not live GPU capture or human acceptance. Live audio/GPU/socket gates remain blocked.
-Evidence in `docs/qa-evidence/history-stream/`. Publication to neotecdigital/AudioTheorem was authorized
 but network access/DNS and escalation policy prevent fetching or pushing; no remote update claimed.

## Previous revision — native keyboard / screen HUD / spatial spectrum
- **108 native-default Rust tests passed**, plus105 no-native tests, using real registry rtrb0.3.2.
  Two diagnostics are ignored in ordinary suites; the CPU scene diagnostic was run separately.
- **9 browser tests passed** unchanged. Production lib/bin Clippy `-D warnings` and owned line
  gates pass. Native input is now included in the owned line checker.
- **Clean locked release build passed** from empty `/tmp/nova-spatial-clean`, including actual Nova
  sources, compiled embedded shaders and actual rtrb. No Cargo patch; Cargo.lock hash unchanged.
  `target/release/nova-daw` was also rebuilt with the current production code.
- Native `-Werror` build, ABI-v2 layout/rejection, key ordering/repeats/focus reset/overflow tests pass.
  ASan/UBSan pass with `detect_leaks=0` (LSan remains an unverified gate).
- New regressions cover physical-key frequency/release identity across octave/instrument/modifiers,
  ordered starts/releases, independent native cancellation, queued-start cancellation, saturation,
  Escape/drop, actual-depth stream endpoints, measured-height interpolation, no projected/processing
  contamination, bounded stream history and camera-independent HUD.
- Internal software previews of both modes inspected at1080p: upright matrix, depth-running curves,
  forward spectrum, separate actual PCM, screen-anchored overlay. These are not GPU captures or user
  visual-comprehension approval. Preview PNGs are retained beside the verification logs.
- Release CPU-only geometry fixture:p95/p99 precise1246/1407µs, immersive1716/1799µs. This excludes
  Vulkan upload/presentation and is not the required GPU frame budget or maximum-load certification.
- Live verification remains **blocked**: finite headless launch cannot bind localhost (EPERM), native
  window test reports `No available video device`, and `/dev/snd` is absent. No hardware/audio/soak,
  live SDL performance, actual browser interaction, or end-to-end visual certification is claimed.
- Evidence: `docs/qa-evidence/native-spatial/`. The older test-double results below are retained for
  narrative only; the missing-production-dependency blocker is now resolved.

## Scope and honesty boundary
Phase1 baseline failed native linking and browser syntax. Components then implemented the frozen
contracts in non-conflicting ownership areas. Foundation, instrument and experience implementation
converged in one coordinated component development pass; their separate exit gates remain recorded
below, not retroactively claimed as passed. One consolidated QA stage found defects, corrected them
and reran verification. No repository commits/branches were invented; root metadata is unusable.

## Original implementation evidence (historical)
- Integrated Rust native-default suite with explicit temporary queue TEST DOUBLE: **99 passed**
  (87 library,2 real-time allocation,6 coordinator,4 synthesis);1 offline benchmark ignored by default.
- The original engine/theory regression tests remain compiled only under `cfg(test)`.
- No-native integrated suite before final device-gap regression:95 passed with the same test double.
- Clean release source build in empty `/tmp/harmonic-clean-target`: PASS with explicit test double,
  demonstrating no cached native archive dependency; not an actual-rtrb release build.
- Direct browser-control tests: **9 passed**; all seven modules pass syntax checks.
- Actual Axum Router/security tests (no listening socket): **10 passed**, included above.
- Production library/binary Clippy with warnings denied: PASS using the test double.
  Legacy test-only source has pre-existing lint debt; all-target Clippy is not a claimed pass.
- Owned Rust file/function line gate: PASS. Components separately reviewed nesting and C++/JS limits.
- Native shader/C++ build from source with `-Werror`: PASS. ABI failure/capacity/layout checks pass.
- Native ASan/UBSan boundary tests: PASS with leak detection disabled; LSan cannot operate under ptrace.
- Analysis-only independent real-dependency suite:34 passed, Clippy clean. 64-second virtual workload
  diagnostic p99=315.6µs; RSS32→64seconds34228→34484KiB. Not a30-minute memory soak.
- Offline maximum synthesis-load render diagnostic, test-double transport: p99=448µs against a
  5333µs256-frame deadline /2666µs target. No sound device, CPAL callback timing or underruns certified.
- Software geometry previews of both modes were inspected, including root review. Found/fixed
  immersive marker depth and glow-darkening defects. These are not GPU screenshots or user approval.

## Corrections found during QA
- `deny_unknown_fields` on a flattened Command rejected valid commands; fixed with strict Action
  deserialization and explicit valid/invalid JSON regressions.
- Waveform summary stride lost portions of actual history; corrected and fidelity tested.
- Held unresolved evidence could appear to resolve through context adaptation; cadence now checks
  the frozen peak context as well.12-second unresolved hold regression passes.
- Early release of future starts could otherwise stick; coordinator scheduling now prevents it.
- Cross-source/reconnect identities, per-source disconnect, queue saturation and independent panic tested.
- Release/panic exempted from ordinary socket rate limiting; key-up uses stable physical identity.
- FM/Hertz HUD limits aligned to engine validation; camera moves now await acknowledged View state.
- Source/asset retirement and maximum voices instrumented: zero allocations AND deallocations in
  tested render invocations, including resource replacements. This does not replace hardware soak.
- Logical energy accumulates across the block rather than fabricating a whole block from final voices.
- Sample mipmaps/file-downsampling filters added; finite payloads, malformed magic and content-only
  imports verified. Bus protection gets explicit processing status, never a fabricated source.

## Original blocked / incomplete release gates (see current result above)
1. **Actual rtrb fetch and full clean locked build.** Registry DNS/network unavailable; no approved
   substitution. Test-double results cannot prove behavior/performance of the actual queue.
2. **Live localhost launch and browser WebSocket workflows.** Listener bind returns EPERM. Chromium
   also fails setsockopt under sandbox. In-process routing tests do not certify real upgrades or UI.
3. **Audio hardware:** `/dev/snd` unavailable. Actual negotiated48kHz/256, audio quality, callbackp99,
   device-reset recovery, zero-underrun30-minute reference soak and measured latency remain unverified.
4. **Native hardware:** SDL reports no available video device; vulkaninfo reports no valid GPU.
   Vulkan validation, resize/minimize cycles, full partial-init fault injection,1080p frame percentiles,
   GPU resource leak/memory soak and end-to-end audio→visual latency remain unverified.
5. **Visual acceptance:** explicit human comprehension/polish review in both modes remains open.
   Software fixture previews are insufficient. Selected phase-aware source summation is not exposed. Time-history zoom/scrub now selects
   actual PCM intervals; signed close-up and30s overview remain distinct from current evidence.
6. **Coverage:** exhaustive alias sweeps across sample/modulation boundaries, malformed FLAC corpus,
   stalled real clients and30-minute sustained memory bounds still require release fixtures/hardware.

## Re-run on an enabled workstation
First fetch actual dependencies and run the README commands without a Cargo patch. Use a fresh
`CARGO_TARGET_DIR` to establish source build independence. Run outside the repository to verify
embedded assets. Then exercise two authenticated clients, saturation, focus loss/reconnect, stereo
file seek/pause and native close. Run ASan/UBSan/LSan and Vulkan validation during resize/minimize.
Collect hardware callback timing/allocation/underrun logs and30-minute RSS; record frame p95/p99 in
both modes and fast-window latency. Finally obtain a reviewer decision on the recorded comprehension
fixtures. Do not launch/publish or mark Phase5 complete until these gates pass.

## Original artifact state (superseded by real-dependency verification above)
The repository retains the production rtrb dependency and its registry lockfile entry/checksum.
The temporary test-double dependency and unused crossbeam-queue lock entry were removed after
verification. No repository Cargo patch points into /tmp. Final ordinary `cargo test --offline
--locked` remains blocked specifically by uncached rtrb, rather than silently using the test double.
Raw session logs were copied to docs/qa-evidence; they explicitly identify any test-double build.

### History-stream source transfer
A fresh release build of the metadata/cache-free source export at
`/tmp/AudioTheorem-current-source` passed using `/tmp/audiotheorem-source-build` and the real locked
dependencies. Source transfer retains modified Nova/theory sources and licenses rather than losing
unpublished dependency changes as Git links. The unneeded compiled Nova example and Windows vendor
build helper were excluded (listed in package-exclusions.txt). No credential-pattern matches, Git
metadata, targets or machine-private state were found in the transfer. This is preparation, not a
remote synchronization:GitHub repository contents/branches remain unverified and nothing was pushed.

## Compact PCM adjacency revision
- Scope: four waterfall module/test files only; PCM moves beside spectrum history, not between
  spectrum and pitchclass. Both histories share the spectrum-plane origin and +Z sample-time axis.
- World-space stereo width4.60→2.15, amplitude scale0.70→0.30; peak alpha0.80→0.50, thinner lines.
  Full selected PCM, stereo signs/extrema, raw zoom, actual timing and gap isolation remain intact.
- Regression gates: PCM outside spectrum's frequency span, compact bounds/opacity, shared-time
  temporal anchors, and default1080p HUD clearance in both modes. QA caught the oldest age label
  reaching the HUD; smaller, offset labels and relocated PCM title resolve it without camera changes.
- Correctness:117 default-native Rust tests pass (104 library +13 integration),114 no-native Rust
  tests and9 browser tests pass. Production Clippy (warnings denied) and locked offline release build pass.
  Both software previews inspected; these are deterministic geometry, not live GPU captures.
- Security/efficiency/code review: no new input, filesystem/network surface, queues or audio-thread
  operations; same bounded history geometry, fewer duplicated age labels, shared layout constants.
  Owned line limits pass. Evidence and the source delta are in `docs/qa-evidence/compact-pcm/`.
- Live desktop visual approval and previous hardware performance/soak gates remain open.

## Double-size table / amplitude-linked emission revision
-125 default-native Rust tests (112 library +13 integration),122 no-native Rust tests and9 browser
  tests pass. Production Clippy with warnings denied, owned line limits and locked release build pass.
- New fixtures cover two-dimensional table scale, all144 voice origins, detuning/row wrapping,
  amplitude/radius/intensity/density monotonicity, silent/invalid power, bounded deterministic spread,
  unchanged spectral destinations, matching cell/emitter response and HUD clearance in both modes.
- Both software geometry previews reviewed. Doubling initially clipped the old heading/root gutter
  and collided with PCM labels; compact annotation reflow and raised root overlays correct that,
  without changing the 2× table dimensions, camera, spectrum/history geometry or history selection.
- Security: no new input/control/file/authentication boundary; invalid power yields no emitter.
  Physics/evidence: no theoretical energy enters measured bands, emission spread is illustrative,
  and Hz→cents positioning is separate from classification and compatibility color.
- Efficiency/code quality: existing16,384 event/262,144 vertex capacities remain, emission count≤3
  per contribution; only measured paths draw16-segment footprints. No extra audio-callback work,
  queues or persistent state. Shared transform/response modules prevent geometry/brightness drift.
- Evidence: `docs/qa-evidence/matrix-scale/`. Hardware certification, long soak and independent
  human visual comprehension approval remain separate from these software acceptance results.

### Newly enabled desktop smoke (not release certification)
Native X11/Vulkan launch, authenticated real WebSocket control, three differently weighted tones
(including444Hz detuning), resize, both presentation modes, panic acknowledgement and finite shutdown
were exercised. Initial occluded/black capture was rejected; activation/readiness and nonblank-image
checks produced native images in both modes. Camera input changed during the live captures; fixed
framing acceptance is from the deterministic software fixtures, not those interactive captures.
Actual default device:48kHz, f32 stereo, requested256 frames; observed callback size was variable
(latest131), callback maximum1714µs in a three-voice snapshot. **Audio release gate failed:** the
25-second rerun logged177 ALSA underrun warnings even though CPAL's exposed errors counter was0.
This is a recorded issue, not a zero-underrun or timing pass. Investigate device/backend scheduling
and xrun observability on the workstation before release; no unrequested audio redesign was bundled
with these visual changes. Both logs are retained with session tokens redacted. Previous assertions
that all desktop access is unavailable are historical; remaining soak/performance gates still apply.
