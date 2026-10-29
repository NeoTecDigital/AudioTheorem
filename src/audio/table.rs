//! Off-thread harmonic projection; each bank contains all 32 band limits.
use std::f32::consts::TAU;

pub const TABLE: usize = 2048;
pub struct Bank {
    levels: Vec<Vec<f32>>,
}

impl Bank {
    pub fn sine() -> Self {
        Self::partials(&[1.0])
    }

    pub fn partials(amplitudes: &[f32]) -> Self {
        let mut sine = [0.0; 32];
        for (i, a) in amplitudes.iter().take(32).enumerate() {
            sine[i] = *a;
        }
        Self::coefficients(sine, [0.0; 32])
    }

    pub fn waveform(samples: &[f32]) -> Self {
        let mut sine = [0.0; 32];
        let mut cosine = [0.0; 32];
        for h in 0..32 {
            for (i, value) in samples.iter().enumerate() {
                let angle = TAU * (h + 1) as f32 * i as f32 / samples.len() as f32;
                sine[h] += value * angle.sin() * 2.0 / samples.len() as f32;
                cosine[h] += value * angle.cos() * 2.0 / samples.len() as f32;
            }
        }
        Self::coefficients(sine, cosine)
    }

    fn coefficients(sine: [f32; 32], cosine: [f32; 32]) -> Self {
        let norm = sine
            .iter()
            .zip(cosine)
            .map(|(s, c)| s.hypot(c))
            .sum::<f32>()
            .max(1.0);
        let mut levels = vec![vec![0.0; TABLE + 1]; 32];
        for h in 0..32 {
            add_partial(&mut levels, h, sine[h] / norm, cosine[h] / norm);
        }
        Self { levels }
    }

    pub fn blend_sample(&self, phase: f64, harmonics: f32) -> f32 {
        if harmonics >= 33.0 {
            return self.sample(phase, 32);
        }
        let harmonics = harmonics.max(2.0);
        let low = (harmonics as usize - 1).clamp(1, 31);
        let base = self.sample(phase, low);
        base + (self.sample(phase, low + 1) - base) * harmonics.fract()
    }

    pub fn sample(&self, phase: f64, partial_limit: usize) -> f32 {
        let table = &self.levels[partial_limit.clamp(1, 32) - 1];
        let pos = phase as f32 * TABLE as f32;
        let i = (pos as usize).min(TABLE - 1);
        table[i] + (table[i + 1] - table[i]) * (pos - i as f32)
    }
}

fn add_partial(levels: &mut [Vec<f32>], h: usize, sine: f32, cosine: f32) {
    for i in 0..=TABLE {
        let angle = TAU * (h + 1) as f32 * i as f32 / TABLE as f32;
        let value = sine * angle.sin() + cosine * angle.cos();
        for level in &mut levels[h..] {
            level[i] += value;
        }
    }
}
