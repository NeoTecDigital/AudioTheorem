//! Off-audio-thread measured/logical analysis. Projections never enter evidence.
mod cadence;
pub mod compass;
pub mod config;
mod contributions;
mod field;
mod history;
mod layer;
mod roots;
pub mod source;
mod spectrum;
#[cfg(test)]
mod tests;
mod theory;

use crate::contracts::{AnalysisFrame, Contribution, PcmBlock, SpectrumPoint};
use history::{AnalysisHistory, PcmHistory};
use layer::Layer;
use spectrum::Spectrum;

pub struct Analyzer {
    rate: u32,
    epoch: Option<u64>,
    expected: Option<u64>,
    published: u64,
    gap: bool,
    pcm: PcmHistory,
    spectrum: Spectrum,
    history: AnalysisHistory,
    logical: Layer,
    measured: Layer,
    membership: theory::Memberships,
    logical_energy: [f32; 12],
    logical_bass: [f32; 12],
    interval: usize,
    links: Vec<Contribution>,
    history_seconds: f32,
    history_offset: f32,
}

impl Analyzer {
    pub fn new(sample_rate: u32) -> Self {
        let rate = sample_rate.max(1);
        Self {
            rate,
            epoch: None,
            expected: None,
            published: 0,
            gap: false,
            pcm: PcmHistory::new(rate),
            spectrum: Spectrum::new(rate),
            history: AnalysisHistory::new(rate),
            logical: Layer::new(rate),
            measured: Layer::new(rate),
            membership: theory::memberships(),
            logical_energy: [0.0; 12],
            logical_bass: [0.0; 12],
            interval: 0,
            links: Vec::new(),
            history_seconds: 30.0,
            history_offset: 0.0,
        }
    }

    /// Select actual recorded PCM; offsets count backwards from the current engine sample.
    pub fn set_history_view(&mut self, seconds: f32, offset: f32) {
        self.history_seconds = if seconds.is_finite() {
            seconds.clamp(0.002, 30.0)
        } else {
            30.0
        };
        self.history_offset = if offset.is_finite() {
            offset.clamp(0.0, 30.0)
        } else {
            0.0
        };
    }

    fn history_waveform(&self) -> Vec<crate::contracts::WavePoint> {
        let frames = (self.history_seconds * self.rate as f32).round() as usize;
        let offset = (self.history_offset * self.rate as f32).round() as usize;
        self.pcm.waveform_view(512, frames, offset)
    }

    pub fn reset(&mut self) {
        self.epoch = None;
        self.expected = None;
        self.published = 0;
        self.gap = true;
        self.pcm.clear();
        self.spectrum.clear();
        self.history.clear();
        self.logical = Layer::new(self.rate);
        self.measured = Layer::new(self.rate);
        self.clear_interval();
    }

    pub fn push(&mut self, block: &PcmBlock) -> Option<AnalysisFrame> {
        if block.len == 0 || block.len > block.pcm.len() {
            return None;
        }
        self.check_continuity(block);
        self.pcm.push(block.start, &block.pcm[..block.len]);
        self.accumulate_logical(block);
        let end = block.start + block.len as u64;
        self.expected = Some(end);
        if end - self.published < config::FFT_HOPS[0].max(self.rate.div_ceil(60) as u64) {
            return None;
        }
        self.spectrum.update(&self.pcm);
        let mut frame = self.frame(block, end);
        self.history.push(&frame);
        frame.stream_history = self
            .history
            .stream(
                &self.pcm,
                block.epoch,
                self.history_seconds,
                self.history_offset,
                self.rate,
            )
            .into();
        self.published = end;
        self.gap = false;
        self.clear_interval();
        Some(frame)
    }

    fn check_continuity(&mut self, block: &PcmBlock) {
        let discontinuous = self.epoch.is_some_and(|e| e != block.epoch)
            || self.expected.is_some_and(|s| s != block.start)
            || block.gap;
        if discontinuous {
            self.reset();
        }
        if self.epoch.is_none() {
            self.epoch = Some(block.epoch);
            self.published = block.start;
        }
    }

    fn clear_interval(&mut self) {
        self.logical_energy.fill(0.0);
        self.logical_bass.fill(0.0);
        self.interval = 0;
        self.links.clear();
    }

    fn accumulate_logical(&mut self, block: &PcmBlock) {
        for voice in &block.voices {
            let Some(pc) = theory::pitch_class(voice.hz) else {
                continue;
            };
            let energy = voice.amplitude.max(0.0).powi(2) * block.len as f32;
            self.logical_energy[pc] += energy;
            if voice.hz < config::BASS_HZ {
                self.logical_bass[pc] += energy;
            }
        }
        self.interval += block.len;
        self.links.extend(contributions::logical(block));
        self.links.truncate(128);
    }

    fn frame(&mut self, block: &PcmBlock, end: u64) -> AnalysisFrame {
        let points = self.spectrum.points(end);
        let (evidence, bass, cells) = measured_evidence(&points);
        let seconds = (end - self.published) as f32 / self.rate as f32;
        let energy = self.logical_energy.map(|v| v / self.interval.max(1) as f32);
        let bass_logical = self.logical_bass.map(|v| v / self.interval.max(1) as f32);
        let (logical, logical_modes, logical_cadence) =
            self.logical
                .analyze(energy, bass_logical, seconds, end, &self.membership, true);
        let (measured, measured_modes, measured_cadence) = self.measured.analyze(
            evidence,
            bass,
            seconds,
            end,
            &self.membership,
            self.pcm.rms(1024).powi(2) > config::SILENCE_POWER,
        );
        let links =
            contributions::finish(std::mem::take(&mut self.links), block, &points, self.rate);
        AnalysisFrame {
            model_version: config::MODEL_VERSION,
            epoch: block.epoch,
            start: self.published,
            end,
            age_samples: self.spectrum.ages(end),
            gap: self.gap,
            spectrum: points,
            logical,
            measured,
            cells,
            logical_modes,
            measured_modes,
            logical_cadence,
            measured_cadence,
            waveform: self.history_waveform(),
            recent_pcm: self.pcm.recent(1024),
            stream_history: Default::default(),
            contributions: links,
            rms: self.pcm.rms(1024),
        }
    }
}

fn measured_evidence(points: &[SpectrumPoint]) -> ([f32; 12], [f32; 12], Vec<f32>) {
    let mut evidence = [0.0; 12];
    let mut bass = [0.0; 12];
    let mut cells = vec![0.0; 144];
    for point in points {
        let Some((midi, _)) = theory::pitch(point.hz) else {
            continue;
        };
        let pc = midi.rem_euclid(12) as usize;
        evidence[pc] += point.power;
        if point.hz < config::BASS_HZ {
            bass[pc] += point.power;
        }
        if (0..144).contains(&midi) {
            cells[midi as usize] += point.power;
        }
    }
    (evidence, bass, cells)
}
