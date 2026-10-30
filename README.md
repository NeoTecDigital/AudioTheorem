# Harmonic Instrument

Linux instrument with an authoritative Rust audio/analysis engine, source-built Nova
visualization, and an authenticated browser HUD. This is **not a DAW**; the old sequencer
and independent browser synthesizer are not exposed.

**Status: implementation candidate, not release-certified.** See [delivery ledger](docs/PLAN.md)
and [verification evidence](docs/QA.md). Builds and tests use the actual pinned `rtrb` dependency;
the earlier test-double and network restrictions no longer apply. Hardware release certification
and full end-to-end browser acceptance remain separate from the automated/software visual checks.

## Build and launch on a Linux desktop

Requirements: Rust/Cargo, C++20 compiler, SDL2/SDL2_image/Vulkan/ALSA development libraries, `glslc`,
Vulkan driver, and an audio output device. First resolve the pinned Cargo dependencies.

```sh
cargo build --release --locked
./target/release/nova-daw
```

One launch opens Nova and a browser. The printed loopback URL contains a per-launch session
secret in its fragment. Do not share it. Native close or Ctrl+C shuts down the application.
Assets and compiled shaders are embedded; the executable does not depend on its working directory.
System shared libraries/drivers remain required. This is a local desktop application, not remote hosting.

```sh
# Explicit virtual audio clock; no device or native window is claimed.
cargo run --no-default-features -- --headless --no-browser --port 8080
# Finite diagnostic run (still needs permission to bind localhost).
./target/release/nova-daw --headless --no-browser --seconds 10
```

`--port 0` chooses an available loopback port. Other options: `--help`, `--no-browser`,
`--headless`, `--seconds N`. Device failure is an error, not a silent fake-audio fallback.
The HUD reports negotiated sample rate/format/channels and observed callback frame count.

## Native keyboard and spatial view

Click the Nova window to play the same physical-key layout as the browser:
`Z S X D C V G B H N J M` then `Q 2 W 3 E R 5 T 6 Y 7 U I`.
`[` / `]` change native octave; `F1`–`F6` select wavetable, sine, kick, snare, hat, bell.
These are native input preferences for new notes; synthesis parameters remain shared engine state.
`Esc` panics all sound. Focus loss/minimize releases only Nova's notes; browser/file sound continues.
Drag to orbit, scroll to zoom. Release identity survives octave/instrument changes.

The matrix is an upright source wall. Audio-timed particle streams traverse real world depth into
continuous-frequency spectral heights. Its table is now 2× its original width and height. Source
positions follow continuous pitch cents; measured emitter radius, brightness, particle size/density
and cell fill follow an absolute spectral-power response, without boosting everything to the loudest
band. The emission spread is illustrative, not extra frequencies or measurement uncertainty.
Compact stereo PCM streams beside the measured spectrum
history, outside the wall-to-spectrum flow. Both waterfalls share a time axis and engine-recorded history.
The browser **PCM + spectrum history** controls select duration/look-back (up to30seconds). Overview
PCM shows signed min/max envelopes; short selections show raw signed samples. Scrubbing shows past
data without overlaying live particles; return look-back to0 for live flow.
The screen-fixed HUD shows essential audio/input/analysis status, candidate ambiguity, cadence and
legend—not another synth editor. Browser sound-design/import controls remain unchanged.

## Play and inspect

- Typing/pointer keyboard or **8–8,000 Hz** continuous entry; 16 stable client-owned voices.
- Wavetable drawing (projected to 32 band-limited partials), 32 additive partial controls,
  FM up to 1,000 Hz / 500 Hz depth, AM, ADSR, low-pass, morph, output, two fixed-destination LFOs.
- Wavetable, sine/sub, kick, snare, hat and bell instruments. Switching instrument or octave
  does not change the identity of a held voice. Escape/panic silences all sources.
- Upload mono/stereo WAV or FLAC, maximum 256 MiB and ten minutes. No filesystem path import.
  Pause, seek and reset analysis are engine operations; imported files supply measured evidence only.
- Native matrix → continuous spectrum → real stereo waveform/history. Cyan diamonds mean played;
  interior means measured; border means logical compatibility; dashed paths mean projected.
- Root/mode candidates and cadence are explainable model estimates, not musical verdicts.
  Precise and immersive modes share the same evidence and color semantics; reduced motion is available.

## Verification

```sh
cargo test --locked
cargo test --locked --no-default-features
cargo clippy --locked --lib --bin nova-daw -- -D warnings
node tests/browser-controls.mjs
python3 scripts/qa/limits.py
NOVA_TEST_FLAGS='-O2 -Werror' nova_bridge/tests/run.sh
cargo test --release --test realtime callback_budget_reference -- --ignored --nocapture
```

These commands require the actual dependency resolution; none automatically substitute a queue.
The offline benchmark is **not** the required 30-minute hardware soak. Do not infer zero
underruns, GPU timing, or visual acceptance from it. Full remaining gates are in `docs/QA.md`.

## Source map

- `src/contracts.rs`: frozen versioned commands, acknowledgements, snapshots and analysis records.
- `src/audio/`: callback-owned synthesis, fixed transports, explicit retirement, offline assets.
- `src/runtime/`: bounded command coordinator and newest-only immutable snapshots.
- `src/analysis/`: reusable FFTs, separate fields, roots/modes, cadence, bounded actual history.
- `extern/Nova/Scene/`: generic GPU/window/frame ownership; `nova_bridge/`: checked C ABI.
- `src/visualizer/`: music geometry and main-thread-only native wrapper.
- `src/server/`, `web/`: packaged authenticated controls; no browser audio/theory engine.
- Original `src/engine`, `src/dsp`, `src/theory`: test-only regression fixtures, not linked into the app.

## Repository history and notices

The previous AudioTheorem application's history and its **Ancillary** license notice are preserved;
this source migration does not grant new rights. Vendored notices remain with their sources.
See [migration details](docs/MIGRATION.md) and the `legacy-master` branch for the prior application.

### Native controls and spectral surface
- The supplied Audio Theorem logo is packaged in the binary and shown in Nova's top-left.
- Click **Controls** or press **Tab** for playback, output level, native sound/octave,
  presentation/layers/overlays, reduced motion, camera reset, analysis reset, and panic.
  Values reflect engine acknowledgements; Escape remains an immediate panic, not menu dismissal.
  Click outside or press Tab to dismiss. Detailed synthesis and WAV/FLAC import stay in the browser.
- Spectrum history is a shaded time × frequency mesh. Height is measured spectral power;
  triangles interpolate display geometry only. Missing indexed tiles/analysis epochs are not joined.
  Source-song preview remains pre-gain and separate from actual output PCM and played notes.
