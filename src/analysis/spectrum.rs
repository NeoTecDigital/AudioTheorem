use super::{config, history::PcmHistory, theory};
use crate::contracts::SpectrumPoint;
use rustfft::{num_complex::Complex32, Fft, FftPlanner};
use std::sync::Arc;

struct Window {
    size: usize,
    fft: Arc<dyn Fft<f32>>,
    scratch: Vec<Complex32>,
    buffer: Vec<Complex32>,
    hann: Vec<f32>,
    power: Vec<f32>,
    end: u64,
    valid: bool,
    normalization: f32,
}

impl Window {
    fn new(size: usize, planner: &mut FftPlanner<f32>) -> Self {
        let fft = planner.plan_fft_forward(size);
        let hann: Vec<_> = (0..size)
            .map(|i| 0.5 - 0.5 * (std::f32::consts::TAU * i as f32 / size as f32).cos())
            .collect();
        let normalization = 1.0 / (size as f32 * hann.iter().map(|v| v * v).sum::<f32>());
        Self {
            scratch: vec![Complex32::default(); fft.get_inplace_scratch_len()],
            fft,
            buffer: vec![Complex32::default(); size],
            power: vec![0.0; size / 2 + 1],
            size,
            hann,
            end: 0,
            valid: false,
            normalization,
        }
    }

    fn compute(&mut self, pcm: &PcmHistory) {
        self.power.fill(0.0);
        for channel in 0..2 {
            self.transform_channel(pcm, channel);
        }
        self.power[0] *= 0.5;
        self.power[self.size / 2] *= 0.5;
        self.end = pcm.end;
        self.valid = true;
    }

    fn transform_channel(&mut self, pcm: &PcmHistory, channel: usize) {
        for i in 0..self.size {
            self.buffer[i] =
                Complex32::new(pcm.back(self.size - 1 - i)[channel] * self.hann[i], 0.0);
        }
        self.fft
            .process_with_scratch(&mut self.buffer, &mut self.scratch);
        for (i, power) in self.power.iter_mut().enumerate() {
            *power += self.buffer[i].norm_sqr() * self.normalization;
        }
    }

    fn peak_offset(&self, bin: usize) -> f32 {
        if bin == 0 || bin + 1 >= self.power.len() {
            return 0.0;
        }
        let [a, b, c] = [self.power[bin - 1], self.power[bin], self.power[bin + 1]];
        if b <= a || b <= c || b < config::SILENCE_POWER {
            return 0.0;
        }
        let [a, b, c] = [a.max(1e-30).ln(), b.ln(), c.max(1e-30).ln()];
        let denominator = a - 2.0 * b + c;
        if denominator.abs() < 1e-12 {
            return 0.0;
        }
        (0.5 * (a - c) / denominator).clamp(-0.5, 0.5)
    }
}

pub struct Spectrum {
    windows: [Window; 3],
    rate: f32,
}

impl Spectrum {
    pub fn new(rate: u32) -> Self {
        let mut planner = FftPlanner::new();
        Self {
            windows: config::WINDOWS.map(|n| Window::new(n, &mut planner)),
            rate: rate as f32,
        }
    }

    pub fn clear(&mut self) {
        for window in &mut self.windows {
            window.valid = false;
            window.end = 0;
        }
    }

    pub fn update(&mut self, pcm: &PcmHistory) {
        for (i, window) in self.windows.iter_mut().enumerate() {
            if pcm.len() >= window.size
                && (!window.valid || pcm.end - window.end >= config::FFT_HOPS[i])
            {
                window.compute(pcm);
            }
        }
    }

    pub fn points(&self, end: u64) -> Vec<SpectrumPoint> {
        let mut result = Vec::with_capacity(2048);
        for (resolution, window) in self.windows.iter().enumerate() {
            if window.valid {
                self.append_points(resolution, window, end, &mut result);
            }
        }
        result.sort_by(|a, b| a.hz.total_cmp(&b.hz));
        result
    }

    fn append_points(&self, index: usize, w: &Window, end: u64, points: &mut Vec<SpectrumPoint>) {
        let width = self.rate / w.size as f32;
        for bin in 0..w.power.len() {
            let center = bin as f32 * width;
            let weight = self.weight(index, center);
            if weight <= 0.0 {
                continue;
            }
            let hz = (bin as f32 + w.peak_offset(bin)) * width;
            let cents = theory::pitch(hz).map_or(0.0, |(_, cents)| cents);
            points.push(SpectrumPoint {
                hz,
                power: w.power[bin] * weight,
                cents,
                resolution_hz: width,
                age_samples: age(w, end),
                confidence: (hz * 0.059_463_095 / (2.0 * width)).clamp(0.0, 1.0),
            });
        }
    }

