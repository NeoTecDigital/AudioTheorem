# Version 1 frozen integration contracts

Rust types in `src/contracts.rs` are the wire schema. JSON uses snake_case tagged `action`.
Command identity is (server-assigned client, command id); voices are (client, voice id), never MIDI.
`at_sample: null` means next available sample; accepted is not applied. Ack includes applied sample,
revision and error. Snapshot is immutable, newest-only, complete; acknowledges bounded recent history.
Samples are stereo frames. Engine coordinates are output-rate frames, end exclusive, epoch-scoped; source coordinates are
asset-frame positions and retain asset identity independently of output epochs.
Headless is explicit virtual time, never claims an output device. Analysis gaps reset temporal inference.

## Runtime API for server and main
`runtime::Handle` is Clone with `snapshot: watch::Receiver<Arc<Snapshot>>`.
Async `command(client: u64, command: Command) -> Result<Ack,String>`; bounded channel, explicit failure.
Async `import(client: u64, bytes: Vec<u8>) -> Result<u64,String>` uploads content, not paths.
`disconnect(client)` releases only that client through independent atomic signal.
`panic()` independent emergency silence. Client IDs are unique increasing generation*32+slot (slot 1..31); native uses generation*32 (slot 0, starting at client 32); identity 0 is internal legacy control only.
Disconnect watermarks are monotonic per slot; stale disconnects cannot release newer clients.
`runtime::start(headless: bool) -> Result<Runtime,String>`; Runtime exposes `handle`, `tick_virtual(frames)`
and owns output stream. Main invokes explicit virtual ticks if headless; normal time is device callback.
`Runtime::shutdown()` joins coordinator after stopping audio.

## Analysis API
`analysis::Analyzer::new(sample_rate: u32)` and
`push(&mut self, block: &PcmBlock) -> Option<AnalysisFrame>`.
PcmBlock fixed 256-frame stereo storage, valid len, epoch/start, 16 VoiceObservation slots, gap flag.
Voice logical amplitude includes envelope and velocity. Imported playback is not a logical voice.
Analyzer owns all FFTs/history; publish <=~60Hz. No filesystem/audio callback use.
`reset()` clears temporal context/history. AnalysisFrame carries independent fields, spectrum, actual
waveform summaries, projected contribution links, all 84 mode candidates and independent cadence states.

## Native API
`visualizer::Visualizer::new(width,height) -> Result<Self,String>` (main thread only).
`frame(&mut self, snapshot: &Snapshot, input: &mut native_input::Controller) -> Result<bool,String>` returns false on close.
Visual settings are snapshot.view; visualization never changes audio/analysis.
Nova owns generic SDL/Vulkan/resources. Bridge owns music scene only, no duplicate Vulkan owner.
Versioned C ABI validates lengths/capacities; borrowed input only during call; exceptions -> error codes.
Rust wrapper !Send/!Sync; teardown on creating thread. Shader bytes compiled and embedded from OUT_DIR.

## Server API
`server::serve(listener: tokio::net::TcpListener, handle: runtime::Handle, token: String,
shutdown: tokio::sync::watch::Receiver<bool>) -> Result<(),String>`.
Bind loopback in main. Session random 256-bit token generated off audio thread; URL fragment login,
no remote origins/CORS. Exact bound Host and Origin checked. API auth via Bearer or authenticated socket
(first message token acceptable if strict short timeout); reject foreign WS Origin before upgrade.
Assets include_str/include_bytes allowlist only. Body max256MiB; commands max16KiB; bounded clients.
Main opens browser URL after binding; all normal native work remains on main OS thread.

## Coordinated QA addenda
- ModeCandidate intervals are authoritative root-relative semitones for renderer geometry.
- Snapshot carries acknowledged wavetable/partials, not optimistic editor data.
- PcmBlock processing flag marks bus protection; its voice observations accumulate logical energy
  over the interval, while Packet carries separate final voice state for the complete snapshot.
