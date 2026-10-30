//! Sample-clocked, engine-recorded waterfall rows, never copies of the current profile.
mod labels;
mod pcm;
mod spectrum;
use super::spatial;
use crate::contracts::{AnalysisFrame, PcmSlice, Snapshot, StreamHistory};
use crate::visualizer::mesh::Mesh;

pub const DEPTH: f32 = 9.0;
// Compact stereo lanes beyond the spectrum's right edge; both histories share an age axis.
pub const PCM_X: f32 = 8.25;
pub const PCM_BASE: f32 = spatial::BASE_Y;
pub const PCM_WIDTH: f32 = 0.95;
pub const PCM_STRIDE: f32 = 1.20;
pub const PCM_AMPLITUDE: f32 = 0.30;

pub fn fraction(history: &StreamHistory, sample: u64) -> Option<f32> {
    if history.start >= history.end || sample < history.start || sample > history.end {
        return None;
    }
    Some((history.end - sample) as f32 / (history.end - history.start) as f32)
}

pub fn pcm_point(row: &PcmSlice, sample: u64, channel: usize, value: f32, z: f32) -> [f32; 3] {
    let t = (sample.saturating_sub(row.start)) as f32 / (row.end - row.start).max(1) as f32;
    [
        PCM_X + channel as f32 * PCM_STRIDE + t * PCM_WIDTH,
        PCM_BASE + value * PCM_AMPLITUDE,
        z,
    ]
}

pub fn temporal_anchor(history: &StreamHistory, start: u64, end: u64) -> Option<[f32; 3]> {
    let first = start.max(history.start);
    let last = end.min(history.end);
    if first >= last {
        return None;
    }
    let sample = first + (last - first - 1) / 2;
    let row = history
        .pcm
        .iter()
        .find(|r| sample >= r.start && sample < r.end)?;
    let z = spatial::SHORE_Z + fraction(history, row.end)? * DEPTH;
    Some(pcm_point(row, sample, 0, 0.0, z))
}

pub fn draw(mesh: &mut Mesh, state: &Snapshot, frame: &AnalysisFrame) {
    if !state.view.measured {
        return;
    }
    let history = &frame.stream_history;
    if history.epoch != frame.epoch || history.start >= history.end {
        return;
    }
    labels::draw(mesh, state, history);
    let stride = if state.asset.is_some() { 4 } else { 1 };
    for row in history.spectrum.iter().step_by(stride) {
        spectrum::row(mesh, state, history, row);
    }
    for row in &history.pcm {
        pcm::row(mesh, history, row);
    }
}

#[cfg(test)]
mod tests;