    fn weight(&self, index: usize, hz: f32) -> f32 {
        let weights = region_weights(hz);
        let total: f32 = (0..3)
            .filter(|i| self.windows[*i].valid)
            .map(|i| weights[i])
            .sum();
        if total > 0.0 {
            return weights[index] / total;
        }
        // During warmup, the finest currently available resolution owns this region.
        let finest = self.windows.iter().rposition(|w| w.valid);
        if finest == Some(index) {
            1.0
        } else {
            0.0
        }
    }

    pub fn ages(&self, end: u64) -> [u32; 3] {
        self.windows
            .each_ref()
            .map(|w| if w.valid { age(w, end) } else { u32::MAX })
    }
}

fn age(w: &Window, end: u64) -> u32 {
    (end.saturating_sub(w.end) + w.size as u64 / 2).min(u32::MAX as u64) as u32
}

/// Partition of unity: FFT overlap is not additional measured energy.
fn region_weights(hz: f32) -> [f32; 3] {
    let low = 1.0
        - ((hz - config::LOW_CROSSOVER[0]) / (config::LOW_CROSSOVER[1] - config::LOW_CROSSOVER[0]))
            .clamp(0.0, 1.0);
    let high = ((hz - config::HIGH_CROSSOVER[0])
        / (config::HIGH_CROSSOVER[1] - config::HIGH_CROSSOVER[0]))
        .clamp(0.0, 1.0);
    [high, (1.0 - low - high).max(0.0), low]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn region_weights_form_partition_of_unity() {
        for hz in 0..24_001 {
            assert!((region_weights(hz as f32).iter().sum::<f32>() - 1.0).abs() < 1e-6);
        }
    }

    #[test]
    fn stereo_antiphase_survives_and_power_is_not_tripled() {
        let rate = 48_000;
        let mut pcm = PcmHistory::new(rate);
        let data: Vec<_> = (0..32768)
            .map(|i| {
                let x = (std::f32::consts::TAU * 440.0 * i as f32 / rate as f32).sin();
                [x, -x]
            })
            .collect();
        pcm.push(0, &data);
        let mut spectrum = Spectrum::new(rate);
        spectrum.update(&pcm);
        let points = spectrum.points(pcm.end);
        let total: f32 = points.iter().map(|p| p.power).sum();
        assert!((total - 0.5).abs() < 0.01, "power {total}");
        let peak = points
            .iter()
            .max_by(|a, b| a.power.total_cmp(&b.power))
            .unwrap();
        assert!((peak.hz - 440.0).abs() < 0.5, "peak {}", peak.hz);
        assert_eq!(spectrum.ages(pcm.end), [1024, 4096, 16384]);
    }

    #[test]
    fn low_frequency_confidence_does_not_claim_sub_window_precision() {
        let mut pcm = PcmHistory::new(48_000);
        let data: Vec<_> = (0..32768)
            .map(|i| {
                let x = (std::f32::consts::TAU * 4.0 * i as f32 / 48_000.0).sin();
                [x, x]
            })
            .collect();
        pcm.push(0, &data);
        let mut spectrum = Spectrum::new(48_000);
        spectrum.update(&pcm);
        let points = spectrum.points(pcm.end);
        let peak = points
            .iter()
            .max_by(|a, b| a.power.total_cmp(&b.power))
            .unwrap();
        assert!(peak.hz < 8.0);
        assert!(peak.confidence < 0.1);
        assert!(peak.age_samples >= 16384);
        assert!((peak.resolution_hz - 48_000.0 / 32768.0).abs() < 1e-6);
    }

    #[test]
    fn crossover_tones_conserve_power_across_resolutions() {
        let mut pcm = PcmHistory::new(48_000);
        let mut spectrum = Spectrum::new(48_000);
        for hz in [100.0, 180.0, 250.0, 320.0, 1600.0, 2000.0, 2400.0, 22000.0] {
            let data: Vec<_> = (0..32768)
                .map(|i| {
                    let x = (std::f32::consts::TAU * hz * i as f32 / 48_000.0).sin();
                    [x, x]
                })
                .collect();
            pcm.clear();
            spectrum.clear();
            pcm.push(0, &data);
            spectrum.update(&pcm);
            let power: f32 = spectrum.points(pcm.end).iter().map(|p| p.power).sum();
            assert!((power - 0.5).abs() < 0.01, "frequency {hz}, power {power}");
        }
    }
}
