//! Source landscape is asset-time preview, not actual output or performed-note evidence.
mod overview;
use super::{spatial, waterfall};
use crate::{
    contracts::*,
    native_input::timeline::Timeline,
    visualizer::mesh::{Mesh, INK},
};
pub use overview::draw as hud;

pub fn draw(mesh: &mut Mesh, state: &Snapshot, timeline: &Timeline) {
    let Some(song) = &state.song else {
        return;
    };
    if !state.view.measured || song.asset != state.asset.unwrap_or(0) {
        return;
    }
    let (start, end) = timeline.range(state);
    let count = end.saturating_sub(start).div_ceil(song.hop.max(1)) as usize;
    let visible = count.min(HISTORY_ROWS);
    let first = start / song.hop.max(1);
    for i in 0..visible {
        let index = i * count.saturating_sub(1) / visible.saturating_sub(1).max(1);
        let sample = ((first + index as u64 + 1) * song.hop).min(song.frames);
        if let Some(row) = song.row(sample) {
            ridge(mesh, state, timeline, row, i % 12 == 0);
        }
    }
    playline(mesh, state, timeline);
}
fn ridge(mesh: &mut Mesh, state: &Snapshot, timeline: &Timeline, row: &SongRow, fill: bool) {
    let z = depth(row.spectrum.sample, state, timeline);
    if !(spatial::SHORE_Z - 9.0..=spatial::SHORE_Z + 9.0).contains(&z) {
        return;
    }
    let future = row.spectrum.sample > state.playback_frame;
    let color = if future {
        [0.40, 0.55, 0.68, 0.28]
    } else {
        [0.40, 0.72, 0.74, 0.46]
    };
    let position = |p: &HistoryBand| {
        [
            spatial::spectrum_x(p.hz, state.device.sample_rate),
            spatial::BASE_Y + spatial::height(p.power),
            z,
        ]
    };
    for pair in row.spectrum.bands.windows(2) {
        let [a, b] = [position(&pair[0]), position(&pair[1])];
        mesh.stroke(a, b, if future { 1.0 } else { 1.2 }, color);
        if fill {
            mesh.quad(
                [a, b, [b[0], spatial::BASE_Y, z], [a[0], spatial::BASE_Y, z]],
                [color[0], color[1], color[2], 0.025],
            );
        }
    }
}
pub fn depth(frame: u64, state: &Snapshot, timeline: &Timeline) -> f32 {
    if timeline.fit {
        let total = (state.duration_seconds * state.device.sample_rate as f64).max(1.0);
        return spatial::SHORE_Z + 9.0 - frame as f32 / total as f32 * 18.0;
    }
    let center = if timeline.inspecting() {
        timeline.cursor(state)
    } else {
        timeline.center
    };
    let span = (timeline.seconds * state.device.sample_rate as f32).max(1.0);
    spatial::SHORE_Z + (center as f64 - frame as f64) as f32 / span * 18.0
}
fn playline(mesh: &mut Mesh, state: &Snapshot, timeline: &Timeline) {
    let z = depth(state.playback_frame, state, timeline);
    if (spatial::SHORE_Z - 9.0..=spatial::SHORE_Z + 9.0).contains(&z) {
        mesh.stroke(
            [-7.4, spatial::BASE_Y, z],
            [7.4, spatial::BASE_Y, z],
            2.1,
            INK,
        );
    }
    let start = mesh.vertices.len();
    mesh.text(
        "SOURCE SONG / PRE GAIN",
        -7.4,
        spatial::BASE_Y + 0.3,
        0.035,
        INK,
    );
    mesh.map_since(start, |[x, y, _]| {
        [x, y, spatial::SHORE_Z - waterfall::DEPTH]
    });
}

#[cfg(test)]
mod tests;
