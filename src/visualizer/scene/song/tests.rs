use super::*;
use crate::visualizer::scene::Scene;
use std::sync::Arc;
fn song() -> Arc<SongIndex> {
    let rows: Vec<_> = (1..=240)
        .map(|i| SongRow {
            spectrum: SpectrumSlice {
                sample: i * 2400,
                bands: (0..320)
                    .map(|b| HistoryBand {
                        hz: (b as f32 / 319.0 * 24000.0_f32.ln()).exp(),
                        power: 0.01 * ((i as f32 * 0.3 + b as f32 * 0.05).sin() * 0.5 + 0.5),
                    })
                    .collect(),
                ..Default::default()
            },
            field: Field::default(),
        })
        .collect();
    let tiles = rows
        .chunks(SONG_TILE_ROWS)
        .map(|r| Some(Arc::new(SongTile { rows: r.to_vec() })))
        .collect::<Vec<_>>();
    Arc::new(SongIndex {
        model_version: 1,
        asset: 9,
        rate: 48000,
        frames: 576000,
        hop: 2400,
        ready: tiles.len(),
        tiles,
        overview: Arc::new(Vec::new()),
    })
}
#[test]
fn full_song_is_available_before_playback_and_dense_geometry_is_bounded() {
    let mut state = crate::visualizer::scene::fixtures::snapshot();
    state.asset = Some(9);
    state.song = Some(song());
    state.duration_seconds = 12.0;
    let mut timeline = Timeline::default();
    timeline.sync(&state);
    timeline.fit = true;
    let mut mesh = Mesh::new();
    draw(&mut mesh, &state, &timeline);
    assert!(mesh.strokes.len() > 30000);
    assert!(!mesh.overflow);
    let first = mesh.strokes.iter().map(|s| (s.a, s.b)).collect::<Vec<_>>();
    state.sample += 48000; // engine continues while file paused: source must not move
    mesh.clear();
    draw(&mut mesh, &state, &timeline);
    assert_eq!(
        first,
        mesh.strokes.iter().map(|s| (s.a, s.b)).collect::<Vec<_>>()
    );
    let input = crate::native_input::Status {
        octave: 4,
        instrument: 0,
        focused: true,
        pending: 0,
        error: None,
    };
    for immersive in [false, true] {
        state.view.immersive = immersive;
        let mut scene = Scene::new();
        scene.build_navigation(&state, 1920, 1080, &input, &timeline);
        assert!(!scene.mesh.overflow);
        assert!(!scene.hud.overflow);
        assert!(scene.mesh.vertices.len() < crate::visualizer::mesh::CAPACITY);
        assert!(scene.mesh.strokes.len() < crate::visualizer::mesh::STROKE_CAPACITY);
    }
}
#[test]
fn missing_source_tiles_never_become_silent_or_repeated_rows() {
    let mut state = crate::visualizer::scene::fixtures::snapshot();
    state.asset = Some(9);
    state.duration_seconds = 12.0;
    let mut index = (*song()).clone();
    index.tiles.fill(None);
    index.ready = 0;
    state.song = Some(Arc::new(index));
    let mut timeline = Timeline::default();
    timeline.sync(&state);
    timeline.fit = true;
    let mut mesh = Mesh::new();
    draw(&mut mesh, &state, &timeline);
    assert_eq!(mesh.strokes.len(), 1); // only the play line, no invented spectrum
}

#[test]
#[ignore = "release-only dense source scene CPU timing, not GPU or audio soak"]
fn dense_song_scene_budget() {
    let mut state = crate::visualizer::scene::fixtures::snapshot();
    state.asset = Some(9);
    state.song = Some(song());
    state.duration_seconds = 12.0;
    let mut timeline = Timeline::default();
    timeline.sync(&state);
    timeline.fit = true;
    let input = crate::native_input::Status {
        octave: 4,
        instrument: 0,
        focused: true,
        pending: 0,
        error: None,
    };
    for immersive in [false, true] {
        state.view.immersive = immersive;
        let mut scene = Scene::new();
        let mut times = Vec::new();
        for i in 0..240 {
            let start = std::time::Instant::now();
            scene.build_navigation(&state, 1920, 1080, &input, &timeline);
            assert!(!scene.mesh.overflow);
            if i > 20 {
                times.push(start.elapsed().as_micros());
            }
        }
        times.sort_unstable();
        let p95 = times[times.len() * 95 / 100];
        let p99 = times[times.len() * 99 / 100];
        println!("dense source immersive={immersive}: vertices={} strokes={} CPU p95={p95}us p99={p99}us",
            scene.mesh.vertices.len(),scene.mesh.strokes.len());
        assert!(p95 < 16700 && p99 < 25000);
    }
}
