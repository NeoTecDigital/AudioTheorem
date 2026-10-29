//! One local-to-world transform for the table, its overlays and stream origins.
use super::spatial::WALL_Z;

pub const SCALE: f32 = 2.0;
const CENTER_Y: f32 = 2.73;
// Reflow the header annotations inside the enlarged table's upper margin, clear of the HUD.
pub const ROOT_LOGICAL_Y: f32 = 4.83;
pub const ROOT_MEASURED_Y: f32 = 4.64;
pub const MARK_SCALE: f32 = 0.5;
pub const OVERLAY_Z: f32 = WALL_Z + 0.25;

pub fn local_position(pc: usize, octave: usize) -> [f32; 3] {
    [
        -3.19 + pc as f32 * 0.58,
        0.75 + octave as f32 * 0.36,
        WALL_Z,
    ]
}

pub fn transform([x, y, z]: [f32; 3]) -> [f32; 3] {
    [x * SCALE, CENTER_Y + (y - CENTER_Y) * SCALE, z]
}

/// Cents wrap at the B/C cell boundary, not by taking a modulo of frequency in Hz.
pub fn local_frequency(hz: f32) -> Option<[f32; 3]> {
    let (pc, octave) = super::pitch(hz)?;
    let midi = 69.0 + 12.0 * (hz / 440.0).log2();
    let mut point = local_position(pc, octave);
    point[0] += (midi - midi.round()) * 0.58;
    Some(point)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn position(pc: usize, octave: usize) -> [f32; 3] {
        transform(local_position(pc, octave))
    }

    #[test]
    fn table_doubles_both_dimensions_about_its_center_without_moving_depth() {
        assert_eq!(transform([0.0, CENTER_Y, WALL_Z]), [0.0, CENTER_Y, WALL_Z]);
        let a = position(0, 0);
        let b = position(11, 11);
        assert!((b[0] - a[0] - 12.76).abs() < 1e-5);
        assert!((b[1] - a[1] - 7.92).abs() < 1e-5);
        for octave in 0..12 {
            for pc in 0..12 {
                assert_eq!(position(pc, octave)[2], WALL_Z);
            }
        }
    }

    #[test]
    fn voice_origin_matches_transformed_cell_for_every_supported_note() {
        for midi in 0..144 {
            let hz = 440.0 * 2.0_f32.powf((midi as f32 - 69.0) / 12.0);
            let expected = transform(local_position(midi % 12, midi / 12));
            let actual = super::super::matrix_position(hz, false).unwrap();
            assert!((actual[0] - expected[0]).abs() < 1e-4);
            assert_eq!(actual[1..], expected[1..]);
            assert_eq!(super::super::matrix_position(hz, true), Some(actual));
        }
    }

    #[test]
    fn detuned_origins_move_continuously_with_cents_and_wrap_only_at_row_boundary() {
        let center = local_frequency(440.0).unwrap();
        let sharp = local_frequency(440.0 * 2.0_f32.powf(25.0 / 1200.0)).unwrap();
        let flat = local_frequency(440.0 * 2.0_f32.powf(-25.0 / 1200.0)).unwrap();
        assert!((sharp[0] - center[0] - 0.58 * 0.25).abs() < 1e-5);
        assert!((center[0] - flat[0] - 0.58 * 0.25).abs() < 1e-5);
        assert_eq!(flat[1], sharp[1]);
        let edge = |midi: f32| local_frequency(440.0 * 2.0_f32.powf((midi - 69.0) / 12.0)).unwrap();
        assert!(edge(71.49)[0] > 3.4 && edge(71.51)[0] < -3.4);
        assert!((edge(71.51)[1] - edge(71.49)[1] - 0.36).abs() < 1e-5);
        assert!(local_frequency(1.0).is_none());
        assert!(local_frequency(f32::NAN).is_none());
    }

    #[test]
    fn enlarged_table_and_reflowed_annotations_clear_the_hud_in_both_modes() {
        let mut state = super::super::fixtures::snapshot();
        let frame = state.analysis.as_mut().unwrap();
        frame.logical_modes = (0..12)
            .map(|root| crate::contracts::ModeCandidate {
                root,
                weight: 1.0,
                ..frame.logical_modes[0].clone()
            })
            .collect();
        frame.measured_modes = frame.logical_modes.clone();
        for immersive in [false, true] {
            state.view.immersive = immersive;
            let frame = state.analysis.as_ref().unwrap();
            let mut mesh = crate::visualizer::mesh::Mesh::new();
            super::super::field::matrix(&mut mesh, &state, frame);
            super::super::labels::world(&mut mesh, &state);
            super::super::labels::analysis(&mut mesh, &state, frame);
            assert_default_framing(&mesh, &state.view);
        }
    }

    fn assert_default_framing(mesh: &crate::visualizer::mesh::Mesh, view: &crate::contracts::View) {
        let transform = crate::visualizer::camera::Camera.matrix(view, 1920, 1080);
        for vertex in &mesh.vertices {
            let p: [f32; 4] = std::array::from_fn(|row| {
                (0..4)
                    .map(|col| transform[col * 4 + row] * vertex.position[col])
                    .sum()
            });
            assert!((p[0] / p[3]).abs() < 1.0);
            assert!(
                (-0.70..0.67).contains(&(p[1] / p[3])),
                "matrix/axis HUD collision: {:?}",
                vertex.position
            );
        }
    }
}
