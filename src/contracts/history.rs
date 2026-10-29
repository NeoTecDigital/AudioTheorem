//! Native-only immutable history views. These are not duplicated into browser JSON.
use super::WavePoint;

pub const HISTORY_ROWS: usize = 48;
pub const HISTORY_BANDS: usize = 160;
pub const HISTORY_PCM_POINTS: usize = 3072;

#[derive(Clone, Debug, Default)]
pub struct HistoryBand {
    pub hz: f32,
    pub power: f32,
}

#[derive(Clone, Debug, Default)]
pub struct SpectrumSlice {
    pub sample: u64,
    pub age_samples: [u32; 3],
    pub bands: Vec<HistoryBand>,
    pub compatibility: [f32; 12],
    pub confidence: f32,
}

#[derive(Clone, Debug, Default)]
pub struct PcmSlice {
    pub start: u64,
    pub end: u64,
    pub points: Vec<WavePoint>,
}

#[derive(Clone, Debug, Default)]
pub struct StreamHistory {
    pub epoch: u64,
    pub start: u64,
    pub end: u64,
    pub spectrum: Vec<SpectrumSlice>,
    pub pcm: Vec<PcmSlice>,
}
