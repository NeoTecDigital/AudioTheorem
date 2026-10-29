//! Polyphonic Voice Management & Synth Voices
//!
//! Uses a 2-pole resonant State-Variable Filter (SVF) with non-linear saturation
//! to prevent divergence, distortion, or NaN propagation.

use super::adsr::{Adsr, AdsrConfig};
use super::wavetable::{Wavetable, WavetableOscillator};

/// Stable 2-Pole Resonant Low-Pass State-Variable Filter (SVF)
#[derive(Clone, Debug)]
pub struct ResonantFilter {
    sample_rate: f32,
    ic1eq: f32,
    ic2eq: f32,
}

impl ResonantFilter {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate,
            ic1eq: 0.0,
            ic2eq: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.ic1eq = 0.0;
        self.ic2eq = 0.0;
    }

    /// Process one sample through the resonant filter
    /// cutoff_hz: 20.0 to 20,000.0 Hz
    /// resonance: 0.0 (unfiltered/flat) to 0.98 (high screaming resonance)
    #[inline]
    pub fn process(&mut self, input: f32, cutoff_hz: f32, resonance: f32) -> f32 {
        if input.is_nan() || input.is_infinite() {
            self.reset();
            return 0.0;
        }

        let cutoff = cutoff_hz.clamp(20.0, self.sample_rate * 0.45);
        let res = resonance.clamp(0.0, 0.98);

        // Normalized frequency coefficient g = tan(pi * fc / fs)
        let w = std::f32::consts::PI * cutoff / self.sample_rate;
        let g = w.tan().clamp(0.001, 10.0);
        let q = 1.0 / (1.0 - res * 0.95);
        let k = 1.0 / q;

        let a1 = 1.0 / (1.0 + g * (g + k));
        let a2 = g * a1;
        let a3 = g * a2;

        let v3 = input - self.ic2eq;
        let v1 = a1 * self.ic1eq + a2 * v3;
        let v2 = self.ic2eq + a2 * self.ic1eq + a3 * v3;

        // Saturate internal states to prevent blowups
        self.ic1eq = (2.0 * v1 - self.ic1eq).clamp(-4.0, 4.0);
        self.ic2eq = (2.0 * v2 - self.ic2eq).clamp(-4.0, 4.0);

        if v2.is_nan() || v2.is_infinite() {
            self.reset();
            return input.clamp(-1.0, 1.0);
        }

        v2.clamp(-1.5, 1.5)
    }
}

#[derive(Clone, Debug)]
pub struct SynthVoice {
    pub note: u8,
    pub velocity: f32,
    pub osc: WavetableOscillator,
    pub adsr: Adsr,
    pub is_active: bool,
    pub age: u64,
    pub filter: ResonantFilter,
    pub note_duration_samples: usize,
    pub elapsed_samples: usize,
}

impl SynthVoice {
    pub fn new(sample_rate: f32, adsr_config: AdsrConfig) -> Self {
        Self {
            note: 0,
            velocity: 0.0,
            osc: WavetableOscillator::new(sample_rate),
            adsr: Adsr::new(sample_rate, adsr_config),
            is_active: false,
            age: 0,
            filter: ResonantFilter::new(sample_rate),
            note_duration_samples: 0,
            elapsed_samples: 0,
        }
    }

    pub fn trigger(&mut self, note: u8, freq: f32, velocity: f32, duration_samples: usize) {
        self.note = note;
        self.velocity = velocity.clamp(0.0, 1.0);
        self.osc.set_frequency(freq);
        self.osc.phase = 0.0;
        self.adsr.gate(true);
        self.is_active = true;
        self.age = 0;
        self.filter.reset();
        self.note_duration_samples = duration_samples;
        self.elapsed_samples = 0;
    }

    pub fn release(&mut self) {
        self.adsr.gate(false);
    }

    pub fn is_held(&self) -> bool {
        self.is_active
            && self.adsr.state() != crate::engine::adsr::EnvelopeState::Release
            && self.adsr.state() != crate::engine::adsr::EnvelopeState::Idle
    }

    pub fn stop(&mut self) {
        self.is_active = false;
        self.adsr.gate(false);
        self.filter.reset();
    }

    #[inline]
    pub fn next_sample(&mut self, table: &Wavetable, filter_cutoff: f32, filter_res: f32) -> f32 {
        if !self.is_active {
            return 0.0;
        }

        self.age += 1;
        self.elapsed_samples += 1;

        // Auto-release after step duration if duration was specified
        if self.note_duration_samples > 0 && self.elapsed_samples >= self.note_duration_samples {
            self.release();
            self.note_duration_samples = 0;
        }

        let raw = self.osc.next_sample(table);
        let env = self.adsr.next_sample();

        if !self.adsr.is_active() {
            self.is_active = false;
            return 0.0;
        }

        let shaped = raw * self.velocity * env;
        let filtered = self.filter.process(shaped, filter_cutoff, filter_res);

        if filtered.is_nan() || filtered.is_infinite() {
            0.0
        } else {
            filtered
        }
    }
}

pub struct PolyphonicSynth {
    pub voices: Vec<SynthVoice>,
    pub adsr_config: AdsrConfig,
    pub filter_cutoff: f32, // Hz
    pub filter_res: f32,    // 0.0 to 0.98
    pub volume: f32,
    sample_rate: f32,
}

