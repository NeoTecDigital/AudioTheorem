//! Real-time Frequency Spectrum Analyzer (DSP)
//!
//! Provides Cooley-Tukey Radix-2 Fast Fourier Transform with Hann windowing,
//! logarithmic frequency band binning (20 Hz - 20 kHz), 144-pitch frequency binning
//! across 12 octaves with cents deviation tracking, temporal decay smoothing,
//! and energy band metrics (bass, mids, treble).

use std::f32::consts::PI;

pub const DEFAULT_FFT_SIZE: usize = 2048;
pub const DEFAULT_SPECTRUM_BINS: usize = 64;
pub const PITCH_144_COUNT: usize = 144;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct SpectrumData {
    pub bins: Vec<f32>,
    pub peaks: Vec<f32>,
    pub pitch_144: Vec<f32>, // 144 pitch energies across 12 octaves
    pub cents_144: Vec<f32>, // 144 cent deviations (-50.0 to +50.0)
    pub bass_energy: f32,
    pub mid_energy: f32,
    pub treble_energy: f32,
    pub rms: f32,
    pub peak_freq: f32,
    pub waveform: Vec<f32>, // 144 PCM streaming wavetable samples
}

pub struct SpectrumAnalyzer {
    fft_size: usize,
    sample_rate: f32,
    band_count: usize,
    sample_buffer: Vec<f32>,
    write_pos: usize,
    window: Vec<f32>,
    re: Vec<f32>,
    im: Vec<f32>,
    smoothed_bands: Vec<f32>,
    peak_bands: Vec<f32>,
    band_indices: Vec<(usize, usize)>,
    pitch_band_indices: Vec<(usize, usize, f32)>, // (start_bin, end_bin, center_freq)
    smoothed_pitch_144: Vec<f32>,
    smoothed_cents_144: Vec<f32>,
    decay_rate: f32,
}

impl SpectrumAnalyzer {
    pub fn new(fft_size: usize, sample_rate: f32, band_count: usize) -> Self {
        assert!(fft_size.is_power_of_two(), "FFT size must be power of two");

        // Precompute Hann window
        let window: Vec<f32> = (0..fft_size)
            .map(|i| 0.5 * (1.0 - (2.0 * PI * i as f32 / (fft_size - 1) as f32).cos()))
            .collect();

        // Calculate logarithmic frequency band boundaries between 20 Hz and 20,000 Hz
        let min_freq = 20.0f32;
        let max_freq = (sample_rate * 0.5).min(20_000.0);
        let bin_width = sample_rate / fft_size as f32;
        let half = fft_size / 2;

        let mut band_indices = Vec::with_capacity(band_count);
        for i in 0..band_count {
            let low_freq = min_freq * (max_freq / min_freq).powf(i as f32 / band_count as f32);
            let high_freq = min_freq * (max_freq / min_freq).powf((i + 1) as f32 / band_count as f32);

            let mut start_bin = (low_freq / bin_width).floor() as usize;
            let mut end_bin = (high_freq / bin_width).ceil() as usize;

            if start_bin >= half {
                start_bin = half.saturating_sub(1);
            }
            if end_bin <= start_bin {
                end_bin = start_bin + 1;
            }
            if end_bin > half {
                end_bin = half;
            }

            band_indices.push((start_bin, end_bin));
        }

        // Precompute 144 pitch band indices and center frequencies (MIDI 0 to 143)
        let mut pitch_band_indices = Vec::with_capacity(PITCH_144_COUNT);
        for m in 0..PITCH_144_COUNT {
            let f_m = 440.0 * 2.0f32.powf((m as f32 - 69.0) / 12.0);
            let f_low = f_m * 2.0f32.powf(-1.0 / 24.0);
            let f_high = f_m * 2.0f32.powf(1.0 / 24.0);

            let mut start_bin = (f_low / bin_width).floor() as usize;
            let mut end_bin = (f_high / bin_width).ceil() as usize;

            if start_bin >= half {
                start_bin = half.saturating_sub(1);
            }
            if end_bin <= start_bin {
                end_bin = start_bin + 1;
            }
            if end_bin > half {
                end_bin = half;
            }

            pitch_band_indices.push((start_bin, end_bin, f_m));
        }

        Self {
            fft_size,
            sample_rate,
            band_count,
            sample_buffer: vec![0.0; fft_size],
            write_pos: 0,
            window,
            re: vec![0.0; fft_size],
            im: vec![0.0; fft_size],
            smoothed_bands: vec![0.0; band_count],
            peak_bands: vec![0.0; band_count],
            band_indices,
            pitch_band_indices,
            smoothed_pitch_144: vec![0.0; PITCH_144_COUNT],
            smoothed_cents_144: vec![0.0; PITCH_144_COUNT],
            decay_rate: 0.88,
        }
    }

