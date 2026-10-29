# Analysis implementation — model 1

## Ownership and evidence
`Analyzer` consumes fixed stereo PCM blocks off the callback. Logical evidence integrates observed
voice envelope × velocity power over each publish interval. Measured evidence comes only from stereo
FFT power (left/right powers averaged, not waveforms averaged, so anti-phase stereo is preserved).
Projected links carry explicit `projected` labels; their salience is never injected into either field.
Imported files have no logical performer identity. Measured links identify resolution/band only.

## Frequency and time
Reusable FFT plans/scratch: 2,048 / 8,192 / 32,768 frames. Hops: 1,024 / 2,048 / 8,192.
Hann-window PSD uses window-energy normalization. Complementary frequency weights transition across
180–320 Hz and 1,600–2,400 Hz; they sum to one, so combining windows does not triple energy. During
warmup, available resolutions own unsupported regions. All bins including DC and Nyquist are retained
in their supported frequency regions. Peak bins use log-parabolic sub-bin interpolation; confidence
remains limited by actual bin width, not implied by interpolation. Ages are window-center ages plus
elapsed frames since analysis. `u32::MAX` means a resolution is not yet available.

PCM history is an exact 30-second fixed-capacity stereo ring. `Analyzer::set_history_view(seconds,
offset)` selects a 2 ms–30 s interval ending `offset` seconds before the current engine frame.
Selection is clipped to recorded samples; expired/unrecorded intervals are empty, never invented zeros.
`waveform` contains at most 512 exact interval extrema. At sample zoom (<=512 frames), each point
has identical signed `min`/`max` values and an exact one-frame interval. Wider views reuse cached
256-frame summaries with exact raw edge fragments; intermediate zooms read only their bounded
selected interval. `recent_pcm` remains the latest 1,024 actual stereo frames, independent of view.
A 30-second compact analysis ring retains spectral frequencies/powers, both evidence/compatibility
fields and tension values, avoiding repeated copies of the entire waveform history. The current
protocol publishes current analysis + waveform history; historical analysis retrieval is not exposed.
Gaps, seeks/epoch changes and explicit reset clear history/context. No continuity is synthesized.

## Harmonic interpretation
AudioTheorem's `PitchGroup::pitch_classes` supplies memberships. Exhaustive tests cross-check all
144 memberships against diatonic transpositions and AudioTheorem sharp/flat/interval matrices.
Support exponent is four. Compatibility and entropy-based confidence are separate. Silence has zero
group weight and neutral compatibility; uniform evidence retains the formula’s constant 7/12
compatibility with zero confidence and tied group weights, to be rendered neutral/uncertain.
No winner is selected when weights tie. Every frame retains 84 root/mode candidates.

Root memory decays over 12 seconds. Weighted normalized components are persistence (45%), fifth
support (25%), bass below 250 Hz (20%), completed cadence arrivals (10%). Root evidence is multiplied by raw group support (the sum of its member pitchclass evidence).
Scores are heuristics,
not calibrated probabilities. Both layers own independent root/cadence histories.

Cadence evaluates new evidence against preceding four-second context before updating it. Tension
smoothing is 120 ms. A peak >=0.25 followed by a drop >=0.15 within three seconds needs the same
supported destination for 500 ms before completion. The drop must also exist against the frozen
peak context, preventing a held unresolved note from “resolving” solely through context adaptation. Silence, uncertain context, short context and
gaps suppress declarations. Only completion reinforces root arrival history. Recent PCM silence
also suppresses measured declarations while long-window spectral tails decay. Events are capped at
64 and 30 seconds. All model thresholds and weights live in `src/analysis/config.rs`.

## Delivery / verification
Implementation includes deterministic membership, weighted-field, stereo-power, pitch, history,
mode/root, cadence, timbre separation, file attribution, discontinuity, noise, and projection fixtures.
Consolidated QA is run by the root after all components finish; this document does not claim passes.
Performance and visual-comprehension release gates require integrated measurements and review.

### Consolidated QA evidence (2026-10-29)

