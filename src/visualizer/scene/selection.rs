//! Exact selected PCM interval. Positions never clamp unrelated events to an edge.
use crate::contracts::WavePoint;

#[derive(Clone, Copy)]
pub struct Range {
    pub start: u64,
    pub end: u64,
}

impl Range {
    pub fn from_waveform(points: &[WavePoint]) -> Option<Self> {
        let range = Self {
            start: points.first()?.start,
            end: points.last()?.end,
        };
        (range.end > range.start).then_some(range)
    }

    pub fn x(self, sample: u64) -> Option<f32> {
        if !(self.start..self.end).contains(&sample) {
            return None;
        }
        Some(-8.4 + 11.2 * (sample - self.start) as f32 / (self.end - self.start) as f32)
    }

    pub fn interval_x(self, start: u64, end: u64) -> Option<f32> {
        let first = start.max(self.start);
        let last = end.min(self.end);
        if first >= last {
            return None;
        }
        self.x(first + (last - first - 1) / 2)
    }
}

pub fn axis_label(sample: u64, now: u64) -> String {
    if sample == now {
        return "NOW".into();
    }
    format!("SAMPLE {sample}")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selected_range_rejects_offscreen_events_instead_of_clamping() {
        let range = Range {
            start: 1000,
            end: 1200,
        };
        assert!(range.x(999).is_none());
        assert!(range.x(1200).is_none());
        assert!(range.interval_x(800, 1000).is_none());
        assert!(range.interval_x(1200, 1400).is_none());
        assert!(range.interval_x(1100, 1000).is_none());
        assert_eq!(range.interval_x(1000, 1001), Some(-8.4));
        assert_eq!(range.interval_x(1199, 1300), range.x(1199));
    }
    #[test]
    fn scrubbing_axes_show_actual_selected_samples_not_now() {
        assert_eq!(axis_label(1200, 48000), "SAMPLE 1200");
        assert_eq!(axis_label(48000, 48000), "NOW");
        assert_eq!(axis_label(1000, 48000), "SAMPLE 1000");
    }
}