impl PolyphonicSynth {
    pub fn new(sample_rate: f32, max_voices: usize) -> Self {
        let adsr_config = AdsrConfig::default();
        let voices = (0..max_voices)
            .map(|_| SynthVoice::new(sample_rate, adsr_config.clone()))
            .collect();

        Self {
            voices,
            adsr_config,
            filter_cutoff: 8000.0,
            filter_res: 0.2,
            volume: 0.7,
            sample_rate,
        }
    }

    pub fn panic(&mut self) {
        for v in &mut self.voices {
            v.stop();
        }
    }

    pub fn note_on(&mut self, note: u8, freq: f32, velocity: f32, duration_samples: usize) {
        // Find existing voice with same note
        for v in &mut self.voices {
            if v.is_active && v.note == note {
                v.trigger(note, freq, velocity, duration_samples);
                return;
            }
        }

        // Find free voice
        for v in &mut self.voices {
            if !v.is_active {
                v.trigger(note, freq, velocity, duration_samples);
                return;
            }
        }

        // Steal oldest active voice
        if let Some(oldest) = self.voices.iter_mut().max_by_key(|v| v.age) {
            oldest.trigger(note, freq, velocity, duration_samples);
        }
    }

    pub fn note_off(&mut self, note: u8) {
        for v in &mut self.voices {
            if v.is_active && v.note == note {
                v.release();
            }
        }
    }

    pub fn active_notes(&self) -> Vec<u8> {
        self.voices.iter().filter(|v| v.is_active).map(|v| v.note).collect()
    }

    pub fn held_notes(&self) -> Vec<u8> {
        self.voices.iter().filter(|v| v.is_held()).map(|v| v.note).collect()
    }

    pub fn set_adsr(&mut self, config: AdsrConfig) {
        self.adsr_config = config.clone();
        for v in &mut self.voices {
            v.adsr.config = config.clone();
        }
    }

    #[inline]
    pub fn next_sample(&mut self, table: &Wavetable) -> f32 {
        let mut mix = 0.0f32;
        let mut active_count = 0;

        for v in &mut self.voices {
            if v.is_active {
                let sample = v.next_sample(table, self.filter_cutoff, self.filter_res);
                mix += sample;
                active_count += 1;
            }
        }

        if active_count > 0 {
            let scaled = mix * (self.volume / (1.0 + 0.15 * active_count as f32));
            scaled.tanh().clamp(-1.0, 1.0)
        } else {
            0.0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filter_resonance_stability() {
        let sample_rate = 44100.0;
        let mut filter = ResonantFilter::new(sample_rate);

        // Sweep resonance from 0.0 to 0.98 with various cutoff frequencies
        for &res in &[0.0, 0.2, 0.5, 0.8, 0.9, 0.95, 0.98] {
            for &cutoff in &[50.0, 200.0, 1000.0, 5000.0, 15000.0, 20000.0] {
                // Test impulse
                let mut out = filter.process(1.0, cutoff, res);
                assert!(!out.is_nan() && !out.is_infinite());
                assert!(out.abs() <= 2.0);

                // Test sustained signal
                for i in 0..1000 {
                    let sig = (i as f32 * 0.1).sin();
                    out = filter.process(sig, cutoff, res);
                    assert!(!out.is_nan() && !out.is_infinite());
                    assert!(out.abs() <= 2.0, "Sample diverged: {}", out);
                }
            }
        }
    }

    #[test]
    fn test_filter_dynamic_resonance_change() {
        let sample_rate = 44100.0;
        let mut filter = ResonantFilter::new(sample_rate);

        let mut res = 0.1f32;
        for i in 0..10000 {
            // Rapidly modulate resonance across full range
            res = (res + 0.01) % 0.98;
            let sig = (i as f32 * 0.05).sin();
            let out = filter.process(sig, 2500.0, res);
            assert!(!out.is_nan() && !out.is_infinite());
            assert!(out.abs() <= 2.0);
        }
    }

    #[test]
    fn test_synth_panic() {
        let sample_rate = 44100.0;
        let mut synth = PolyphonicSynth::new(sample_rate, 8);
        let table = Wavetable::new("sine");

        // Trigger notes
        for note in 60..68 {
            synth.note_on(note, 440.0, 0.8, 0);
        }

        // Render a few samples so attack phase rises and phase advances
        let mut sample = 0.0f32;
        for _ in 0..50 {
            sample += synth.next_sample(&table).abs();
        }
        assert!(sample > 0.0, "Expected non-zero audio output from active synth voices");

        // Panic!
        synth.panic();

        // Must immediately produce silence
        for _ in 0..100 {
            let s = synth.next_sample(&table);
            assert_eq!(s, 0.0);
        }
        for v in &synth.voices {
            assert!(!v.is_active);
        }
    }

    #[test]
    fn test_voice_auto_release() {
        let sample_rate = 44100.0;
        let mut synth = PolyphonicSynth::new(sample_rate, 4);
        let table = Wavetable::new("sine");

        let duration = 200;
        synth.note_on(60, 440.0, 0.8, duration);

        for _ in 0..duration {
            let _ = synth.next_sample(&table);
        }

        // Voice should now be in release phase
        let mut release_steps = 0;
        while synth.voices[0].is_active && release_steps < 44100 {
            synth.next_sample(&table);
            release_steps += 1;
        }

        assert!(!synth.voices[0].is_active, "Voice failed to auto-deactivate after release");
    }
}
