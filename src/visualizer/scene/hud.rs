//! Camera-independent overlay: performance essentials and a compact interpretation key.
use super::super::mesh::{compatibility, Mesh, CYAN, INK, MUTED, PROJECTED};
use super::{
    history::CadenceHistory,
    labels::{MODES, PITCH},
    traces,
};
use crate::{
    contracts::{Field, ModeCandidate, Snapshot},
    native_input::Status,
};

pub fn draw(
    mesh: &mut Mesh,
    state: &Snapshot,
    input: &Status<'_>,
    size: [u32; 2],
    history: &mut CadenceHistory,
    navigation: &crate::native_input::timeline::Timeline,
) {
    let start = mesh.vertices.len();
    let width = crate::native_input::timeline::hud_width(size);
    mesh.rect(0.0, 614.0, width, 106.0, 0.0, [0.012, 0.024, 0.032, 0.94]);
    mesh.rect(
        0.0,
        0.0,
        width,
        if state.asset.is_some() { 194.0 } else { 110.0 },
        0.0,
        [0.012, 0.024, 0.032, 0.94],
    );
    heading(mesh, state, width);
    keyboard(mesh, input);
    legend(mesh, width);
    if let Some(frame) = &state.analysis {
        candidates(mesh, "L", &frame.logical, &frame.logical_modes, 643.0, CYAN);
        candidates(
            mesh,
            "M",
            &frame.measured,
            &frame.measured_modes,
            629.0,
            INK,
        );
        cadence(mesh, state, history);
    }
    super::compass::draw(mesh, state, navigation);
    super::song::hud(mesh, state, navigation, width);
    map_screen(mesh, start, size);
}

fn map_screen(mesh: &mut Mesh, start: usize, size: [u32; 2]) {
    let width = crate::native_input::timeline::hud_width(size);
    // Negative W is the explicit ABI/shader screen-space marker. No camera matrix applies.
    let height = crate::native_input::timeline::hud_height(size);
    for vertex in &mut mesh.vertices[start..] {
        if vertex.position[1] >= 330.0 {
            vertex.position[1] += height - 720.0;
        }
        vertex.position = [
            vertex.position[0] / width * 2.0 - 1.0,
            1.0 - vertex.position[1] / height * 2.0,
            0.0,
            -1.0,
        ];
    }
}

fn heading(mesh: &mut Mesh, state: &Snapshot, width: f32) {
    let mode = if state.view.immersive {
        "IMMERSIVE"
    } else {
        "PRECISE"
    };
    mesh.text(&format!("HARMONIC / {mode}"), 18.0, 701.0, 1.8, INK);
    mesh.text(&audio_status(state), 18.0, 680.0, 1.20, MUTED);
    mesh.text(warning(state), (width - 240.0).max(18.0), 701.0, 1.25, CYAN);
}

fn audio_status(state: &Snapshot) -> String {
    let audio = if state.device.available {
        "AUDIO"
    } else {
        "NO AUDIO / VIRTUAL"
    };
    let rate = state.device.sample_rate.max(1) as f64;
    let timing = state.analysis.as_ref().map_or("WARMING".into(), |f| {
        let age = |n: u32| {
            if n == u32::MAX {
                "WARM".into()
            } else {
                format!("{:.0}", n as f64 * 1000.0 / rate)
            }
        };
        format!(
            "{:.0}MS LAG / WINDOW {}-{}MS",
            state.sample.saturating_sub(f.end) as f64 * 1000.0 / rate,
            age(f.age_samples[0]),
            age(f.age_samples[2])
        )
    });
    format!(
        "{audio} {}HZ / {} VOICES / {timing}",
        state.device.sample_rate,
        state.voices.len()
    )
}

fn warning(state: &Snapshot) -> &'static str {
    if state.panic {
        "PANIC / SILENCED"
    } else if state.analysis.as_ref().is_some_and(|f| f.gap) {
        "ANALYSIS GAP"
    } else if state.overloads > 0 || state.device.errors > 0 {
        "CHECK ENGINE / OVERLOAD"
    } else if state
        .analysis
        .as_ref()
        .is_some_and(|f| f.contributions.iter().any(|c| c.layer == "processing"))
    {
        "BUS PROTECTION ACTIVE"
    } else {
        "ESC / PANIC"
    }
}

