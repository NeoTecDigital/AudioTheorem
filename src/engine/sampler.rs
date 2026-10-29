//! Sampler & Multi-instrument Sound Generator
//!
//! Provides PCM sample playback with pitch shifting, loop regions,
//! built-in synthesized drum & instrument presets (808 Kick, Snare, Hi-Hat, Sub, Bell).

use std::f32::consts::PI;
use super::adsr::{Adsr, AdsrConfig};

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum LoopMode {
    OneShot,
    Forward,
    PingPong,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct SamplePreset {
    pub name: String,
    pub root_midi: u8,
    pub loop_mode: LoopMode,
    pub loop_start: usize,
    pub loop_end: usize,
    pub pcm: Vec<f32>,
}

impl SamplePreset {
    pub fn new_empty(name: &str, root_midi: u8) -> Self {
        Self {
            name: name.to_string(),
            root_midi,
            loop_mode: LoopMode::OneShot,
            loop_start: 0,
            loop_end: 0,
            pcm: Vec::new(),
        }
    }

    /// Generate an analog-style 808 Kick drum sample
    pub fn generate_808_kick(sample_rate: f32) -> Self {
        let duration = 0.45; // 450 ms
        let len = (duration * sample_rate) as usize;
        let mut pcm = Vec::with_capacity(len);

        for i in 0..len {
            let t = i as f32 / sample_rate;
            // Pitch drops rapidly from 150Hz down to 45Hz
            let _freq = 45.0 + 105.0 * (-t * 30.0).exp();
            let phase = 2.0 * PI * (45.0 * t - (105.0 / 30.0) * (-t * 30.0).exp());
            // Fast attack, exponential decay envelope
            let env = (-t * 6.5).exp();
            // Subtle click transient at the start
            let click = if t < 0.005 { (1.0 - t / 0.005) * 0.4 } else { 0.0 };
            let sample = (phase.sin() * 0.85 + click) * env;
            // Warm saturation
            let saturated = (sample * 1.5).tanh();
            pcm.push(saturated);
        }

        Self {
            name: "808 Kick".to_string(),
            root_midi: 36, // C2
            loop_mode: LoopMode::OneShot,
            loop_start: 0,
            loop_end: len,
            pcm,
        }
    }

    /// Generate an 808/909 style Snare drum sample
    pub fn generate_snare(sample_rate: f32) -> Self {
        let duration = 0.28; // 280 ms
        let len = (duration * sample_rate) as usize;
        let mut pcm = Vec::with_capacity(len);
        let mut seed = 123456789u32;

        for i in 0..len {
            let t = i as f32 / sample_rate;
            // Pseudo-random white noise
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            let noise = ((seed >> 16) as f32 / 32768.0) - 1.0;

            // Tone body (185 Hz tone dropping to 130 Hz)
            let tone_freq = 130.0 + 55.0 * (-t * 25.0).exp();
            let tone = (2.0 * PI * tone_freq * t).sin() * (-t * 15.0).exp() * 0.45;

            // Snare rattle noise envelope
            let noise_env = (-t * 12.0).exp();
            let sample = (noise * 0.55 * noise_env + tone) * (-t * 8.0).exp();
            pcm.push(sample.clamp(-1.0, 1.0));
        }

        Self {
            name: "Snare".to_string(),
            root_midi: 38, // D2
            loop_mode: LoopMode::OneShot,
            loop_start: 0,
            loop_end: len,
            pcm,
        }
    }

    /// Generate a Crisp Metallic Hi-Hat sample
    pub fn generate_hihat(sample_rate: f32, open: bool) -> Self {
        let duration = if open { 0.35 } else { 0.06 };
        let len = (duration * sample_rate) as usize;
        let mut pcm = Vec::with_capacity(len);
        let decay = if open { 10.0 } else { 65.0 };

        // 6 square wave oscillators for authentic 808 metallic cluster
        let freqs = [263.0, 312.0, 421.0, 538.0, 689.0, 843.0];

        for i in 0..len {
            let t = i as f32 / sample_rate;
            let mut metallic = 0.0f32;
            for &f in &freqs {
                metallic += if (2.0 * PI * f * t).sin() > 0.0 { 1.0 } else { -1.0 };
            }
            metallic /= freqs.len() as f32;

            let env = (-t * decay).exp();
            pcm.push(metallic * env * 0.6);
        }

        Self {
            name: if open { "Open Hat".to_string() } else { "Closed Hat".to_string() },
            root_midi: if open { 46 } else { 42 },
            loop_mode: LoopMode::OneShot,
            loop_start: 0,
            loop_end: len,
            pcm,
        }
    }

    /// Generate an FM Harmonic Bell / Pluck sample
    pub fn generate_bell(sample_rate: f32) -> Self {
        let duration = 1.2;
        let len = (duration * sample_rate) as usize;
        let mut pcm = Vec::with_capacity(len);

        let carrier_freq = 440.0;
        let mod_freq = carrier_freq * 3.5; // Inharmonic metallic ratio

        for i in 0..len {
            let t = i as f32 / sample_rate;
            let mod_env = (-t * 4.0).exp() * 4.0;
            let modulator = (2.0 * PI * mod_freq * t).sin() * mod_env;
            let carrier = (2.0 * PI * carrier_freq * t + modulator).sin();
            let amp_env = (-t * 2.2).exp();
            pcm.push(carrier * amp_env * 0.7);
        }

        Self {
            name: "FM Bell".to_string(),
            root_midi: 69, // A4
            loop_mode: LoopMode::Forward,
            loop_start: (0.1 * sample_rate) as usize,
            loop_end: len - 100,
            pcm,
        }
    }
}

#[derive(Clone, Debug)]
pub struct SamplerVoice {
    sample_rate: f32,
    pub preset: SamplePreset,
    pub cursor: f32,
    pub is_active: bool,
    pub playback_rate: f32,
    pub adsr: Adsr,
    pub volume: f32,
    ping_pong_forward: bool,
}

impl SamplerVoice {
    pub fn new(sample_rate: f32, preset: SamplePreset, adsr_config: AdsrConfig) -> Self {
        Self {
            sample_rate,
            preset,
            cursor: 0.0,
            is_active: false,
            playback_rate: 1.0,
            adsr: Adsr::new(sample_rate, adsr_config),
            volume: 0.8,
            ping_pong_forward: true,
        }
    }

    pub fn trigger(&mut self, midi_note: u8, velocity: f32) {
        let root = self.preset.root_midi as f32;
        let pitch_diff = midi_note as f32 - root;
        self.playback_rate = 2.0f32.powf(pitch_diff / 12.0);
        self.cursor = 0.0;
        self.is_active = true;
        self.ping_pong_forward = true;
        self.volume = velocity.clamp(0.0, 1.0);
        self.adsr.gate(true);
    }

    pub fn release(&mut self) {
        self.adsr.gate(false);
    }

    pub fn stop(&mut self) {
        self.is_active = false;
        self.cursor = 0.0;
    }

    #[inline]
    pub fn next_sample(&mut self) -> f32 {
        if !self.is_active || self.preset.pcm.is_empty() {
            return 0.0;
        }

        let pcm_len = self.preset.pcm.len();
        let idx = self.cursor as usize;

        if idx >= pcm_len {
            self.is_active = false;
            return 0.0;
        }

        // Linear interpolation
        let next_idx = (idx + 1).min(pcm_len - 1);
        let frac = self.cursor - idx as f32;
        let sample = self.preset.pcm[idx] * (1.0 - frac) + self.preset.pcm[next_idx] * frac;

        let env_gain = self.adsr.next_sample();
        if !self.adsr.is_active() && self.preset.loop_mode != LoopMode::OneShot {
            self.is_active = false;
        }

        // Advance cursor based on loop mode
        match self.preset.loop_mode {
            LoopMode::OneShot => {
                self.cursor += self.playback_rate;
                if self.cursor >= pcm_len as f32 {
                    self.is_active = false;
                }
            }
            LoopMode::Forward => {
                self.cursor += self.playback_rate;
                let loop_end = if self.preset.loop_end > self.preset.loop_start {
                    self.preset.loop_end.min(pcm_len) as f32
                } else {
                    pcm_len as f32
                };
                let loop_start = self.preset.loop_start.min(pcm_len - 1) as f32;
                if self.cursor >= loop_end {
                    self.cursor = loop_start + (self.cursor - loop_end);
                }
            }
            LoopMode::PingPong => {
                if self.ping_pong_forward {
                    self.cursor += self.playback_rate;
                    let loop_end = self.preset.loop_end.min(pcm_len) as f32;
                    if self.cursor >= loop_end {
                        self.cursor = loop_end;
                        self.ping_pong_forward = false;
                    }
                } else {
                    self.cursor -= self.playback_rate;
                    let loop_start = self.preset.loop_start as f32;
                    if self.cursor <= loop_start {
                        self.cursor = loop_start;
                        self.ping_pong_forward = true;
                    }
                }
            }
        }

        sample * self.volume * env_gain
    }
}
