//! Labels attached to data axes stay in the world; status lives in the screen HUD.
use super::{
    super::mesh::{Mesh, CYAN, INK, MUTED, PROJECTED},
    matrix_layout, spatial,
};
use crate::contracts::{AnalysisFrame, ModeCandidate, Snapshot};

pub const PITCH: [&str; 12] = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];
pub const MODES: [&str; 7] = [
    "IONIAN",
    "DORIAN",
    "PHRYGIAN",
    "LYDIAN",
    "MIXOLYDIAN",
    "AEOLIAN",
    "LOCRIAN",
];

pub fn world(mesh: &mut Mesh, state: &Snapshot) {
    let start = mesh.vertices.len();
    mesh.text("01 / PITCHCLASS X OCTAVE", -3.6, 5.14, 0.023, INK);
    for (pc, name) in PITCH.iter().enumerate() {
        mesh.text(name, -3.32 + pc as f32 * 0.58, 0.3, 0.027, MUTED);
    }
    for octave in 0..12 {
        mesh.text(
            &(octave - 1).to_string(),
            -3.9,
            0.79 + octave as f32 * 0.36,
            0.025,
            MUTED,
        );
    }
    mesh.map_since(start, |[x, y, _]| {
        matrix_layout::transform([x, y, spatial::WALL_Z])
    });
    spectral_axes(mesh, state.device.sample_rate);
}

fn spectral_axes(mesh: &mut Mesh, rate: u32) {
    let z = spatial::SHORE_Z;
    mesh.line(
        [-7.4, spatial::BASE_Y, z],
        [7.4, spatial::BASE_Y, z],
        0.012,
        MUTED,
    );
    for hz in [1, 20, 100, 440, 1000, 5000, 20000] {
        let x = super::spectrum_x(hz as f32, rate);
        let start = mesh.vertices.len();
        mesh.text(&hz.to_string(), x - 0.1, -1.93, 0.025, MUTED);
        mesh.map_since(start, |[x, y, _]| [x, y, z]);
        mesh.line([x, -1.6, z], [x, -1.73, z], 0.015, MUTED);
    }
    // Sparse depth rails make the wall-to-spectrum relationship legible in silence.
    for x in [-7.4, 0.0, 7.4] {
        mesh.line(
            [x, -2.5, spatial::WALL_Z],
            [x, -2.5, 4.5],
            0.008,
            [0.12, 0.22, 0.25, 0.35],
        );
    }
}

pub fn analysis(mesh: &mut Mesh, state: &Snapshot, frame: &AnalysisFrame) {
    if state.view.modes {
        mode_geometry(
            mesh,
            &frame.logical_modes,
            frame.logical.confidence,
            matrix_layout::ROOT_LOGICAL_Y,
            CYAN,
        );
        mode_geometry(
            mesh,
            &frame.measured_modes,
            frame.measured.confidence,
            matrix_layout::ROOT_MEASURED_Y,
            INK,
        );
    }
    if state.view.pythagorean {
        for voice in state.voices.iter().filter(|v| v.amplitude > 0.001).take(4) {
            fifth(mesh, state, voice.hz);
        }
    }
}

fn mode_geometry(
    mesh: &mut Mesh,
    candidates: &[ModeCandidate],
    confidence: f32,
    y: f32,
    color: [f32; 4],
) {
    if confidence < 0.02 {
        return;
    }
    let start = mesh.vertices.len();
    for candidate in candidates.iter().take(2) {
        let x = matrix_layout::local_position(candidate.root as usize % 12, 0)[0];
        let points: Vec<_> = candidate
            .intervals
            .iter()
            .map(|interval| {
                let angle = *interval as f32 / 12.0 * std::f32::consts::TAU;
                [
                    x + angle.cos() * 0.17 * matrix_layout::MARK_SCALE,
                    y + angle.sin() * 0.17 * matrix_layout::MARK_SCALE,
                    matrix_layout::OVERLAY_Z + 0.01,
                ]
            })
            .collect();
        for i in 0..7 {
            mesh.line(points[i], points[(i + 1) % 7], 0.012, color);
        }
    }
    mesh.map_since(start, matrix_layout::transform);
}

fn fifth(mesh: &mut Mesh, state: &Snapshot, hz: f32) {
    let Some(a) = super::matrix_position(hz, false) else {
        return;
    };
    let b = [
        super::spectrum_x(hz * 1.5, state.device.sample_rate),
        spatial::BASE_Y,
        spatial::SHORE_Z,
    ];
    for i in (0..32).step_by(2) {
        mesh.line(
            spatial::stream(a, b, i as f32 / 32.0),
            spatial::stream(a, b, (i + 1) as f32 / 32.0),
            0.012,
            PROJECTED,
        );
    }
}
