//! Compact harmonic compass. Only engine evidence, no key inference in presentation.
mod lens;
use super::labels::PITCH;
use crate::{
    analysis::compass::{group_tonic, FIFTHS},
    contracts::{Field, Snapshot},
    native_input::timeline::Timeline,
    visualizer::mesh::{compatibility, Mesh, CYAN, INK, MUTED},
};

pub fn draw(mesh: &mut Mesh, state: &Snapshot, navigation: &Timeline) {
    mesh.rect(12.0, 330.0, 236.0, 280.0, 0.0, [0.012, 0.024, 0.032, 0.92]);
    mesh.text("HARMONIC COMPASS", 25.0, 598.0, 1.35, INK);
    let inspecting = navigation.inspecting();
    let source = state
        .song
        .as_ref()
        .and_then(|s| s.row(navigation.cursor(state)));
    let frame = state.analysis.as_ref();
    let empty = Field::default();
    let logical = if inspecting {
        &empty
    } else {
        frame.map_or(&empty, |f| &f.logical)
    };
    let measured = if inspecting {
        source.map_or(&empty, |r| &r.field)
    } else {
        frame.map_or(&empty, |f| &f.measured)
    };
    activity(mesh, state, logical, measured, inspecting);
    candidates(mesh, logical, 52.0, CYAN);
    candidates(mesh, measured, 94.0, INK);
    caption(mesh, logical, measured, inspecting, source.is_some());
    lens::draw(mesh, navigation);
}
fn caption(mesh: &mut Mesh, logical: &Field, measured: &Field, inspecting: bool, indexed: bool) {
    let status = if inspecting { "SOURCE" } else { "LIVE" };
    mesh.text(status, 112.0, 496.0, 1.15, INK);
    mesh.text(
        &format!(
            "L{:02.0} M{:02.0}",
            logical.confidence * 100.0,
            measured.confidence * 100.0
        ),
        102.0,
        480.0,
        0.8,
        MUTED,
    );
    mesh.text("CONFIDENCE", 102.0, 468.0, 0.7, MUTED);
    mesh.text("INNER PLAYED / OUTER ENERGY", 24.0, 404.0, 0.94, MUTED);
    if inspecting {
        mesh.text(
            if indexed {
                "INSPECTING / NOT ACTUAL OUTPUT"
            } else {
                "INSPECTING / INDEX PENDING"
            },
            24.0,
            585.0,
            0.9,
            CYAN,
        );
    } else {
        mesh.text("GROUP ARCS / NOT CERTAINTY", 24.0, 585.0, 0.85, MUTED);
    }
}
fn activity(
    mesh: &mut Mesh,
    state: &Snapshot,
    logical: &Field,
    measured: &Field,
    inspecting: bool,
) {
    for (i, &pc) in FIFTHS.iter().enumerate() {
        let theta = i as f32 * std::f32::consts::TAU / 12.0;
        arc(mesh, theta, 64.0, 0.14, [0.10, 0.22, 0.25, 0.8]);
        let energy = measured.evidence[pc as usize].sqrt();
        let mut color = compatibility(measured.compatibility[pc as usize], measured.confidence);
        color[3] = 0.12 + energy * 0.8;
        arc(mesh, theta, 78.0, 2.0 + energy * 7.0, color);
        let [x, y] = point(theta, 108.0);
        mesh.text(PITCH[pc as usize], x - 4.0, y + 3.0, 1.05, INK);
        let active = !inspecting
            && state
                .voices
                .iter()
                .any(|v| v.held && super::pitch(v.hz).is_some_and(|(p, _)| p == pc as usize));
        let [x, y] = point(theta, 64.0);
        if active {
            mesh.diamond(
                x,
                y,
                3.0 + logical.evidence[pc as usize].sqrt() * 3.0,
                0.0,
                CYAN,
            );
        }
    }
}
fn candidates(mesh: &mut Mesh, field: &Field, radius: f32, color: [f32; 4]) {
    if field.confidence < 0.02 {
        return;
    }
    let mut groups: Vec<_> = field.group_weights.iter().copied().enumerate().collect();
    groups.sort_by(|a, b| b.1.total_cmp(&a.1));
    for (group, weight) in groups.into_iter().take(3) {
        let pc = group_tonic(group);
        let sector = FIFTHS.iter().position(|p| *p == pc).unwrap();
        let mut c = color;
        c[3] = (weight * 3.0).clamp(0.15, 0.95);
        arc(
            mesh,
            sector as f32 * std::f32::consts::TAU / 12.0,
            radius,
            1.0 + weight * 10.0,
            c,
        );
    }
}
fn point(theta: f32, radius: f32) -> [f32; 2] {
    [
        130.0 + theta.sin() * radius * 0.74,
        490.0 + theta.cos() * radius * 0.74,
    ]
}
fn arc(mesh: &mut Mesh, theta: f32, radius: f32, width: f32, color: [f32; 4]) {
    for i in 0..10 {
        let a = point(theta - 0.20 + i as f32 * 0.04, radius);
        let b = point(theta - 0.20 + (i + 1) as f32 * 0.04, radius);
        mesh.line([a[0], a[1], 0.0], [b[0], b[1], 0.0], width, color);
    }
}
