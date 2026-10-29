//! Wavetable Synthesis and Dynamic Table Editing
//!
//! Provides interpolated wavetable storage, real-time waveform morphing,
//! freehand drawing upload, and algorithmic table generators.

use std::f32::consts::PI;

pub const DEFAULT_TABLE_SIZE: usize = 2048;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Wavetable {
    pub name: String,
    pub samples: Vec<f32>,
}

impl Wavetable {
    pub fn new_with_size(name: &str, size: usize) -> Self {
        let mut wt = Self {
            name: name.to_string(),
            samples: vec![0.0; size],
        };
        wt.generate_sine();
        wt
    }

    pub fn new(name: &str) -> Self {
        Self::new_with_size(name, DEFAULT_TABLE_SIZE)
    }

    pub fn size(&self) -> usize {
        self.samples.len()
    }

    pub fn set_samples(&mut self, new_samples: Vec<f32>) {
        if new_samples.is_empty() {
            return;
        }
        let size = self.samples.len();
        if new_samples.len() == size {
            self.samples = new_samples;
        } else {
            // Resample to current table size via linear interpolation
            let src_len = new_samples.len() as f32;
            let mut resampled = Vec::with_capacity(size);
            for i in 0..size {
                let pos = (i as f32 / size as f32) * src_len;
                let idx0 = pos.floor() as usize % new_samples.len();
                let idx1 = (idx0 + 1) % new_samples.len();
                let frac = pos - pos.floor();
                let s = new_samples[idx0] * (1.0 - frac) + new_samples[idx1] * frac;
                resampled.push(s);
            }
            self.samples = resampled;
        }
        self.normalize();
    }

    pub fn normalize(&mut self) {
        let mut max_val = 0.0f32;
        for &s in &self.samples {
            let abs = s.abs();
            if abs > max_val {
                max_val = abs;
            }
        }
        if max_val > 0.0001 {
            let inv = 1.0 / max_val;
            for s in &mut self.samples {
                *s *= inv;
            }
        }
    }

    pub fn generate_sine(&mut self) {
        let n = self.samples.len();
        for i in 0..n {
            let phase = 2.0 * PI * (i as f32 / n as f32);
            self.samples[i] = phase.sin();
        }
        self.name = "Sine".to_string();
    }

    pub fn generate_triangle(&mut self) {
        let n = self.samples.len();
        for i in 0..n {
            let t = i as f32 / n as f32;
            self.samples[i] = 2.0 * (2.0 * (t - (t + 0.5).floor()).abs()) - 1.0;
        }
        self.name = "Triangle".to_string();
    }

    pub fn generate_sawtooth(&mut self) {
        let n = self.samples.len();
        for i in 0..n {
            let t = i as f32 / n as f32;
            self.samples[i] = 2.0 * (t - (t + 0.5).floor());
        }
        self.name = "Sawtooth".to_string();
    }

    pub fn generate_square(&mut self, duty: f32) {
        let n = self.samples.len();
        let threshold = duty.clamp(0.01, 0.99);
        for i in 0..n {
            let t = i as f32 / n as f32;
            self.samples[i] = if t < threshold { 1.0 } else { -1.0 };
        }
        self.name = "Square".to_string();
    }

    pub fn generate_harmonics(&mut self, harmonics: &[f32]) {
        let n = self.samples.len();
        for s in &mut self.samples {
            *s = 0.0;
        }
        for (h, &amp) in harmonics.iter().enumerate() {
            if amp.abs() < 0.0001 {
                continue;
            }
            let harmonic_num = (h + 1) as f32;
            for i in 0..n {
                let phase = 2.0 * PI * harmonic_num * (i as f32 / n as f32);
                self.samples[i] += amp * phase.sin();
            }
        }
        self.normalize();
        self.name = "Harmonics".to_string();
    }

    /// Read sample with linear interpolation for normalized phase [0.0, 1.0)
    #[inline]
    pub fn read_interpolated(&self, phase: f32) -> f32 {
        let n = self.samples.len();
        let wrapped_phase = phase.fract();
        let positive_phase = if wrapped_phase < 0.0 { wrapped_phase + 1.0 } else { wrapped_phase };
        let index_f = positive_phase * n as f32;
        let index0 = index_f.floor() as usize % n;
        let index1 = (index0 + 1) % n;
        let frac = index_f - index_f.floor();

        self.samples[index0] * (1.0 - frac) + self.samples[index1] * frac
    }
}

#[derive(Clone, Debug)]
pub struct WavetableOscillator {
    sample_rate: f32,
    pub frequency: f32,
    pub phase: f32,
}

impl WavetableOscillator {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate,
            frequency: 440.0,
            phase: 0.0,
        }
    }

    pub fn set_frequency(&mut self, freq: f32) {
        self.frequency = freq.max(0.1);
    }

    pub fn set_sample_rate(&mut self, sample_rate: f32) {
        self.sample_rate = sample_rate.max(1.0);
    }

    #[inline]
    pub fn next_sample(&mut self, table: &Wavetable) -> f32 {
        let sample = table.read_interpolated(self.phase);
        let phase_increment = self.frequency / self.sample_rate;
        self.phase = (self.phase + phase_increment).fract();
        sample
    }
}
