pub mod adsr;
pub mod audio_output;
pub mod sampler;
pub mod sequencer;
pub mod voice;
pub mod wavetable;

#[allow(unused_imports)]
pub use adsr::{Adsr, AdsrConfig};
#[allow(unused_imports)]
pub use sampler::{LoopMode, SamplePreset, SamplerVoice};
#[allow(unused_imports)]
pub use sequencer::{Sequencer, SequencerStep, SequencerTrack, TransportState};
pub use voice::PolyphonicSynth;
#[allow(unused_imports)]
pub use wavetable::{Wavetable, WavetableOscillator};

use crate::dsp::spectrum::{SpectrumAnalyzer, SpectrumData, DEFAULT_FFT_SIZE, DEFAULT_SPECTRUM_BINS, PITCH_144_COUNT};
use crate::theory::{midi_to_freq, HarmonicAnalysis, HarmonicAnalyzer, ScaleType};

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct EngineState {
    pub wavetable_name: String,
    pub wavetable_samples: Vec<f32>,
    pub synth_adsr: AdsrConfig,
    pub filter_cutoff: f32,
    pub filter_res: f32,
    pub synth_volume: f32,
    pub transport: TransportState,
    pub tracks: Vec<SequencerTrack>,
    pub active_scale: ScaleType,
    pub scale_root: u8,
}

pub struct MusicEngine {
    pub sample_rate: f32,
    pub wavetable: Wavetable,
    pub synth: PolyphonicSynth,
    pub samplers: Vec<SamplerVoice>,
    pub sequencer: Sequencer,
    pub spectrum: SpectrumAnalyzer,
    pub harmonic_analyzer: HarmonicAnalyzer,
    pub master_volume: f32,
    pub active_scale: ScaleType,
    pub scale_root: u8,
    pub latest_spectrum: SpectrumData,
    pub latest_harmonics: HarmonicAnalysis,
}

impl MusicEngine {
    pub fn new(sample_rate: f32) -> Self {
        let wavetable = Wavetable::new("Sine");
        let synth = PolyphonicSynth::new(sample_rate, 16);

        let samplers = vec![
            SamplerVoice::new(sample_rate, SamplePreset::new_empty("Synth", 60), AdsrConfig::default()),
            SamplerVoice::new(sample_rate, SamplePreset::new_empty("Sub Bass", 36), AdsrConfig { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.2 }),
            SamplerVoice::new(sample_rate, SamplePreset::generate_808_kick(sample_rate), AdsrConfig { attack: 0.001, decay: 0.35, sustain: 0.0, release: 0.05 }),
            SamplerVoice::new(sample_rate, SamplePreset::generate_snare(sample_rate), AdsrConfig { attack: 0.001, decay: 0.22, sustain: 0.0, release: 0.05 }),
            SamplerVoice::new(sample_rate, SamplePreset::generate_hihat(sample_rate, false), AdsrConfig { attack: 0.001, decay: 0.06, sustain: 0.0, release: 0.03 }),
            SamplerVoice::new(sample_rate, SamplePreset::generate_bell(sample_rate), AdsrConfig { attack: 0.01, decay: 0.6, sustain: 0.2, release: 0.3 }),
        ];

        let sequencer = Sequencer::new(sample_rate, 16);
        let spectrum = SpectrumAnalyzer::new(DEFAULT_FFT_SIZE, sample_rate, DEFAULT_SPECTRUM_BINS);
        let harmonic_analyzer = HarmonicAnalyzer::new();

        let initial_spectrum = SpectrumData {
            bins: vec![0.0; DEFAULT_SPECTRUM_BINS],
            peaks: vec![0.0; DEFAULT_SPECTRUM_BINS],
            pitch_144: vec![0.0; PITCH_144_COUNT],
            cents_144: vec![0.0; PITCH_144_COUNT],
            bass_energy: 0.0,
            mid_energy: 0.0,
            treble_energy: 0.0,
            rms: 0.0,
            peak_freq: 0.0,
            waveform: vec![0.0; PITCH_144_COUNT],
        };

        let initial_harmonics = HarmonicAnalysis::default();

        Self {
            sample_rate,
            wavetable,
            synth,
            samplers,
            sequencer,
            spectrum,
            harmonic_analyzer,
            master_volume: 0.8,
            active_scale: ScaleType::Chromatic, // Pure chromatic by default: every key plays its true distinct pitch
            scale_root: 0,
            latest_spectrum: initial_spectrum,
            latest_harmonics: initial_harmonics,
        }
    }

    /// Panic: immediately cut off all voices, clear oscillators and filters
    pub fn panic(&mut self) {
        self.synth.panic();
        for s in &mut self.samplers {
            s.stop();
        }
    }

    pub fn note_on(&mut self, track_id: usize, raw_note: u8, velocity: f32, duration_samples: usize) {
        let note = if self.active_scale == ScaleType::Chromatic {
            raw_note
        } else {
            self.active_scale.quantize(raw_note, self.scale_root)
        };
        let freq = midi_to_freq(note);

        match track_id {
            0 => {
                // Main wavetable synth
                self.synth.note_on(note, freq, velocity, duration_samples);
            }
            1 => {
                // Sub bass synth
                self.synth.note_on(note, freq * 0.5, velocity * 1.1, duration_samples);
            }
            sampler_idx if sampler_idx < self.samplers.len() => {
                self.samplers[sampler_idx].trigger(note, velocity);
            }
            _ => {
                self.synth.note_on(note, freq, velocity, duration_samples);
            }
        }
    }

