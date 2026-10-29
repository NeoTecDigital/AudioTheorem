# Source migration inventory

| Previous source / responsibility | Live implementation | Retained / retired |
|---|---|---|
| src/main.rs sleep/audio/render coordination | synchronous main OS-thread Nova loop; independent Tokio server and coordinator | Main replaced; no alternate runtime |
| src/engine/audio_output.rs Rodio producer and sample mutex | src/audio/device.rs CPAL device callback | Old module only compiled for original regression tests |
| src/engine/voice.rs MIDI-owned voices | src/audio/synth.rs + render.rs client/voice identities, sample timestamps | No old voice engine in executable |
| engine wavetable/sampler | prepared band-limited banks + sample mipmaps + bounded stereo asset decoder | Existing palette preserved; no live sequencer |
| src/dsp/spectrum.rs fixed bins | src/analysis/spectrum.rs three planned FFTs, continuous spectral power | Old tests only |
| src/theory/mod.rs combined performed/projected/measured | src/analysis/{theory,field,roots,cadence,layer,contributions}.rs | AudioTheorem memberships reused and exhaustively tested |
| nova_bridge/nova_visualizer.cpp owns Vulkan | extern/Nova/{Nova,Scene} generic owner + thin versioned bridge | Previous bridge archived .reference; old Nova demo Core unlinked |
| src/visualizer/nova_ffi.rs worker rendering | main-thread-only wrapper + application scene adapter | No Send/Sync handle; exceptions contained |
| src/server/mod.rs permissive unauthenticated filesystem server | modular server security/assets/socket/import | Arbitrary filesystem routes and permissive CORS removed |
| web/daw-harness.js duplicate synthesis, theory and sequencer | seven packaged HUD modules and local styles | Old harness removed; no alternate audio or sequencer route |
| root build.rs prebuilt archive | source compilation and shader embedding into OUT_DIR | target/nova_lib is not consulted |
| AudioTheorem runtime/graphics pulled into theory usage | optional runtime feature; root disables default features | Upstream runtime default retained for its own users |

The initial workspace's root Git metadata was unusable. Nested dependency repositories retained
their existing metadata and modifications during development; publication/restoration is recorded below.

## AudioTheorem repository integration
Publication uses a fresh checkout of `NeoTecDigital/AudioTheorem` on local `main`. After the source
integration commit, its verified fetched Git metadata was restored to the original workspace,
which now also tracks `origin/main` on local `main`. No history was invented. The pre-existing
`main` and `master` have unrelated
histories. A local merge preserves both, before a separate current-application source sync retires
the old root EGUI/MIDI application and its unused icon. All retired files remain in Git history.
The original master's README identified its license as **Ancillary**; this migration does not grant
new rights or replace that notice. Vendored Nova/AudioTheorem/CloudCanvas notices are retained.
Per explicit user instruction, preserve the old remote master at `legacy-master`, then move master
forward to the same verified head as main. No force push or history truncation is required.