    pub fn set_band_count(&mut self, band_count: usize) {
        if band_count == self.band_count || band_count == 0 {
            return;
        }
        *self = Self::new(self.fft_size, self.sample_rate, band_count);
    }

    pub fn set_decay_rate(&mut self, decay: f32) {
        self.decay_rate = decay.clamp(0.5, 0.99);
    }

    /// Feed audio samples into the ring buffer
    pub fn push_samples(&mut self, samples: &[f32]) {
        for &s in samples {
            self.sample_buffer[self.write_pos] = s;
            self.write_pos = (self.write_pos + 1) % self.fft_size;
        }
    }

    /// Compute real-time FFT spectrum from the current buffer
    pub fn compute(&mut self) -> SpectrumData {
        let n = self.fft_size;

        // Extract ordered samples and apply window
        let mut sum_sq = 0.0f32;
        for i in 0..n {
            let idx = (self.write_pos + i) % n;
            let sample = self.sample_buffer[idx];
            sum_sq += sample * sample;
            self.re[i] = sample * self.window[i];
            self.im[i] = 0.0;
        }
        let rms = (sum_sq / n as f32).sqrt();

        // Perform in-place Radix-2 Cooley-Tukey FFT
        fft_radix2(&mut self.re, &mut self.im);

        // Compute magnitude spectrum
        let half = n / 2;
        let mut magnitudes = Vec::with_capacity(half);
        let mut max_mag = 0.0f32;
        let mut max_bin = 0usize;

        let norm_factor = 2.0 / n as f32;
        for i in 0..half {
            let mag = (self.re[i] * self.re[i] + self.im[i] * self.im[i]).sqrt() * norm_factor;
            magnitudes.push(mag);
            if mag > max_mag {
                max_mag = mag;
                max_bin = i;
            }
        }

        let bin_width = self.sample_rate / n as f32;
        let peak_freq = max_bin as f32 * bin_width;

        // Group into logarithmic bands
        let mut raw_bands = vec![0.0f32; self.band_count];
        for (b, &(start, end)) in self.band_indices.iter().enumerate() {
            let mut band_mag = 0.0f32;
            for i in start..end {
                if i < magnitudes.len() {
                    band_mag = band_mag.max(magnitudes[i]);
                }
            }
            // Logarithmic dynamic range curve (dB-like perception)
            let db_mag = (band_mag * 12.0).min(1.0);
            raw_bands[b] = db_mag;
        }

        // Apply temporal decay smoothing & peaks for standard bands
        for b in 0..self.band_count {
            let target = raw_bands[b];
            if target > self.smoothed_bands[b] {
                self.smoothed_bands[b] = target; // Fast attack
            } else {
                self.smoothed_bands[b] = self.smoothed_bands[b] * self.decay_rate + target * (1.0 - self.decay_rate);
            }

            if self.smoothed_bands[b] > self.peak_bands[b] {
                self.peak_bands[b] = self.smoothed_bands[b];
            } else {
                self.peak_bands[b] = (self.peak_bands[b] - 0.015).max(0.0);
            }
        }

        // Compute 144 Pitch Bins & Cent Deviations
        let mut raw_pitch_144 = vec![0.0f32; PITCH_144_COUNT];
        let mut raw_cents_144 = vec![0.0f32; PITCH_144_COUNT];

        for m in 0..PITCH_144_COUNT {
            let (start, end, f_m) = self.pitch_band_indices[m];
            let mut peak_val = 0.0f32;
            let mut peak_k = start;

            for i in start..end {
                if i < magnitudes.len() && magnitudes[i] > peak_val {
                    peak_val = magnitudes[i];
                    peak_k = i;
                }
            }

            let db_mag = (peak_val * 14.0).min(1.0);
            raw_pitch_144[m] = db_mag;

            // Parabolic interpolation for cents deviation around detected peak
            if peak_val > 0.001 && peak_k > 0 && peak_k + 1 < magnitudes.len() {
                let m_left = magnitudes[peak_k - 1];
                let m_mid = peak_val;
                let m_right = magnitudes[peak_k + 1];

                let denom = m_left - 2.0 * m_mid + m_right;
                let p = if denom.abs() > 1e-6 {
                    0.5 * (m_left - m_right) / denom
                } else {
                    0.0
                };

                let f_peak = (peak_k as f32 + p) * bin_width;
                if f_peak > 1.0 && f_m > 1.0 {
                    let cents = 1200.0 * (f_peak / f_m).log2();
                    raw_cents_144[m] = cents.clamp(-50.0, 50.0);
                }
            }
        }

        // Smooth 144 pitches with fast attack and ballistic decay
        for m in 0..PITCH_144_COUNT {
            let target_p = raw_pitch_144[m];
            if target_p > self.smoothed_pitch_144[m] {
                self.smoothed_pitch_144[m] = target_p;
            } else {
                self.smoothed_pitch_144[m] = self.smoothed_pitch_144[m] * self.decay_rate + target_p * (1.0 - self.decay_rate);
            }

            // Smooth cents
            self.smoothed_cents_144[m] = self.smoothed_cents_144[m] * 0.70 + raw_cents_144[m] * 0.30;
        }

        // Compute energy bands: Bass (20-250 Hz), Mids (250-4000 Hz), Treble (4000-20000 Hz)
        let mut bass_sum = 0.0f32;
        let mut bass_count = 0;
        let mut mid_sum = 0.0f32;
        let mut mid_count = 0;
        let mut treble_sum = 0.0f32;
        let mut treble_count = 0;

        for (b, &(start, _)) in self.band_indices.iter().enumerate() {
            let freq = start as f32 * bin_width;
            let val = self.smoothed_bands[b];
            if freq < 250.0 {
                bass_sum += val;
                bass_count += 1;
            } else if freq < 4000.0 {
                mid_sum += val;
                mid_count += 1;
            } else {
                treble_sum += val;
                treble_count += 1;
            }
        }

        let bass_energy = if bass_count > 0 { (bass_sum / bass_count as f32).min(1.0) } else { 0.0 };
        let mid_energy = if mid_count > 0 { (mid_sum / mid_count as f32).min(1.0) } else { 0.0 };
        let treble_energy = if treble_count > 0 { (treble_sum / treble_count as f32).min(1.0) } else { 0.0 };

        // Extract ordered 144 PCM streaming wavetable samples from the sample buffer
        let mut waveform = Vec::with_capacity(PITCH_144_COUNT);
        let step = (n / PITCH_144_COUNT).max(1);
        for i in 0..PITCH_144_COUNT {
            let idx = (self.write_pos + i * step) % n;
            waveform.push(self.sample_buffer[idx]);
        }

        SpectrumData {
            bins: self.smoothed_bands.clone(),
            peaks: self.peak_bands.clone(),
            pitch_144: self.smoothed_pitch_144.clone(),
            cents_144: self.smoothed_cents_144.clone(),
            bass_energy,
            mid_energy,
            treble_energy,
            rms,
            peak_freq,
            waveform,
        }
    }
}

