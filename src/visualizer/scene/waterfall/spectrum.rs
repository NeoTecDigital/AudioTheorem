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
    let mini = state.asset.is_some();
    let stride = if mini { 4 } else { 1 };
    let pairs = row
        .bands
        .iter()
        .step_by(stride)
        .zip(row.bands.iter().skip(stride).step_by(stride));
    for (a, b) in pairs {
        let position = |p: &crate::contracts::HistoryBand| {
            [
                if mini {
                    -9.6 + (spatial::spectrum_x(p.hz, state.device.sample_rate) + 7.4) * 0.08
                } else {
                    spatial::spectrum_x(p.hz, state.device.sample_rate)
                },
                spatial::BASE_Y + spatial::height(p.power) * if mini { 0.35 } else { 1.0 },
                z,
            ]
        };
        let mut color = pitch(b.hz)
            .map(|(pc, _)| compatibility(row.compatibility[pc], row.confidence))
            .unwrap_or(MUTED);
        color[3] = (0.65 - age * 0.40).max(0.25);
        mesh.stroke(position(a), position(b), 1.15, color);
    }
}
