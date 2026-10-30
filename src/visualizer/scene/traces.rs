use super::{
    super::mesh::{compatibility, Mesh, CYAN, INK, MUTED},
    spectrum_x,
};
use crate::contracts::{AnalysisFrame, CadenceState, Snapshot};

pub fn spectrum(mesh: &mut Mesh, state: &Snapshot, frame: &AnalysisFrame) {
    if !state.view.measured {
        return;
    }
    let mut previous = None;
    for point in &frame.spectrum {
        let x = spectrum_x(point.hz, state.device.sample_rate);
        let y = super::spatial::BASE_Y + super::spatial::height(point.power);
        let top = [x, y, super::spatial::SHORE_Z];
        let pc = super::pitch(point.hz).map(|(pc, _)| pc);
        let color = pc
            .map(|pc| compatibility(frame.measured.compatibility[pc], frame.measured.confidence))
            .unwrap_or(MUTED);
        if let Some(prior) = previous {
            mesh.stroke(prior, top, 1.8, color);
        }
        let mut fill = color;
        fill[3] = 0.15;
        mesh.line(
            [x, super::spatial::BASE_Y, super::spatial::SHORE_Z],
            top,
            0.012,
            fill,
        );
        previous = Some(top);
    }
}

pub fn cadence(mesh: &mut Mesh, state: &Snapshot, frame: &AnalysisFrame) {
    if !state.view.cadence {
        return;
    }
    cadence_trace(mesh, state, &frame.logical_cadence, -4.60, CYAN, "LOGICAL");
    cadence_trace(mesh, state, &frame.measured_cadence, -5.03, INK, "SPECTRAL");
}

fn cadence_trace(
    mesh: &mut Mesh,
    state: &Snapshot,
    cadence: &CadenceState,
    y: f32,
    color: [f32; 4],
    label: &str,
) {
    mesh.text(label, -8.4, y + 0.08, 0.028, color);
    mesh.rect(-6.45, y - 0.06, 2.8, 0.10, 0.0, [0.06, 0.09, 0.10, 1.0]);
    mesh.rect(
        -6.45,
        y - 0.06,
        2.8 * cadence.tension,
        0.10,
        0.01,
        compatibility(1.0 - cadence.tension, 1.0),
    );
    let direction = if cadence.direction > 0.01 {
        "> RISING"
    } else if cadence.direction < -0.01 {
        "< FALLING"
    } else {
        "= STEADY"
    };
    mesh.text(direction, -3.4, y + 0.08, 0.024, MUTED);
    for event in cadence.events.iter().rev().take(32) {
        let age = state.sample.saturating_sub(event.sample) as f32
            / state.device.sample_rate.max(1) as f32;
        if age > 30.0 {
            continue;
        }
        mesh.ring(
            8.1 - age / 30.0 * 8.4,
            y,
            0.05 + event.peak * 0.06,
            0.1,
            color,
        );
    }
    if cadence.settling > 0.0 {
        mesh.text("SETTLING", 0.0, y + 0.08, 0.024, color);
    }
}
