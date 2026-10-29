use super::super::mesh::{compatibility, intensity, Mesh, CYAN, MUTED};
use super::matrix_layout;
use crate::contracts::{AnalysisFrame, Snapshot};

pub fn matrix(mesh: &mut Mesh, state: &Snapshot, frame: &AnalysisFrame) {
    let start = mesh.vertices.len();
    for index in 0..144 {
        cell(mesh, state, frame, index);
    }
    if state.view.logical {
        for voice in &state.voices {
            activation(mesh, voice.hz, voice.amplitude);
        }
    }
    if state.view.roots {
        roots(mesh, state, frame);
    }
    mesh.map_since(start, matrix_layout::transform);
}

fn cell(mesh: &mut Mesh, state: &Snapshot, frame: &AnalysisFrame, index: usize) {
    let pc = index % 12;
    let octave = index / 12;
    let [cx, cy, depth] = matrix_layout::local_position(pc, octave);
    let x = cx - 0.27;
    let y = cy - 0.16;
    let power = frame.cells.get(index).copied().unwrap_or(0.0);
    let response = super::emission::response(power);
    let z = depth;
    let measured = compatibility(frame.measured.compatibility[pc], frame.measured.confidence);
    let fill = if state.view.measured {
        intensity(measured, response.level.clamp(0.04, 1.0))
    } else {
        [0.025, 0.04, 0.05, 1.0]
    };
    mesh.rect(x, y, 0.53, 0.31, z, fill);
    let logical = compatibility(frame.logical.compatibility[pc], frame.logical.confidence);
    let border = if state.view.logical {
        intensity(logical, 0.7)
    } else {
        intensity(MUTED, 0.2)
    };
    mesh.border(x, y, 0.53, 0.31, z + 0.01, border);
    if state.view.immersive && power > 1e-6 {
        let mut glow = measured;
        glow[3] = response.level * 0.25;
        mesh.rect(x + 0.05, y + 0.05, 0.43, 0.21, z + 0.02, glow);
    }
}

fn activation(mesh: &mut Mesh, hz: f32, amplitude: f32) {
    if amplitude <= 0.0001 {
        return;
    }
    if let Some([x, y, z]) = matrix_layout::local_frequency(hz) {
        mesh.diamond(x, y, 0.07, z + 0.03, CYAN);
    }
}

fn roots(mesh: &mut Mesh, state: &Snapshot, frame: &AnalysisFrame) {
    if state.view.logical {
        candidate_roots(
            mesh,
            &frame.logical_modes,
            frame.logical.confidence,
            matrix_layout::ROOT_LOGICAL_Y,
            CYAN,
            state.view.immersive,
        );
    }
    if state.view.measured {
        candidate_roots(
            mesh,
            &frame.measured_modes,
            frame.measured.confidence,
            matrix_layout::ROOT_MEASURED_Y,
            MUTED,
            state.view.immersive,
        );
    }
}

fn candidate_roots(
    mesh: &mut Mesh,
    candidates: &[crate::contracts::ModeCandidate],
    confidence: f32,
    y: f32,
    color: [f32; 4],
    _immersive: bool,
) {
    if confidence < 0.02 {
        return;
    }
    let mut weights = [0.0_f32; 12];
    for candidate in candidates {
        weights[candidate.root as usize % 12] += candidate.weight;
    }
    let maximum = weights.iter().copied().fold(0.0_f32, f32::max).max(0.0001);
    for (pc, weight) in weights.into_iter().enumerate() {
        let strength = weight / maximum;
        if strength > 0.1 {
            mesh.ring(
                matrix_layout::local_position(pc, 0)[0],
                y,
                (0.06 + 0.08 * strength) * matrix_layout::MARK_SCALE,
                matrix_layout::OVERLAY_Z,
                intensity(color, strength),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn measured_cell_and_emitter_share_the_same_absolute_power_response() {
        let state = super::super::fixtures::snapshot();
        let mut frame = state.analysis.clone().unwrap();
        let base = compatibility(frame.measured.compatibility[9], frame.measured.confidence);
        for power in [0.0, 1e-4, 0.01, 1.0] {
            frame.cells[69] = power;
            let mut mesh = Mesh::new();
            cell(&mut mesh, &state, &frame, 69);
            let level = super::super::emission::response(power)
                .level
                .clamp(0.04, 1.0);
            assert_eq!(mesh.vertices[0].color, intensity(base, level));
        }
    }
}