    pub fn note_off(&mut self, track_id: usize, raw_note: u8) {
        let note = if self.active_scale == ScaleType::Chromatic {
            raw_note
        } else {
            self.active_scale.quantize(raw_note, self.scale_root)
        };
        match track_id {
            0 | 1 => self.synth.note_off(note),
            sampler_idx if sampler_idx < self.samplers.len() => {
                self.samplers[sampler_idx].release();
            }
            _ => self.synth.note_off(note),
        }
    }

    pub fn set_wavetable_samples(&mut self, samples: Vec<f32>) {
        self.wavetable.set_samples(samples);
        self.wavetable.name = "Custom".to_string();
    }

    pub fn set_wavetable_preset(&mut self, preset: &str) {
        match preset.to_lowercase().as_str() {
            "sine" => self.wavetable.generate_sine(),
            "triangle" => self.wavetable.generate_triangle(),
            "sawtooth" | "saw" => self.wavetable.generate_sawtooth(),
            "square" => self.wavetable.generate_square(0.5),
            "pulse" => self.wavetable.generate_square(0.25),
            "organ" => self.wavetable.generate_harmonics(&[1.0, 0.5, 0.8, 0.2, 0.4, 0.1, 0.2, 0.05]),
            "bell" => self.wavetable.generate_harmonics(&[1.0, 0.2, 0.6, 0.1, 0.3, 0.05, 0.1, 0.02]),
            _ => self.wavetable.generate_sine(),
        }
    }

    pub fn set_harmonics(&mut self, harmonics: &[f32]) {
        self.wavetable.generate_harmonics(harmonics);
    }

    /// Render a block of audio samples
    pub fn render_block(&mut self, output: &mut [f32]) {
        let len = output.len();

        // Advance sequencer clock
        if let Some(triggered_notes) = self.sequencer.advance(len) {
            let step_duration = (self.sequencer.samples_per_step * 0.75) as usize;
            for (track_id, note, vel) in triggered_notes {
                self.note_on(track_id, note, vel, step_duration);
            }
        }

        // Generate audio block sample-by-sample
        for s in output.iter_mut() {
            let mut mix = 0.0f32;

            // Wavetable synth voices
            mix += self.synth.next_sample(&self.wavetable);

            // Sampler voices (drums, sub bass, bells)
            for sampler in &mut self.samplers {
                if sampler.is_active {
                    mix += sampler.next_sample();
                }
            }

            let clamped = (mix * self.master_volume).clamp(-1.0, 1.0);
            *s = if clamped.is_nan() || clamped.is_infinite() { 0.0 } else { clamped };
        }

        // Push samples to FFT spectrum analyzer
        self.spectrum.push_samples(output);
        self.latest_spectrum = self.spectrum.compute();

        // Perform Harmonic Analysis across 144 pitches and 12x12 pitch matrix
        let active = self.active_midi_notes();
        self.latest_harmonics = self.harmonic_analyzer.analyze(
            &active,
            &self.latest_spectrum.pitch_144,
            &self.latest_spectrum.cents_144,
        );
    }

    pub fn active_midi_notes(&self) -> Vec<u8> {
        let held = self.synth.held_notes();
        if !held.is_empty() {
            return held;
        }
        let mut notes = self.synth.active_notes();
        for s in &self.samplers {
            if s.is_active {
                notes.push(s.preset.root_midi);
            }
        }
        notes
    }

    pub fn get_state(&self) -> EngineState {
        EngineState {
            wavetable_name: self.wavetable.name.clone(),
            wavetable_samples: self.wavetable.samples.clone(),
            synth_adsr: self.synth.adsr_config.clone(),
            filter_cutoff: self.synth.filter_cutoff,
            filter_res: self.synth.filter_res,
            synth_volume: self.synth.volume,
            transport: self.sequencer.transport_state(),
            tracks: self.sequencer.tracks.clone(),
            active_scale: self.active_scale,
            scale_root: self.scale_root,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_engine_render_block_and_spectrum() {
        let mut engine = MusicEngine::new(44100.0);
        let mut buffer = vec![0.0f32; 512];

        // Trigger note C4 on synth
        engine.note_on(0, 60, 0.8, 0);

        for _ in 0..10 {
            engine.render_block(&mut buffer);
            for &s in buffer.iter() {
                assert!(!s.is_nan() && !s.is_infinite());
                assert!(s.abs() <= 1.0);
            }
        }

        // Spectrum analysis should have captured the signal
        assert_eq!(engine.latest_spectrum.bins.len(), 64);
        assert!(engine.latest_spectrum.rms > 0.0);

        // Panic test
        engine.panic();
        engine.render_block(&mut buffer);
        for &s in buffer.iter() {
            assert_eq!(s, 0.0, "Engine did not silence immediately on panic");
        }
    }

    #[test]
    fn test_engine_drum_samplers() {
        let mut engine = MusicEngine::new(44100.0);
        let mut buffer = vec![0.0f32; 512];

        // Trigger Kick (track 2), Snare (track 3), Hi-Hat (track 4)
        engine.note_on(2, 36, 0.9, 0);
        engine.note_on(3, 38, 0.9, 0);
        engine.note_on(4, 42, 0.9, 0);

        engine.render_block(&mut buffer);

        let energy: f32 = buffer.iter().map(|s| s.abs()).sum();
        assert!(energy > 0.0, "Drums should produce audio");

        engine.panic();
        engine.render_block(&mut buffer);
        let energy_after: f32 = buffer.iter().map(|s| s.abs()).sum();
        assert_eq!(energy_after, 0.0, "Drums should cut immediately on panic");
    }
}
