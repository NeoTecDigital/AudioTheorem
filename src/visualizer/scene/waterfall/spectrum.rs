use super::{fraction, DEPTH};
use crate::contracts::{Snapshot, SpectrumSlice, StreamHistory};
use crate::visualizer::{
    mesh::{compatibility, Mesh, Vertex, MUTED},
    scene::{pitch, spatial},
};

pub fn draw(mesh: &mut Mesh, state: &Snapshot, history: &StreamHistory) {
    let mut previous = None;
    let stride = if state.asset.is_some() { 4 } else { 1 };
    for slice in history.spectrum.iter().step_by(stride) {
        let current = row(mesh, state, history, slice);
        if let (Some(a), Some(b)) = (previous.take(), &current) {
            mesh.surface.connect(a, b.clone());
        }
        previous = current;
    }
}
pub fn row(
    mesh: &mut Mesh,
    state: &Snapshot,
    history: &StreamHistory,
    row: &SpectrumSlice,
) -> Option<std::ops::Range<usize>> {
    let age = fraction(history, row.sample)?;
    let z = spatial::SHORE_Z + age * DEPTH;
    let mini = state.asset.is_some();
    let stride = if mini { 4 } else { 1 };
    mesh.surface.row(row.bands.iter().step_by(stride).map(|p| {
        let x = spatial::spectrum_x(p.hz, state.device.sample_rate);
        let height = spatial::height(p.power);
        let mut color = pitch(p.hz)
            .map(|(pc, _)| compatibility(row.compatibility[pc], row.confidence))
            .unwrap_or(MUTED);
        let light = 0.3 + (height * 0.35).min(0.7);
        for c in &mut color[..3] {
            *c *= light;
        }
        color[3] = 0.94;
        Vertex {
            position: [
                if mini { -9.6 + (x + 7.4) * 0.08 } else { x },
                spatial::BASE_Y + height * if mini { 0.35 } else { 1.0 },
                z,
                2.0,
            ],
            color,
        }
    }))
}
