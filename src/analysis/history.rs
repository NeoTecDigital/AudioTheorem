mod stream;
mod view;

use super::config;
use crate::contracts::{AnalysisFrame, WavePoint};
use std::collections::VecDeque;

pub struct PcmHistory {
    samples: Vec<[f32; 2]>,
    write: usize,
    len: usize,
    pub end: u64,
    summaries: VecDeque<WavePoint>,
    pending: Option<WavePoint>,
}

impl PcmHistory {
    pub fn new(rate: u32) -> Self {
        let capacity = rate as usize * config::HISTORY_SECONDS;
        Self {
            samples: vec![[0.0; 2]; capacity],
            write: 0,
            len: 0,
            end: 0,
            summaries: VecDeque::with_capacity(capacity / 256 + 2),
            pending: None,
        }
    }

    pub fn clear(&mut self) {
        self.write = 0;
        self.len = 0;
        self.end = 0;
        self.summaries.clear();
        self.pending = None;
    }

    pub fn push(&mut self, start: u64, pcm: &[[f32; 2]]) {
        for (i, &sample) in pcm.iter().enumerate() {
            let sample = sample.map(|v| if v.is_finite() { v } else { 0.0 });
            self.samples[self.write] = sample;
            self.write = (self.write + 1) % self.samples.len();
            self.len = (self.len + 1).min(self.samples.len());
            self.extend_summary(start + i as u64, sample);
        }
        self.end = start + pcm.len() as u64;
        let oldest = self.end.saturating_sub(self.samples.len() as u64);
        while self.summaries.front().is_some_and(|s| s.start < oldest) {
            self.summaries.pop_front();
        }
    }

    fn extend_summary(&mut self, time: u64, sample: [f32; 2]) {
        let point = self.pending.get_or_insert(WavePoint {
            start: time,
            end: time,
            min: sample,
            max: sample,
        });
        point.end = time + 1;
        point.min = std::array::from_fn(|c| point.min[c].min(sample[c]));
        point.max = std::array::from_fn(|c| point.max[c].max(sample[c]));
        if point.end - point.start == 256 {
            self.summaries.push_back(self.pending.take().unwrap());
        }
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn back(&self, ago: usize) -> [f32; 2] {
        if ago >= self.len {
            return [0.0; 2];
        }
        self.samples[(self.write + self.samples.len() - 1 - ago) % self.samples.len()]
    }

    pub fn recent(&self, count: usize) -> Vec<[f32; 2]> {
        (0..count.min(self.len))
            .rev()
            .map(|i| self.back(i))
            .collect()
    }

    pub fn rms(&self, count: usize) -> f32 {
        let count = count.min(self.len);
        let sum: f32 = (0..count)
            .map(|i| {
                let [l, r] = self.back(i);
                (l * l + r * r) * 0.5
            })
            .sum();
        (sum / count.max(1) as f32).sqrt()
    }

    #[cfg(test)]
    pub fn waveform(&self, maximum: usize) -> Vec<WavePoint> {
        self.waveform_view(maximum, self.len, 0)
    }
}

fn merge(bucket: &mut Option<WavePoint>, point: &WavePoint) {
    let merged = bucket.get_or_insert_with(|| point.clone());
    merged.end = point.end;
    merged.min = std::array::from_fn(|c| merged.min[c].min(point.min[c]));
    merged.max = std::array::from_fn(|c| merged.max[c].max(point.max[c]));
}

/// Compact historical evidence: no repeated 30-second waveform snapshots.
#[allow(dead_code)]
pub struct AnalysisRecord {
    pub sample: u64,
    pub age_samples: [u32; 3],
    pub confidence: f32,
    pub logical: [f32; 12],
    pub measured: [f32; 12],
    pub compatibility: [[f32; 12]; 2],
    pub tension: [f32; 2],
    pub spectrum: Box<[(f32, f32)]>,
}

pub struct AnalysisHistory {
    records: VecDeque<AnalysisRecord>,
    duration: u64,
}

impl AnalysisHistory {
    pub fn new(rate: u32) -> Self {
        Self {
            records: VecDeque::with_capacity(2048),
            duration: rate as u64 * 30,
        }
    }

    pub fn clear(&mut self) {
        self.records.clear();
    }

    pub fn push(&mut self, frame: &AnalysisFrame) {
        let oldest = frame.end.saturating_sub(self.duration);
        while self.records.front().is_some_and(|r| r.sample < oldest) {
            self.records.pop_front();
        }
        if self.records.len() == 2048 {
            self.records.pop_front();
        }
        self.records.push_back(AnalysisRecord {
            sample: frame.end,
            age_samples: frame.age_samples,
            confidence: frame.measured.confidence,
            logical: frame.logical.evidence,
            measured: frame.measured.evidence,
            compatibility: [frame.logical.compatibility, frame.measured.compatibility],
            tension: [
                frame.logical_cadence.tension,
                frame.measured_cadence.tension,
            ],
            spectrum: frame.spectrum.iter().map(|p| (p.hz, p.power)).collect(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signed_stereo_history_and_minmax_are_actual_samples() {
        let mut history = PcmHistory::new(100);
        let pcm: Vec<_> = (0..1024).map(|i| [i as f32 / 1024.0 - 0.5, -0.2]).collect();
        history.push(90, &pcm);
        assert_eq!(history.recent(1024), pcm);
        let summaries = history.waveform(4);
        assert_eq!(summaries[0].start, 90);
        assert_eq!(summaries[0].end, 346);
        assert_eq!(summaries[0].min, [-0.5, -0.2]);
        assert_eq!(summaries[0].max, [255.0 / 1024.0 - 0.5, -0.2]);
    }

    #[test]
    fn rings_are_bounded_and_clear_drops_old_epoch() {
        let mut history = PcmHistory::new(100);
        history.push(0, &vec![[1.0, -1.0]; 4000]);
        assert_eq!(history.len(), 3000);
        assert!(history.waveform(512).first().unwrap().start >= 1000);
        history.clear();
        assert!(history.recent(100).is_empty());
        assert!(history.waveform(512).is_empty());
    }

    #[test]
    fn compact_analysis_history_prunes_at_exact_sample_boundary() {
        let mut history = AnalysisHistory::new(48_000);
        for n in 0..1600 {
            let frame = AnalysisFrame {
                end: n * 960,
                ..AnalysisFrame::default()
            };
            history.push(&frame);
        }
        assert_eq!(history.records.len(), 1501);
        assert_eq!(history.records.front().unwrap().sample, (1599 - 1500) * 960);
        history.clear();
        assert!(history.records.is_empty());
    }
}
