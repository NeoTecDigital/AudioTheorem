use super::{DEPTH, PCM_BASE, PCM_STRIDE, PCM_WIDTH, PCM_X};
use crate::contracts::{Snapshot, StreamHistory};
use crate::visualizer::{
    mesh::{Mesh, CYAN, INK, MUTED},
    scene::spatial,
};

pub fn draw(mesh: &mut Mesh, state: &Snapshot, history: &StreamHistory) {
    pcm_labels(mesh, history);
    age_axis(
        mesh,
        state,
        history,
        [
            PCM_X + PCM_STRIDE + PCM_WIDTH + 0.75,
            PCM_BASE,
            spatial::SHORE_Z,
        ],
    );
    let start = mesh.vertices.len();
    mesh.text(
        "02 / SPECTRUM HISTORY / HZ",
        -7.4,
        spatial::BASE_Y - 0.4,
        0.04,
        INK,
    );
    mesh.map_since(start, |[x, y, _]| [x, y, spatial::SHORE_Z + DEPTH]);
}

fn pcm_labels(mesh: &mut Mesh, history: &StreamHistory) {
    let start = mesh.vertices.len();
    mesh.text("L", PCM_X, PCM_BASE + 0.65, 0.026, CYAN);
    mesh.text("R", PCM_X + PCM_STRIDE, PCM_BASE + 0.65, 0.026, INK);
    let title_x = PCM_X + PCM_STRIDE + PCM_WIDTH + 0.75;
    mesh.text("03 / ACTUAL PCM", title_x, PCM_BASE + 1.35, 0.026, INK);
    let raw = history
        .pcm
        .iter()
        .flat_map(|r| &r.points)
        .all(|p| p.end - p.start == 1);
    mesh.text(
        if raw {
            "SIGNED SAMPLES"
        } else {
            "MIN/MAX ENVELOPES"
        },
        title_x,
        PCM_BASE + 1.10,
        0.020,
        MUTED,
    );
    mesh.map_since(start, |[x, y, _]| [x, y, spatial::SHORE_Z]);
}

fn age_axis(mesh: &mut Mesh, state: &Snapshot, history: &StreamHistory, origin: [f32; 3]) {
    let [x, y, z] = origin;
    mesh.line(origin, [x, y, z + DEPTH], 0.012, MUTED);
    for t in [0.0, 0.5, 1.0] {
        let sample = history.end - (t * (history.end - history.start) as f64) as u64;
        let age =
            state.sample.saturating_sub(sample) as f64 / state.device.sample_rate.max(1) as f64;
        let text = if age == 0.0 {
            "NOW".into()
        } else {
            format!("-{age:.3}S")
        };
        let start = mesh.vertices.len();
        mesh.text(&text, x, y + 0.50, 0.024, MUTED);
        mesh.map_since(start, |[x, y, _]| [x, y, z + t as f32 * DEPTH]);
    }
}
