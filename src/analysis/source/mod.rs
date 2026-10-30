//! Bounded source indexing, never connected to live cadence/history accumulators.
mod waveform;
use super::{field, history::PcmHistory, spectrum::Spectrum, theory};
use crate::{audio::asset::Asset, contracts::*};
pub use waveform::overview;

pub struct Indexer {
    pcm: PcmHistory,
    spectrum: Spectrum,
    membership: theory::Memberships,
}
impl Indexer {
    pub fn new(rate: u32) -> Self {
        Self {
            pcm: PcmHistory::with_capacity(32768),
            spectrum: Spectrum::new(rate),
            membership: theory::memberships(),
        }
    }
    pub fn row(&mut self, asset: &Asset, end: usize) -> SongRow {
        let start = end.saturating_sub(32768);
        self.pcm.clear();
        self.spectrum.clear();
        self.pcm.push(start as u64, &asset.frames[start..end]);
        self.spectrum.update(&self.pcm);
        let points = self.spectrum.points(end as u64);
        let mut evidence = [0.0; 12];
        for p in &points {
            if let Some(pc) = theory::pitch_class(p.hz) {
                evidence[pc] += p.power;
            }
        }
        let field = field::interpret(evidence, &self.membership);
        let spectrum = SpectrumSlice {
            sample: end as u64,
            age_samples: self.spectrum.ages(end as u64),
            bands: bands(&points, asset.rate),
            compatibility: field.compatibility,
            confidence: field.confidence,
        };
        SongRow { spectrum, field }
    }
}

fn bands(points: &[SpectrumPoint], rate: u32) -> Vec<HistoryBand> {
    let mut bins: [Option<HistoryBand>; HISTORY_BANDS] = std::array::from_fn(|_| None);
    let high = (rate as f32 * 0.5).max(2.0).ln();
    for p in points {
        let index =
            ((p.hz.max(1.0).ln() / high * HISTORY_BANDS as f32) as usize).min(HISTORY_BANDS - 1);
        if bins[index].as_ref().is_none_or(|b| p.power > b.power) {
            bins[index] = Some(HistoryBand {
                hz: p.hz,
                power: p.power,
            });
        }
    }
    bins.into_iter().flatten().collect()
}

#[cfg(test)]
mod tests;
