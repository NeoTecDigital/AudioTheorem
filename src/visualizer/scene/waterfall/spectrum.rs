use super::{fraction, DEPTH};
use crate::contracts::{Snapshot, SpectrumSlice, StreamHistory};
use crate::visualizer::{
    mesh::{compatibility, Mesh, MUTED},
    scene::{pitch, spatial},
};

pub fn row(mesh: &mut Mesh, state: &Snapshot, history: &StreamHistory, row: &SpectrumSlice) {
    let Some(age) = fraction(history, row.sample) else {
        return;
    };
    // The full-resolution live profile already draws this slice.
    if row.sample == history.end && state.view.history_offset == 0.0 {
        return;
    }
    let z = spatial::SHORE_Z + age * DEPTH;
    for pair in row.bands.windows(2) {
        let position = |p: &crate::contracts::HistoryBand| {
            [
                spatial::spectrum_x(p.hz, state.device.sample_rate),
                spatial::BASE_Y + spatial::height(p.power),
                z,
            ]
        };
        let mut color = pitch(pair[1].hz)
            .map(|(pc, _)| compatibility(row.compatibility[pc], row.confidence))
            .unwrap_or(MUTED);
        color[3] = (0.65 - age * 0.40).max(0.25);
        mesh.line(position(&pair[0]), position(&pair[1]), 0.018, color);
    }
}