/// In-place radix-2 Cooley-Tukey FFT
fn fft_radix2(re: &mut [f32], im: &mut [f32]) {
    let n = re.len();
    assert!(n.is_power_of_two());

    // Bit-reversal permutation
    let mut j = 0;
    for i in 0..n {
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
    }

    // Butterfly stages
    let mut len = 2;
    while len <= n {
        let half_len = len / 2;
        let angle = -2.0 * PI / len as f32;
        let w_step_re = angle.cos();
        let w_step_im = angle.sin();

        let mut i = 0;
        while i < n {
            let mut w_re = 1.0f32;
            let mut w_im = 0.0f32;

            for k in 0..half_len {
                let u_idx = i + k;
                let v_idx = i + k + half_len;

                let u_re = re[u_idx];
                let u_im = im[u_idx];

                let v_re = re[v_idx];
                let v_im = im[v_idx];

                // v * w
                let t_re = v_re * w_re - v_im * w_im;
                let t_im = v_re * w_im + v_im * w_re;

                re[u_idx] = u_re + t_re;
                im[u_idx] = u_im + t_im;
                re[v_idx] = u_re - t_re;
                im[v_idx] = u_im - t_im;

                let next_w_re = w_re * w_step_re - w_im * w_step_im;
                let next_w_im = w_re * w_step_im + w_im * w_step_re;
                w_re = next_w_re;
                w_im = next_w_im;
            }
            i += len;
        }
        len <<= 1;
    }
}
