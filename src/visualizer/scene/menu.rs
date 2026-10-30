//! Camera-independent native controls; layout is shared with pointer hit testing.
use crate::{
    contracts::Snapshot,
    native_input::{menu, Status},
    visualizer::mesh::{Mesh, CYAN, INK, MUTED},
};

pub fn draw(mesh: &mut Mesh, state: &Snapshot, status: &Status<'_>, width: f32) {
    button(
        mesh,
        [width - 150.0, 654.0, 132.0, 25.0],
        if status.menu_open {
            "CLOSE / TAB"
        } else {
            "CONTROLS / TAB"
        },
        status.menu_open,
        true,
    );
    if !status.menu_open {
        return;
    }
    mesh.rect(
        width - 344.0,
        334.0,
        332.0,
        316.0,
        0.0,
        [0.018, 0.033, 0.043, 0.99],
    );
    mesh.outline(
        width - 344.0,
        334.0,
        332.0,
        316.0,
        1.0,
        [0.16, 0.34, 0.38, 1.0],
    );
    mesh.text("NATIVE CONTROLS", width - 332.0, 636.0, 1.5, INK);
    for item in menu::items(state, status, width) {
        button(mesh, item.rect, &item.label, item.active, item.enabled);
    }
    values(mesh, state, status, width);
}
fn values(mesh: &mut Mesh, state: &Snapshot, status: &Status<'_>, width: f32) {
    value(
        mesh,
        width,
        572.0,
        &format!("{:.0}%", state.controls.gain * 100.0),
    );
    value(
        mesh,
        width,
        546.0,
        menu::INSTRUMENTS[status.instrument as usize % 6],
    );
    value(mesh, width, 520.0, &status.octave.to_string());
    mesh.text(
        "DETAILED SYNTH / FILE IMPORT IN BROWSER",
        width - 332.0,
        346.0,
        1.05,
        MUTED,
    );
}
fn value(mesh: &mut Mesh, width: f32, y: f32, text: &str) {
    mesh.text(text, width - 225.0, y + 14.0, 1.15, INK);
}
fn button(mesh: &mut Mesh, rect: [f32; 4], label: &str, active: bool, enabled: bool) {
    let [x, y, w, h] = rect;
    mesh.rect(
        x,
        y,
        w,
        h,
        0.0,
        if active {
            [0.035, 0.19, 0.20, 1.0]
        } else {
            [0.03, 0.065, 0.08, 1.0]
        },
    );
    mesh.outline(
        x,
        y,
        w,
        h,
        0.7,
        if active {
            CYAN
        } else {
            [0.13, 0.25, 0.28, 1.0]
        },
    );
    mesh.text(
        label,
        x + 8.0,
        y + h * 0.65,
        1.15,
        if !enabled {
            MUTED
        } else if active {
            CYAN
        } else {
            INK
        },
    );
}
