//! Bounded native view of authoritative history, independent of renderer frame cadence.
use super::{AnalysisHistory, AnalysisRecord, PcmHistory};
use crate::contracts::{
    HistoryBand, PcmSlice, SpectrumSlice, StreamHistory, HISTORY_BANDS, HISTORY_PCM_POINTS,
    HISTORY_ROWS,
};

impl AnalysisHistory {
    pub fn stream(
        &self,
        pcm: &PcmHistory,
        epoch: u64,
        seconds: f32,
        offset: f32,
        rate: u32,
    ) -> StreamHistory {
        let end = pcm
            .end
            .saturating_sub((offset * rate as f32).round() as u64);
        let start = end
            .saturating_sub((seconds * rate as f32).round() as u64)
            .max(pcm.end.saturating_sub(pcm.len as u64));
        if start >= end {
            return StreamHistory {
                epoch,
                ..Default::default()
            };
        }
        let records: Vec<_> = self
            .records
            .iter()
            .filter(|r| r.sample >= start && r.sample <= end)
            .collect();
        let count = records.len().min(HISTORY_ROWS);
        let spectrum = (0..count)
            .map(|index| {
                let selected = if count < 2 {
                    0
                } else {
                    index * (records.len() - 1) / (count - 1)
                };
                spectral_slice(records[selected], rate)
            })
            .collect();
        StreamHistory {
            epoch,
            start,
            end,
            spectrum,
            pcm: pcm.stream_rows(start, end),
        }
    }
}

impl PcmHistory {
    fn stream_rows(&self, start: u64, end: u64) -> Vec<PcmSlice> {
        let points = self.sample_bins(start, end, HISTORY_PCM_POINTS);
        let stride = points.len().div_ceil(48).max(64);
        points
            .chunks(stride)
            .map(|chunk| PcmSlice {
                start: chunk[0].start,
                end: chunk.last().unwrap().end,
                points: chunk.to_vec(),
            })
            .collect()
    }
}

fn spectral_slice(record: &AnalysisRecord, rate: u32) -> SpectrumSlice {
    // Peak-preserving log buckets are drawing summaries, not sums or new measured energy.
    let mut buckets: [Option<HistoryBand>; HISTORY_BANDS] = std::array::from_fn(|_| None);
    let high = (rate as f32 * 0.5).max(2.0).ln();
    for &(hz, power) in &record.spectrum {
        let index =
            ((hz.max(1.0).ln() / high * HISTORY_BANDS as f32) as usize).min(HISTORY_BANDS - 1);
        if buckets[index].as_ref().is_none_or(|b| power > b.power) {
            buckets[index] = Some(HistoryBand { hz, power });
        }
    }
    SpectrumSlice {
        sample: record.sample,
        age_samples: record.age_samples,
        bands: buckets.into_iter().flatten().collect(),
        compatibility: record.compatibility[1],
        confidence: record.confidence,
    }
}

#[cfg(test)]
mod tests;
