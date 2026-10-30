use crate::{
    contracts::Snapshot,
    native_input::timeline::Timeline,
    visualizer::mesh::{Mesh, CYAN, INK, MUTED},
};

pub fn draw(mesh: &mut Mesh, state: &Snapshot, timeline: &Timeline, width: f32) {
    if state.asset.is_none() {
        return;
    }
    buttons(mesh, state, timeline);
    let length = width - 36.0;
    mesh.rect(18.0, 112.0, length, 36.0, 0.0, [0.025, 0.05, 0.06, 1.0]);
    if let Some(song) = &state.song {
        waveform(mesh, song, length);
        coverage(mesh, song, width);
    }
    let duration = (state.duration_seconds * state.device.sample_rate as f64).max(1.0);
    let x = |frame| 18.0 + frame as f64 as f32 / duration as f32 * length;
    let (start, end) = timeline.range(state);
    mesh.outline(x(start), 112.0, x(end) - x(start), 36.0, 0.8, MUTED);
    mesh.rect(x(state.playback_frame), 111.0, 1.5, 38.0, 0.0, INK);
    if timeline.inspecting() {
        mesh.rect(x(timeline.cursor(state)), 110.0, 2.0, 40.0, 0.0, CYAN);
    }
    mesh.text(
        &format!(
            "{} / {}  SOURCE PREVIEW - DRAG TO SEEK",
            time(timeline.cursor(state), state.device.sample_rate),
            time(duration as u64, state.device.sample_rate)
        ),
        392.0,
        168.0,
        1.05,
        MUTED,
    );
}
fn waveform(mesh: &mut Mesh, song: &crate::contracts::SongIndex, length: f32) {
    let total = song.frames.max(1) as f32;
    for p in song.overview.iter() {
        let x = 18.0 + p.start as f32 / total * length;
        let w = ((p.end - p.start) as f32 / total * length).max(0.5);
        for (c, color) in [[0.20, 0.50, 0.55, 0.8], [0.44, 0.57, 0.62, 0.8]]
            .into_iter()
            .enumerate()
        {
            let base = 121.0 + c as f32 * 18.0;
            mesh.rect(
                x,
                base + p.min[c] * 7.0,
                w,
                ((p.max[c] - p.min[c]) * 7.0).max(0.6),
                0.0,
                color,
            );
        }
    }
}

fn buttons(mesh: &mut Mesh, state: &Snapshot, timeline: &Timeline) {
    for (x, w, label, active) in [
        (
            18.0,
            76.0,
            if state.playing { "PAUSE" } else { "PLAY" },
            state.playing,
        ),
        (100.0, 88.0, "FIT SONG", timeline.fit),
        (194.0, 88.0, "FOLLOW", timeline.follow),
        (288.0, 42.0, "-", false),
        (336.0, 42.0, "+", false),
    ] {
        mesh.rect(
            x,
            154.0,
            w,
            23.0,
            0.0,
            if active {
                [0.06, 0.19, 0.20, 1.0]
            } else {
                [0.03, 0.07, 0.09, 1.0]
            },
        );
        mesh.text(label, x + 8.0, 170.0, 1.15, if active { CYAN } else { INK });
    }
}
fn coverage(mesh: &mut Mesh, song: &crate::contracts::SongIndex, width: f32) {
    let length = width - 36.0;
    let tiles = song.tiles.len().max(1) as f32;
    for (i, tile) in song.tiles.iter().enumerate() {
        if tile.is_some() {
            mesh.rect(
                18.0 + i as f32 / tiles * length,
                112.0,
                length / tiles,
                2.0,
                0.0,
                CYAN,
            );
        }
    }
    mesh.text(
        &format!(
            "INDEX {:.0}% / WHITE PLAYHEAD / CYAN DRAFT / SPACE PLAY-PAUSE",
            song.coverage() * 100.0
        ),
        18.0,
        187.0,
        1.0,
        MUTED,
    );
}
pub fn time(frame: u64, rate: u32) -> String {
    let seconds = frame / rate.max(1) as u64;
    format!("{:02}:{:02}", seconds / 60, seconds % 60)
}
