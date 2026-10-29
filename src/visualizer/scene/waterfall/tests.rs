use super::*;
use crate::contracts::{HistoryBand, SpectrumSlice, WavePoint};
use crate::visualizer::mesh::CAPACITY;

fn data() -> StreamHistory {
    StreamHistory {
        epoch: 1,
        start: 1000,
        end: 2000,
        pcm: vec![PcmSlice {
            start: 1000,
            end: 2000,
            points: vec![
                WavePoint {
                    start: 1000,
                    end: 1500,
                    min: [-0.8, -0.2],
                    max: [0.6, 0.9],
                },
                WavePoint {
                    start: 1500,
                    end: 2000,
                    min: [-0.1, -0.7],
                    max: [0.3, 0.4],
                },
            ],
        }],
        spectrum: vec![SpectrumSlice {
            sample: 1200,
            bands: vec![
                HistoryBand {
                    hz: 440.0,
                    power: 0.1,
                },
                HistoryBand {
                    hz: 880.0,
                    power: 0.001,
                },
            ],
            ..Default::default()
        }],
    }
}

#[test]
fn older_rows_flow_forward_and_do_not_depend_on_wall_clock_or_render_frequency() {
    let history = data();
    assert_eq!(fraction(&history, 2000), Some(0.0));
    assert_eq!(fraction(&history, 1000), Some(1.0));
    assert!(fraction(&history, 999).is_none());
    let mut state = super::super::fixtures::snapshot();
    state.analysis.as_mut().unwrap().stream_history = history.into();
    let mut mesh = Mesh::new();
    draw(&mut mesh, &state, state.analysis.as_ref().unwrap());
    assert!(mesh
        .vertices
        .iter()
        .any(|v| v.position[2] > spatial::SHORE_Z + 6.0));
    assert!(mesh
        .vertices
        .iter()
        .any(|v| v.position[2] == spatial::SHORE_Z));
    assert!(mesh
        .vertices
        .iter()
        .all(|v| v.position[2] >= spatial::SHORE_Z));
    let mut other = Mesh::new();
    draw(&mut other, &state, state.analysis.as_ref().unwrap());
    assert_eq!(mesh.vertices.len(), other.vertices.len());
    assert!(mesh.vertices.len() < CAPACITY);
}

#[test]
fn signed_stereo_shapes_and_envelopes_preserve_negative_values() {
    let history = data();
    let mut mesh = Mesh::new();
    pcm::row(&mut mesh, &history, &history.pcm[0]);
    assert!(mesh
        .vertices
        .iter()
        .any(|v| v.position[1] < PCM_BASE - 0.7 * PCM_AMPLITUDE));
    assert!(mesh
        .vertices
        .iter()
        .any(|v| v.position[1] > PCM_BASE + 0.8 * PCM_AMPLITUDE));
    assert!(mesh
        .vertices
        .iter()
        .any(|v| v.position[0] < PCM_X + PCM_WIDTH));
    assert!(mesh
        .vertices
        .iter()
        .any(|v| v.position[0] >= PCM_X + PCM_STRIDE));
}

#[test]
fn compact_pcm_stays_beside_spectrum_and_shares_its_depth_clock() {
    let mut history = data();
    history.end = 3000;
    let mut mesh = Mesh::new();
    pcm::row(&mut mesh, &history, &history.pcm[0]);
    assert!(!mesh.vertices.is_empty());
    for vertex in &mesh.vertices {
        let [x, y, z, _] = vertex.position;
        assert!(
            (8.2..10.5).contains(&x),
            "PCM must sit outside the spectrum span"
        );
        assert!((spatial::BASE_Y - 0.31..spatial::BASE_Y + 0.31).contains(&y));
        assert_eq!(z, spatial::SHORE_Z + DEPTH * 0.5);
        assert!(vertex.color[3] <= 0.5);
    }
    let anchor = temporal_anchor(&history, 1500, 1501).unwrap();
    assert_eq!(anchor[2], spatial::SHORE_Z + DEPTH * 0.5);
    assert_eq!(anchor[1], spatial::BASE_Y);
}

#[test]
fn default_history_layout_clears_screen_hud_in_both_modes() {
    let mut state = super::super::fixtures::snapshot();
    for immersive in [false, true] {
        state.view.immersive = immersive;
        let mut mesh = Mesh::new();
        draw(&mut mesh, &state, state.analysis.as_ref().unwrap());
        let transform = crate::visualizer::camera::Camera.matrix(&state.view, 1920, 1080);
        assert_clear_of_hud(&mesh, transform);
    }
}

fn assert_clear_of_hud(mesh: &Mesh, transform: [f32; 16]) {
    for vertex in &mesh.vertices {
        let p: [f32; 4] = std::array::from_fn(|row| {
            (0..4)
                .map(|col| transform[col * 4 + row] * vertex.position[col])
                .sum()
        });
        assert!(p[3] > 0.0);
        assert!((p[0] / p[3]).abs() < 0.98);
        assert!(
            (-0.70..0.67).contains(&(p[1] / p[3])),
            "history must clear the HUD: {:?} projects to {}",
            vertex.position,
            p[1] / p[3]
        );
    }
}

#[test]
fn no_lines_bridge_pcm_gaps_and_no_old_epoch_is_drawn() {
    let mut history = data();
    history.pcm[0].points[1].start = 1600;
    let mut mesh = Mesh::new();
    let row = &history.pcm[0];
    pcm::segment(
        &mut mesh,
        row,
        [&row.points[0], &row.points[1]],
        0,
        spatial::SHORE_Z,
        [1.0; 4],
    );
    assert!(mesh.vertices.is_empty());
    let mut state = super::super::fixtures::snapshot();
    history.epoch = 77;
    state.analysis.as_mut().unwrap().stream_history = history.into();
    draw(&mut mesh, &state, state.analysis.as_ref().unwrap());
    assert!(mesh.vertices.is_empty());
}

#[test]
fn temporal_links_use_actual_overlapping_history_not_frequency_indices() {
    let history = data();
    assert!(temporal_anchor(&history, 800, 999).is_none());
    assert!(temporal_anchor(&history, 2000, 2200).is_none());
    let p = temporal_anchor(&history, 1500, 1501).unwrap();
    assert!((p[0] - (PCM_X + PCM_WIDTH * 0.5)).abs() < 1e-5);
    assert_eq!(p[2], spatial::SHORE_Z);
}

#[test]
fn changing_the_live_spectrum_never_rewrites_historical_ridges() {
    let history = data();
    let mut state = super::super::fixtures::snapshot();
    let mut a = Mesh::new();
    spectrum::row(&mut a, &state, &history, &history.spectrum[0]);
    state.analysis.as_mut().unwrap().spectrum.clear();
    let mut b = Mesh::new();
    spectrum::row(&mut b, &state, &history, &history.spectrum[0]);
    assert_eq!(
        a.vertices.iter().map(|v| v.position).collect::<Vec<_>>(),
        b.vertices.iter().map(|v| v.position).collect::<Vec<_>>()
    );
}