fn keyboard(mesh: &mut Mesh, input: &Status<'_>) {
    const INSTRUMENTS: [&str; 6] = ["WAVETABLE", "SINE", "KICK", "SNARE", "HAT", "BELL"];
    let focus = if input.focused {
        "KEYS ACTIVE"
    } else {
        "CLICK NOVA TO PLAY"
    };
    let instrument = INSTRUMENTS[input.instrument as usize % 6];
    mesh.text(
        &format!(
            "{focus} / OCT {} / {instrument} / {} PENDING",
            input.octave, input.pending
        ),
        18.0,
        661.0,
        1.15,
        CYAN,
    );
    mesh.text(
        "PLAY Z S X D C V G B H N J M / Q 2 W 3 E R 5 T 6 Y 7 U I",
        18.0,
        30.0,
        1.20,
        MUTED,
    );
    mesh.text(
        "[ ] OCTAVE / F1-F6 SOUND / DRAG ORBIT / WHEEL ZOOM / ESC PANIC",
        18.0,
        14.0,
        1.15,
        MUTED,
    );
    if let Some(error) = input.error {
        mesh.text(error, 18.0, 48.0, 1.2, [0.94, 0.63, 0.18, 1.0]);
    }
}

fn legend(mesh: &mut Mesh, width: f32) {
    mesh.diamond(23.0, 94.0, 4.0, 0.0, CYAN);
    mesh.text("PLAYED", 34.0, 98.0, 1.2, CYAN);
    mesh.rect(101.0, 90.0, 8.0, 8.0, 0.0, INK);
    mesh.text("MEASURED FILL", 118.0, 98.0, 1.2, INK);
    mesh.border(229.0, 90.0, 9.0, 8.0, 0.0, CYAN);
    mesh.text("LOGICAL BORDER", 247.0, 98.0, 1.2, MUTED);
    mesh.text("- - PROJECTED", 370.0, 98.0, 1.2, PROJECTED);
    for i in 0..24 {
        mesh.rect(
            width - 202.0 + i as f32 * 7.0,
            90.0,
            7.0,
            5.0,
            0.0,
            compatibility(i as f32 / 23.0, 1.0),
        );
    }
    mesh.text("COMPATIBILITY", width - 202.0, 108.0, 1.05, MUTED);
    mesh.text(
        "STREAM ROUTES ILLUSTRATE CONTRIBUTIONS / NOT SOUND PROPAGATION",
        18.0,
        80.0,
        1.05,
        MUTED,
    );
}

fn candidates(
    mesh: &mut Mesh,
    label: &str,
    field: &Field,
    modes: &[ModeCandidate],
    y: f32,
    color: [f32; 4],
) {
    let names = if field.confidence < 0.02 {
        "ROOT / MODE UNCERTAIN".into()
    } else {
        modes
            .iter()
            .take(2)
            .map(|m| {
                format!(
                    "{} {}",
                    PITCH[m.root as usize % 12],
                    MODES[m.mode as usize % 7]
                )
            })
            .collect::<Vec<_>>()
            .join(" / ")
    };
    mesh.text(
        &format!(
            "{label} {names} / {:.0}% CONFIDENCE",
            field.confidence * 100.0
        ),
        18.0,
        y,
        1.1,
        color,
    );
}

fn cadence(mesh: &mut Mesh, state: &Snapshot, history: &mut CadenceHistory) {
    let Some(frame) = &state.analysis else {
        return;
    };
    let start = mesh.vertices.len();
    history.draw(mesh, state, frame);
    traces::cadence(mesh, state, frame);
    mesh.map_since(start, |[x, y, z]| {
        [18.0 + (x + 8.4) * 38.0, 62.0 + (y + 4.6) * 27.0, z]
    });
}

pub fn budget_warning(mesh: &mut Mesh, size: [u32; 2]) {
    let start = mesh.vertices.len();
    let width = crate::native_input::timeline::hud_width(size);
    mesh.text(
        "VISUAL LIMIT / REDUCING DETAIL",
        width - 240.0,
        680.0,
        1.05,
        [0.94, 0.63, 0.18, 1.0],
    );
    map_screen(mesh, start, size);
}
