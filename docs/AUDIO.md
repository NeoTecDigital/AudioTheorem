# Audio/control implementation notes

## Real-time ownership and limits
CPAL owns invocation timing. The callback exclusively owns `Render`/`Synth`; it has no locks,
FFT, JSON, filesystem calls, table preparation or decoding. Tables, samples, queues and FIR
storage are prepared beforehand. Moved old tables/assets go through the retirement queue and
are destroyed on the coordinator. Separate 32-entry normal/release queues and corresponding
pending partitions protect release capacity; 128 acknowledgements are capacity-checked before
application. Acknowledgements cannot silently overflow. Parameter requests received in the same
coordinator batch coalesce with explicit superseded errors. Excess starts are explicitly rejected.

Emergency silence and per-slot monotonically increasing disconnected-client watermarks are
independent of queues. A saturated release path explicitly silences that client and requires
reconnect. Panic generations cancel queued pre-panic starts. Early release of a future start is
scheduled at that start, avoiding stuck voices. Voice identity is client+voice id, never tuning,
selected instrument, octave, MIDI number or frequency. Public command ids and internal transport
tickets are distinct. Replaying a public command id is rejected.

Synthesis: 16 voices; 32-partial band-limited table banks, 20ms table crossfade, 10ms control
smoothing, one FM/AM oscillator per voice, two shared LFOs. Four-times oversampling and a127-tap
Blackman-windowed decimator handle synthesized modulation/protection processing. Existing sample
palette is prepared offline with anti-aliasing mipmaps. Uploaded downsampling uses a63-tap FIR;
rate conversion interpolates stereo frames rather than folding channels together. Same-rate files
preserve decoded frame samples. Import preparation is serialized and bounded; decode headers and
actual decoded duration are both checked. Uploaded samples must be finite.

No acoustic alias-free certification is claimed beyond the numeric fixtures: full advertised range
and every modulation/sample combination still need release alias sweeps. Output mix protection is
reported as bus processing rather than attributed to one voice. End-of-block voice state is separate
from block-averaged logical energy, preserving briefly sounding notes; same-slot reuse beyond the
bounded logical interval capacity explicitly flags a gap rather than inventing history.

## Clock and status
48kHz preferred, then44.1kHz; stereo preferred. Device-supported sample format is negotiated;
requested256 frames may be adapted to supported device constraints. HUD reports observed callback
length, not a claim that every driver honored256. Stream errors are counted; this is **not** a
certified underrun detector. Virtual mode is explicit output-free frame advancement. Seeks/resets
increment the audio epoch; analysis clears continuity. Device recovery currently requires restart;
errors are reported, not concealed by switching clocks.

## Dependency audit
Actual required transport is `rtrb=0.3.2`; it has no non-development dependencies and the used
`push/pop/slots` APIs were checked against its official documentation:
https://docs.rs/rtrb/0.3.2/rtrb/ and https://docs.rs/rtrb/0.3.2/rtrb/struct.Producer.html.
Local registry download was unavailable. Integration QA used a temporary explicitly patched
`/tmp/harmonic-queue-test-double` (cached ArrayQueue), **not** the production dependency.
No patch or alternative transport is enabled in the project manifest. User approval for a real
substitution was requested but not received; production remains rtrb.

The test double's lock entry must not remain in the deliverable. The registry rtrb0.3.2 checksum
is corroborated by published upstream package lockfiles:
https://docs.rs/crate/foyer-storage/0.22.3/source/Cargo.lock and
https://docs.rs/crate/fusion-web/0.1.0/source/Cargo.lock.
Actual fetch and clean `--locked` build still require verification.

## Native-spatial revision verification update
The registry rtrb0.3.2 dependency is now available locally. The current108-test integrated suite,
including both render-allocation tests, passes with real rtrb and an unchanged production lockfile.
The earlier test-double discussion is historical. Native source generations now use slot0 (32,64,...)
and use the same independent disconnect watermark path as browser clients; callback iteration now
includes slot0. No audio algorithm, public synthesis limit or allocation policy changed.
Clean locked source release build passes. Hardware sound/underrun/soak gates remain unverified.
