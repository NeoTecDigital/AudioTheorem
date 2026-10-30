use crate::{
    audio::asset::Asset,
    contracts::{WavePoint, SONG_OVERVIEW_POINTS},
};

/// Exact stereo min/max, including final partial bin. Cancellation checked per bounded chunk.
pub fn overview(asset: &Asset, cancelled: impl Fn() -> bool) -> Option<Vec<WavePoint>> {
    let stride = asset.frames.len().div_ceil(SONG_OVERVIEW_POINTS).max(1);
    let mut result = Vec::with_capacity(SONG_OVERVIEW_POINTS);
    for (i, chunk) in asset.frames.chunks(stride).enumerate() {
        if cancelled() {
            return None;
        }
        let mut p = WavePoint {
            start: (i * stride) as u64,
            end: (i * stride + chunk.len()) as u64,
            min: chunk[0],
            max: chunk[0],
        };
        for sample in chunk {
            p.min = std::array::from_fn(|c| p.min[c].min(sample[c]));
            p.max = std::array::from_fn(|c| p.max[c].max(sample[c]));
        }
        result.push(p);
    }
    Some(result)
}
