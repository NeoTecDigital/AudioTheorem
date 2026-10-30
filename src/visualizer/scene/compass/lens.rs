use super::super::labels::{MODES, PITCH};
use crate::{
    analysis::compass::{tetrachords, FIFTHS},
    native_input::timeline::Timeline,
    visualizer::mesh::{Mesh, INK, MUTED, PROJECTED},
};

pub fn draw(mesh: &mut Mesh, navigation: &Timeline) {
    let Some(tonic) = navigation.pinned else {
        mesh.text("CLICK A NOTE / OVERLAP LENS", 24.0, 380.0, 1.0, MUTED);
        mesh.text("CENTER CLEARS / NEVER RETUNES", 24.0, 361.0, 0.9, MUTED);
        return;
    };
    let chords = tetrachords(tonic, navigation.mode);
    for (i, notes) in chords.iter().enumerate() {
        let names = notes.map(|pc| PITCH[pc as usize]).join(" ");
        mesh.text(
            &format!("{} {names}", if i == 0 { "LOW" } else { "HIGH" }),
            24.0,
            388.0 - i as f32 * 14.0,
            1.05,
            if i == 0 { PROJECTED } else { INK },
        );
        membership(mesh, notes, i);
    }
    mesh.text(
        &format!(
            "{} / {} / CLICK MODE",
            PITCH[chords[0][0] as usize], MODES[navigation.mode]
        ),
        24.0,
        354.0,
        0.9,
        MUTED,
    );
    mesh.text("LENS ONLY / NOT PLAYED", 24.0, 339.0, 0.9, MUTED);
}
fn membership(mesh: &mut Mesh, notes: &[u8; 4], layer: usize) {
    for pc in notes {
        let sector = FIFTHS.iter().position(|p| p == pc).unwrap();
        let theta = sector as f32 * std::f32::consts::TAU / 12.0;
        let p = super::point(theta, if layer == 0 { 41.0 } else { 46.0 });
        if layer == 0 {
            mesh.outline(
                p[0] - 2.5,
                p[1] - 2.5,
                5.0,
                5.0,
                0.8,
                [0.7, 0.65, 0.85, 0.9],
            );
        } else {
            mesh.line([p[0] - 2.5, p[1], 0.0], [p[0] + 2.5, p[1], 0.0], 1.2, INK);
        }
    }
}