- Root integration was blocked by the unavailable `rtrb` crate, so an isolated offline Cargo harness
  imported the actual `src/contracts.rs`, `src/analysis/mod.rs`, and theory-only AudioTheorem by path.
  No copied/stubbed analysis implementation was used.
- Initial execution: 23/24 tests passed. A waveform bucket-stride defect incorrectly counted an absent
  partial summary; corrected it and reran the suite.
- Final component execution: **28/28 tests passed**; `cargo clippy --lib --tests -- -D warnings` passed.
- Added crossover conservation fixtures from 100 Hz to 22 kHz: a unit-amplitude stereo sine retains
  mean power 0.5 within 0.01 through the overlapping-resolution transitions.
- Verified all 144 AudioTheorem memberships, modes, signed stereo history, anti-phase audio, real
  frequency/uncertainty, bounded history pruning, epoch/gap reset, silence tails and unresolved holds.
- Root scores use the plan's raw group support `s_g`. A frozen-peak-context check reuses the specified
  0.15 drop threshold to prevent cadence declarations caused solely by context adaptation.
- Measured band identities encode FFT size and bin within JSON's exact integer range.
- Static owned-code scan: longest function 42 lines; largest file 258 lines; no new unsafe code,
  network/filesystem access, or unbounded incoming input loops in the analysis worker.
- Release-only diagnostic: 64 seconds of virtual 48 kHz stereo PCM, 16 logical voices, 3,000 published
  frames. `Analyzer::push` p95 **161.0 µs**, p99 **315.6 µs**, maximum **482.8 µs**. Process RSS was
  **34,228 KiB** after 32 virtual seconds and **34,484 KiB** after 64. This is a short isolated worker
  diagnostic, **not** an audio callback benchmark, hardware soak, or integrated memory/latency gate.
- Remaining gates: root integrated build/tests, audio-to-visual latency, full-application memory soak,
  device-reset recovery under hardware failure, and both visual reviews.


### History-view failed-gate correction (2026-10-29)

Expected: explicit zoom/scrub backed by actual bounded PCM, not synthetic historical slices.
Actual: implemented `set_history_view`, selected interval extrema, signed one-sample zoom, clipped
expired intervals, and efficient cached-summary wide views. View changes do not mutate evidence,
analysis, recent PCM, or audio state; reset preserves the requested view but clears old-epoch samples.

Verification: **34/34 component tests pass** against actual dependencies in the isolated harness;
Clippy `--lib --tests -- -D warnings` passes. Six added fixtures cover scrubbed sample identity,
midrange and wide-view min/max fidelity, exact interval boundaries, expired-data clipping, finite
parameter clamping, and view/evidence independence. Owned maxima remain 258 lines/file and 42
lines/function. Existing processing-effect contributions were preserved without modification.
Root integration owns the acknowledged View controls and HUD/native consumption of these results.
The repeated 64-second virtual worker diagnostic after this correction measured p95 163.4 µs,
p99 320.9 µs, maximum 442.1 µs; RSS 34,304→34,468 KiB between 32 and 64 virtual seconds.
This remains an isolated analysis-worker diagnostic, not a release hardware/performance gate.

## Native waterfall history view
The bounded engine history now supplies native spectral/PCM waterfall snapshots directly. Up to48
measured records retain exact sample times, original compatibility/confidence and window ages; each
uses at most160 peak-preserving log buckets for drawing only. This is not additional measured power.
The PCM view uses at most3,072 exact signed extrema buckets over the entire selected interval, split
into up to48 contiguous chunks. A cached256-frame summary query avoids rescanning whole30-second
buffers for every display bucket; partial edges are taken from actual samples. Below3,072 selected
frames, every bucket is a raw signed stereo sample. Native history is Arc-shared and skipped in JSON.

Tests cover complete coverage, exact extrema against source PCM, raw zoom, missing/scrubbed intervals,
original historical spectra, gaps/epochs, immutable snapshots, bounded rows/points and JSON omission.
The32-second release virtual diagnostic includes native history preparation, not just the FFT; see
QA.md for measured timings. Hardware audio/visual latency and the30-minute soak remain separate gates.
