//! Exact interval selection; use cached 256-frame extrema for wide views.
use super::{merge, PcmHistory};
use crate::contracts::WavePoint;

impl PcmHistory {
    pub fn waveform_view(&self, maximum: usize, frames: usize, offset: usize) -> Vec<WavePoint> {
        let maximum = maximum.clamp(1, 512);
        let end = self.end.saturating_sub(offset as u64);
        let oldest = self.end.saturating_sub(self.len as u64);
        let start = end.saturating_sub(frames as u64).max(oldest);
        if start >= end || frames == 0 {
            return Vec::new();
        }
        if end - start <= (maximum * 256) as u64 {
            return self.sample_bins(start, end, maximum);
        }
        coalesce(self.summary_pieces(start, end), maximum)
    }

    pub(super) fn sample_bins(&self, start: u64, end: u64, maximum: usize) -> Vec<WavePoint> {
        let stride = (end - start).div_ceil(maximum as u64);
        (start..end)
            .step_by(stride as usize)
            .map(|from| self.cached_summary(from, (from + stride).min(end)))
            .collect()
    }

    fn cached_summary(&self, start: u64, end: u64) -> WavePoint {
        let index = self.summaries.partition_point(|point| point.start < start);
        let mut cursor = start;
        let mut result = None;
        for point in self.summaries.iter().skip(index) {
            if point.end > end {
                break;
            }
            if cursor < point.start {
                merge(&mut result, &self.sample_summary(cursor, point.start));
            }
            merge(&mut result, point);
            cursor = point.end;
        }
        if cursor < end {
            merge(&mut result, &self.sample_summary(cursor, end));
        }
        result.expect("nonempty PCM range")
    }

    fn sample_summary(&self, start: u64, end: u64) -> WavePoint {
        let first = self.back((self.end - 1 - start) as usize);
        let mut point = WavePoint {
            start,
            end,
            min: first,
            max: first,
        };
        for time in start + 1..end {
            let sample = self.back((self.end - 1 - time) as usize);
            point.min = std::array::from_fn(|c| point.min[c].min(sample[c]));
            point.max = std::array::from_fn(|c| point.max[c].max(sample[c]));
        }
        point
    }

    pub(super) fn summary_pieces(&self, start: u64, end: u64) -> Vec<WavePoint> {
        let mut result = Vec::with_capacity(self.summaries.len() + 2);
        let mut cursor = start;
        for summary in self.summaries.iter().chain(self.pending.iter()) {
            if summary.end <= start || summary.start >= end {
                continue;
            }
            let from = summary.start.max(start);
            let to = summary.end.min(end);
            if cursor < from {
                result.push(self.sample_summary(cursor, from));
            }
            let exact = summary.start == from && summary.end == to;
            result.push(if exact {
                summary.clone()
            } else {
                self.sample_summary(from, to)
            });
            cursor = to;
        }
        if cursor < end {
            result.push(self.sample_summary(cursor, end));
        }
        result
    }
}

pub(super) fn coalesce(pieces: Vec<WavePoint>, maximum: usize) -> Vec<WavePoint> {
    let stride = pieces.len().div_ceil(maximum).max(1);
    pieces
        .chunks(stride)
        .map(|chunk| {
            let mut bucket = None;
            chunk.iter().for_each(|point| merge(&mut bucket, point));
            bucket.unwrap()
        })
        .collect()
}

#[cfg(test)]
mod tests;
