//! Source landscape is asset-time preview, not actual output or performed-note evidence.
mod overview;
use super::{spatial, waterfall};
use crate::{
    contracts::*,
    native_input::timeline::Timeline,
    visualizer::mesh::{Mesh, Vertex, INK},
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
    let mut previous = None;
    for i in 0..visible {
        let index = i * count.saturating_sub(1) / visible.saturating_sub(1).max(1);
        let sample = ((first + index as u64 + 1) * song.hop).min(song.frames);
        let current = song
            .row(sample)
            .and_then(|row| surface_row(mesh, state, timeline, row));
        if let (Some((prior, range)), Some(next)) = (previous.take(), &current) {
            if contiguous(song, prior, sample) {
                mesh.surface.connect(range, next.clone());
            }
        }
        previous = current.map(|range| (sample, range));
    }
    playline(mesh, state, timeline);
}
fn contiguous(song: &SongIndex, a: u64, b: u64) -> bool {
    let first = a.div_ceil(song.hop.max(1)).saturating_sub(1) as usize / SONG_TILE_ROWS;
    let last = b.div_ceil(song.hop.max(1)).saturating_sub(1) as usize / SONG_TILE_ROWS;
    (first..=last).all(|i| song.tiles.get(i).is_some_and(Option::is_some))
}
fn surface_row(
    mesh: &mut Mesh,
    state: &Snapshot,
    timeline: &Timeline,
    row: &SongRow,
) -> Option<std::ops::Range<usize>> {
    let z = depth(row.spectrum.sample, state, timeline);
    if !(spatial::SHORE_Z - 9.0..=spatial::SHORE_Z + 9.0).contains(&z) {
        return None;
    }
    let future = row.spectrum.sample > state.playback_frame;
    mesh.surface.row(row.spectrum.bands.iter().map(|p| {
        let height = spatial::height(p.power);
        let light = 0.28 + (height * 0.38).min(0.72);
        let base = if future {
            [0.28, 0.48, 0.68]
        } else {
            [0.18, 0.74, 0.70]
        };
        Vertex {
            position: [
                spatial::spectrum_x(p.hz, state.device.sample_rate),
                spatial::BASE_Y + height,
                z,
                2.0,
            ],
            color: [base[0] * light, base[1] * light, base[2] * light, 0.94],
        }
    }))
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
