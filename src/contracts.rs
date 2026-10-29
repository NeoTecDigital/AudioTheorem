//! Version 1: sample-clocked authoritative wire and worker contracts.
use serde::{Deserialize, Serialize};
mod history;
pub use history::*;

pub const VERSION: u32 = 1;
pub const VOICES: usize = 16;
pub const BLOCK: usize = 256;
pub const MAX_CLIENTS: usize = 32;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Command {
    pub id: u64,
    pub at_sample: Option<u64>,
    #[serde(flatten)]
    pub action: Action,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum Action {
    Start {
        voice: u64,
        hz: f32,
        velocity: f32,
        instrument: u8,
    },
    Release {
        voice: u64,
    },
    Controls {
        controls: Controls,
    },
    Wavetable {
        samples: Vec<f32>,
    },
    Partials {
        amplitudes: Vec<f32>,
    },
    Playback {
        playing: bool,
    },
    Seek {
        seconds: f64,
    },
    ResetAnalysis,
    View {
        view: View,
    },
    Panic,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct Controls {
    pub gain: f32,
    pub attack: f32,
    pub decay: f32,
    pub sustain: f32,
    pub release: f32,
    pub cutoff: f32,
    pub fm_hz: f32,
    pub fm_depth: f32,
    pub am_depth: f32,
    pub morph: f32,
    pub lfo_hz: [f32; 2],
    pub lfo_depth: [f32; 2],
    /// 0 frequency, 1 amplitude, 2 morph, 3 cutoff.
    pub lfo_destination: [u8; 2],
}

impl Default for Controls {
    fn default() -> Self {
        Self {
            gain: 0.2,
            attack: 0.01,
            decay: 0.2,
            sustain: 0.7,
            release: 0.25,
            cutoff: 18000.0,
            fm_hz: 0.0,
            fm_depth: 0.0,
            am_depth: 0.0,
            morph: 0.0,
            lfo_hz: [0.0; 2],
            lfo_depth: [0.0; 2],
            lfo_destination: [0, 1],
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct View {
    pub immersive: bool,
    pub reduced_motion: bool,
    pub logical: bool,
    pub measured: bool,
    pub projected: bool,
    pub roots: bool,
    pub modes: bool,
    pub cadence: bool,
    pub pythagorean: bool,
    pub yaw: f32,
    pub pitch: f32,
    pub distance: f32,
    pub history_seconds: f32,
    pub history_offset: f32,
}

impl Default for View {
    fn default() -> Self {
        Self {
            immersive: false,
            reduced_motion: false,
            logical: true,
            measured: true,
            projected: true,
            roots: true,
            modes: true,
            cadence: true,
            pythagorean: false,
            yaw: 0.0,
            pitch: 0.2,
            distance: 18.5,
            history_seconds: 30.0,
            history_offset: 0.0,
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Ack {
    pub client: u64,
    pub id: u64,
    pub revision: u64,
    pub applied_sample: u64,
    pub error: Option<String>,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
pub struct VoiceObservation {
    pub client: u64,
    pub voice: u64,
    pub hz: f32,
    pub amplitude: f32,
    pub held: bool,
    pub instrument: u8,
}

#[derive(Clone)]
pub struct PcmBlock {
    pub epoch: u64,
    pub start: u64,
    pub len: usize,
    pub pcm: [[f32; 2]; BLOCK],
    pub voices: [VoiceObservation; VOICES],
    pub gap: bool,
    pub processing: bool,
}

impl Default for PcmBlock {
    fn default() -> Self {
        Self {
            epoch: 1,
            start: 0,
            len: 0,
            pcm: [[0.0; 2]; BLOCK],
            voices: [VoiceObservation::default(); VOICES],
            gap: false,
            processing: false,
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct DeviceStatus {
    pub available: bool,
    pub name: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub format: String,
    pub requested_buffer: u32,
    pub actual_buffer: u32,
    pub errors: u64,
    pub analysis_drops: u64,
    pub callback_max_us: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub version: u32,
    pub revision: u64,
    pub epoch: u64,
    pub sample: u64,
    pub controls: Controls,
    pub view: View,
    pub wavetable: Vec<f32>,
    pub partials: Vec<f32>,
    pub voices: Vec<VoiceObservation>,
    pub acknowledgements: Vec<Ack>,
    pub device: DeviceStatus,
    pub asset: Option<u64>,
    pub playback_seconds: f64,
    pub duration_seconds: f64,
    pub playing: bool,
    pub panic: bool,
    pub overloads: u64,
    pub analysis: Option<AnalysisFrame>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Field {
    pub evidence: [f32; 12],
    pub group_weights: [f32; 12],
    pub compatibility: [f32; 12],
    pub confidence: f32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SpectrumPoint {
    pub hz: f32,
    pub power: f32,
    pub cents: f32,
    pub resolution_hz: f32,
    pub age_samples: u32,
    pub confidence: f32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ModeCandidate {
    pub group: u8,
    pub root: u8,
    pub mode: u8,
    pub intervals: [u8; 7],
    pub weight: f32,
    pub persistence: f32,
    pub fifth: f32,
    pub bass: f32,
    pub arrivals: f32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CadenceState {
    pub tension: f32,
    pub direction: f32,
    pub destination: Option<u8>,
    pub settling: f32,
    pub events: Vec<CadenceEvent>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CadenceEvent {
    pub sample: u64,
    pub root: u8,
    pub peak: f32,
    pub arrival: f32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Contribution {
    /// logical / measured / projected / processing. Never interchangeable.
    pub layer: String,
    pub source: u64,
    pub client: Option<u64>,
    pub hz: f32,
    pub target_hz: f32,
    pub energy: f32,
    pub sample: u64,
    pub end_sample: u64,
    pub ratio: f32,
    pub cents: f32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct WavePoint {
    pub start: u64,
    pub end: u64,
    pub min: [f32; 2],
    pub max: [f32; 2],
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct AnalysisFrame {
    pub model_version: u32,
    pub epoch: u64,
    pub start: u64,
    pub end: u64,
    pub age_samples: [u32; 3],
    pub gap: bool,
    pub spectrum: Vec<SpectrumPoint>,
    pub logical: Field,
    pub measured: Field,
    /// Index = octave * 12 + pitch class, MIDI 0..143, no edge clamping.
    pub cells: Vec<f32>,
    pub logical_modes: Vec<ModeCandidate>,
    pub measured_modes: Vec<ModeCandidate>,
    pub logical_cadence: CadenceState,
    pub measured_cadence: CadenceState,
    pub waveform: Vec<WavePoint>,
    pub recent_pcm: Vec<[f32; 2]>,
    #[serde(skip)]
    pub stream_history: std::sync::Arc<StreamHistory>,
    pub contributions: Vec<Contribution>,
    pub rms: f32,
}