- View history_seconds (0.002..30) / history_offset (0..30) select real bounded waveform history.
  Analysis retains current evidence; waveform timestamps explicitly identify the chosen interval.

## Native-input / spatial-scene revision
- The earlier native-keyboard revision used **v2**. The current ABI is **v3**, documented below.
  That earlier Upload was 88 bytes; Events was 1,584 bytes with a bounded 128-entry
  array of 12-byte `{scancode, down, modifiers}` records, `focused`, `input_reset`, and `key_count`.
  Focus loss/minimize/event overflow explicitly resets input; repeats do not emit note starts.
- `Handle::submit(client, command)` nonblockingly enqueues in caller order and returns an acknowledgement
  receiver. The native controller tracks at most 64 pending commands; no per-key asynchronous spawn.
  Failures/timeouts cancel that native generation via the independent disconnect watermark.
- Slot 0 now participates in audio-thread disconnect processing. Network clients still exclusively
  receive server-leased slots 1..31; callers cannot choose a command source over the wire.
- Scene vertices with `position.w < 0` are clip-space HUD vertices. They bypass the camera transform
  and are appended after depth-sorted translucent world triangles. HUD upload capacity is reserved.
- World coordinates are centralized in `scene/spatial.rs`: source wall z=-4.8, spectrum z=4.5;
  exact log-Hz x positions, rendered measured-height interpolation, separate actual PCM floor.
  Projected paths terminate at the frequency baseline, never fabricated measured energy or PCM.
  Particle trajectories are illustrative connections, not physical acoustic propagation or phase.

## Authoritative stream-history view
`AnalysisFrame.stream_history: Arc<StreamHistory>` is native-only (`serde(skip)`). It shares an
immutable view from the engine's recorded PCM/analysis rings without multiplying browser messages.
History contains epoch, actual selected start/end, at most192 distinct measured spectrum slices and
48 consecutive stereo PCM chunks, at most320 peak-preserving logarithmic drawing bands per spectral
slice and3,072 exact min/max PCM buckets in total. Spectral timestamps, original compatibility and
FFT ages are retained; no current frame is replicated into earlier times.
PCM buckets cover the entire available selection without gaps. One-frame buckets are signed raw
samples; larger buckets are explicitly envelopes. Selection uses acknowledged history_seconds and
history_offset. Missing history is empty, epoch/gap resets clear retained data, and renderer pauses
cannot erase engine-recorded history. These additions do not alter the JSON schema or native C ABI.


## Source preview / transport / ABI v3
- Snapshot adds exact `playback_frame`; native-only `song: Option<Arc<SongIndex>>` is serde-skipped.
  Index identifies asset/rate/length/hop, exact stereo overview, immutable Arc tiles and coverage.
  Only one latest snapshot is retained by each consumer; replaced imports cancel indexing.
- Index tiles contain 32 real 50ms source summaries, at most320 spectral bands/row, independent
  fields and FFT ages. At600seconds there are at most12,000 rows; overview at most2,048 buckets.
  Missing tiles are None, never inferred silence. Source previews contain no logical voices or
  cadence state. Renderers request/inspect source data without changing live inference.
- Action `transport` carries `{transport:{asset,frame,generation,playing}}`; asset and bounds are
  rechecked by the audio owner. Generation is strictly increasing per client/asset. Seek and
  playing state apply atomically, with an applied-sample ack. Panic cancels pending resumes.
  File transitions have a bounded5ms smoothing tail; PCM history records actual resulting output.
- Native v3 Upload112 bytes adds bounded stroke pointer/count/stride and triangle HUD start.
  Events3,636 bytes adds128 ordered16-byte pointer records (kind down/move/up/wheel1..4, normalized
  x/y and wheel delta). Focus loss/overflow resets capture; pointer data is copied before return.
- Source cursor and output sample cannot be subtracted or treated as one continuous time axis.
  Pause/seek/mixing have independent semantics; no inferred time correspondence is published.
