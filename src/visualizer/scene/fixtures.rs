//! Deterministic geometry fixture; not a claim of GPU or acoustic verification.
use super::super::{camera::Camera, mesh::Vertex};
use super::Scene;
use crate::contracts::*;

pub(super) fn snapshot() -> Snapshot {
    Snapshot {
        version: 1,
        revision: 1,
        epoch: 1,
        sample: 48_000,
        controls: Controls::default(),
        view: View::default(),
        wavetable: vec![],
        partials: vec![],
        voices: vec![VoiceObservation {
            hz: 261.6256,
            amplitude: 0.5,
            held: true,
            ..Default::default()
        }],
        acknowledgements: vec![],
        device: DeviceStatus {
            sample_rate: 48_000,
            ..Default::default()
        },
        asset: None,
        playback_seconds: 0.0,
        playback_frame: 0,
        song: None,
        duration_seconds: 0.0,
        playing: false,
        panic: false,
        overloads: 0,
        analysis: Some(analysis()),
    }
}

fn analysis() -> AnalysisFrame {
    let mut frame = AnalysisFrame {
        model_version: 1,
        epoch: 1,
        start: 47_744,
        end: 48_000,
        age_samples: [1024, 4096, 16384],
        cells: vec![0.0; 144],
        ..Default::default()
    };
    frame.logical.confidence = 0.4;
    frame.measured.confidence = 0.3;
    frame.logical.compatibility = [0.95, 0.1, 0.8, 0.2, 0.9, 0.8, 0.1, 0.95, 0.2, 0.8, 0.1, 0.9];
    frame.measured.compatibility = frame.logical.compatibility;
    for midi in [60, 64, 67, 72, 76, 79, 84] {
        frame.cells[midi] = 0.01;
    }
    modes(&mut frame);
    pcm(&mut frame);
    links(&mut frame);
    frame.stream_history = super::fixture_history::recording(frame.end).into();
    frame.logical_cadence.tension = 0.35;
    frame.measured_cadence.tension = 0.52;
    frame
}

fn modes(frame: &mut AnalysisFrame) {
    frame.logical_modes = vec![
        ModeCandidate {
            root: 0,
            mode: 0,
            weight: 0.7,
            intervals: [0, 2, 4, 5, 7, 9, 11],
            ..Default::default()
        },
        ModeCandidate {
            root: 9,
            mode: 5,
            weight: 0.6,
            intervals: [0, 2, 3, 5, 7, 8, 10],
            ..Default::default()
        },
    ];
    frame.measured_modes = frame.logical_modes.clone();
}

fn pcm(frame: &mut AnalysisFrame) {
    frame.spectrum = (1..512)
        .map(|i| SpectrumPoint {
            hz: (i as f32 / 511.0 * 24000.0_f32.ln()).exp(),
            power: fixture_power((i as f32 / 511.0 * 24000.0_f32.ln()).exp()),
            ..Default::default()
        })
        .collect();
    frame.recent_pcm = (0..512)
        .map(|i| [(i as f32 * 0.07).sin() * 0.65, 0.0])
        .collect();
    frame.waveform = (0..512)
        .map(|i| WavePoint {
            start: i * 93,
            end: (i + 1) * 93,
            min: [-0.55, -0.31],
            max: [0.42, 0.6],
        })
        .collect();
}

fn fixture_power(hz: f32) -> f32 {
    [
        261.6256, 329.628, 391.9954, 523.2512, 659.256, 783.9908, 1046.502,
    ]
    .iter()
    .map(|peak| 0.003 * (-((hz - peak) / 12.0).powi(2)).exp())
    .sum::<f32>()
        + 1e-10
}

fn links(frame: &mut AnalysisFrame) {
    frame.contributions = vec![
        Contribution {
            layer: "logical".into(),
            source: 1,
            client: Some(1),
            hz: 261.6256,
            target_hz: 261.6256,
            energy: 0.2,
            sample: 47_744,
            end_sample: 48_000,
            ratio: 1.0,
            cents: 0.0,
        },
        Contribution {
            layer: "projected".into(),
            source: 1,
            client: Some(1),
            hz: 261.6256,
            target_hz: 523.2512,
            energy: 0.1,
            sample: 47_744,
            end_sample: 48_000,
            ratio: 2.0,
            cents: 0.0,
        },
    ];
    for hz in [
        261.6256, 329.628, 391.9954, 523.2512, 659.256, 783.9908, 1046.502,
    ] {
        frame.contributions.push(Contribution {
            layer: "measured".into(),
            hz,
            target_hz: hz,
            energy: 0.003,
            sample: 45952,
            end_sample: 48000,
            ..Default::default()
        });
    }
}

fn warm_streams(scene: &mut Scene, state: &mut Snapshot) {
    for step in 0..120 {
        state.sample = 48000 + step * 768;
        let frame = state.analysis.as_mut().unwrap();
        frame.start = state.sample - 768;
        frame.end = state.sample;
        frame.stream_history = super::fixture_history::recording(frame.end).into();
        for link in &mut frame.contributions {
            link.sample = state.sample - 768;
            link.end_sample = state.sample;
        }
        scene.build(state);
    }
}

pub(super) fn svg(
    vertices: &[Vertex],
    strokes: &[crate::visualizer::mesh::Stroke],
    surface: &crate::visualizer::mesh::Surface,
    transform: [f32; 16],
) -> String {
    let mut output = String::from("<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080'><rect width='1920' height='1080' fill='#030507'/>");
    for triangle in vertices
        .as_chunks::<3>()
        .0
        .iter()
        .filter(|t| t[0].position[3] >= 0.0)
    {
        polygon(&mut output, triangle, transform);
    }
    for indices in surface.indices.chunks_exact(3) {
        let triangle = indices
            .iter()
            .map(|&i| surface.vertices[i as usize])
            .collect::<Vec<_>>();
        polygon(&mut output, &triangle, transform);
    }
    for stroke in strokes {
        svg_stroke(&mut output, stroke, transform);
    }
    for triangle in vertices
        .as_chunks::<3>()
        .0
        .iter()
        .filter(|t| t[0].position[3] == -1.0)
    {
        polygon(&mut output, triangle, transform);
    }
    output.push_str("<text x='1100' y='1068' fill='gray' font-size='10'>DETERMINISTIC GEOMETRY FIXTURE - UNLIT PREVIEW WITHOUT TEXTURES, NOT GPU VERIFICATION</text></svg>");
    output
}

fn svg_stroke(output: &mut String, stroke: &crate::visualizer::mesh::Stroke, transform: [f32; 16]) {
    let project = |p: [f32; 4]| {
        let p = [p[0], p[1], p[2], 1.0];
        let clip: [f32; 4] =
            std::array::from_fn(|r| (0..4).map(|c| transform[c * 4 + r] * p[c]).sum());
        [
            (clip[0] / clip[3] + 1.0) * 960.0,
            (clip[1] / clip[3] + 1.0) * 540.0,
        ]
    };
    let [a, b] = [project(stroke.a), project(stroke.b)];
    let c = stroke.color;
    output.push_str(&format!("<line x1='{}' y1='{}' x2='{}' y2='{}' stroke='rgb({},{},{})' stroke-opacity='{}' stroke-width='{}' stroke-linecap='round'/>",
        a[0],a[1],b[0],b[1],(c[0]*255.0) as u8,(c[1]*255.0) as u8,(c[2]*255.0) as u8,c[3],stroke.a[3]));
}

fn polygon(output: &mut String, triangle: &[Vertex], transform: [f32; 16]) {
    let points = triangle
        .iter()
        .map(|vertex| {
            let p = [
                vertex.position[0],
                vertex.position[1],
                vertex.position[2],
                1.0,
            ];
            let projected: [f32; 4] = if vertex.position[3] < 0.0 {
                [p[0], p[1], p[2], 1.0]
            } else {
                std::array::from_fn(|row| {
                    (0..4)
                        .map(|column| transform[column * 4 + row] * p[column])
                        .sum()
                })
            };
            format!(
                "{:.2},{:.2}",
                (projected[0] / projected[3] + 1.0) * 960.0,
                (projected[1] / projected[3] + 1.0) * 540.0
            )
        })
        .collect::<Vec<_>>()
        .join(" ");
    let color = triangle[0].color;
    output.push_str(&format!(
        "<polygon points='{points}' fill='rgb({},{},{})' fill-opacity='{}'/>",
        (color[0] * 255.0) as u8,
        (color[1] * 255.0) as u8,
        (color[2] * 255.0) as u8,
        color[3]
    ));
}

#[test]
fn both_modes_build_bounded_finite_identical_facts() {
    let mut snapshot = snapshot();
    let original = snapshot.analysis.as_ref().unwrap().cells.clone();
    for immersive in [false, true] {
        snapshot.view.immersive = immersive;
        let mut scene = Scene::new();
        warm_streams(&mut scene, &mut snapshot);
        let vertices = scene.build(&snapshot);
        assert!(vertices.len() > 1000 && vertices.len() < super::super::mesh::CAPACITY);
        assert!(vertices.iter().all(|v| v
            .position
            .iter()
            .chain(v.color.iter())
            .all(|x| x.is_finite())));
        assert_eq!(snapshot.analysis.as_ref().unwrap().cells, original);
        if let Ok(directory) = std::env::var("NOVA_CAPTURE_DIR") {
            let file = format!(
                "{directory}/{}.svg",
                if immersive { "immersive" } else { "precise" }
            );
            std::fs::write(
                file,
                svg(
                    &scene.mesh.vertices,
                    &scene.mesh.strokes,
                    &scene.mesh.surface,
                    Camera.matrix(&snapshot.view, 1920, 1080),
                ),
            )
            .unwrap();
        }
    }
}

#[test]
fn hud_is_screen_anchored_while_world_has_depth_and_orbits() {
    let mut state = snapshot();
    let mut scene = Scene::new();
    let a = scene.build(&state).to_vec();
    state.view.yaw = 0.9;
    state.view.pitch = 0.6;
    let b = scene.build(&state).to_vec();
    let hud_a: Vec<_> = a
        .iter()
        .filter(|v| v.position[3] < 0.0)
        .map(|v| (v.position, v.color))
        .collect();
    let hud_b: Vec<_> = b
        .iter()
        .filter(|v| v.position[3] < 0.0)
        .map(|v| (v.position, v.color))
        .collect();
    assert!(!hud_a.is_empty());
    assert_eq!(hud_a, hud_b);
    assert!(a
        .iter()
        .any(|v| v.position[3] > 0.0 && v.position[2] < -4.0));
    assert!(a.iter().any(|v| v.position[3] > 0.0 && v.position[2] > 6.0));
    assert!(hud_a
        .iter()
        .all(|(p, _)| p[0].abs() <= 1.001 && p[1].abs() <= 1.001));
}

#[test]
#[ignore = "release-only CPU geometry diagnostic, not GPU frame timing"]
fn geometry_cpu_budget() {
    let mut state = snapshot();
    let mut scene = Scene::new();
    for immersive in [false, true] {
        state.view.immersive = immersive;
        warm_streams(&mut scene, &mut state);
        let mut times = Vec::new();
        for _ in 0..240 {
            let start = std::time::Instant::now();
            let count = scene.build(&state).len();
            std::hint::black_box(count);
            times.push(start.elapsed().as_micros());
        }
        times.sort_unstable();
        println!(
            "{} CPU geometry p95={}us p99={}us (fixture, not GPU)",
            if immersive { "immersive" } else { "precise" },
            times[228],
            times[237]
        );
    }
}

#[test]
fn branded_controls_overlay_is_bounded_and_keeps_logo_uvs_in_both_aspects() {
    let state = snapshot();
    let input = crate::native_input::Status {
        menu_open: true,
        octave: 4,
        instrument: 0,
        focused: true,
        pending: 0,
        error: None,
    };
    for size in [[1920, 1080], [960, 1080]] {
        let mut scene = Scene::new();
        scene.build_frame(&state, size[0], size[1], &input);
        assert!(!scene.mesh.overflow && !scene.hud.overflow);
        let logo = scene
            .mesh
            .vertices
            .iter()
            .filter(|v| v.position[3] == -2.0)
            .collect::<Vec<_>>();
        assert_eq!(logo.len(), 6);
        assert!(logo
            .iter()
            .all(|v| v.color[..2].iter().all(|uv| (0.0..=1.0).contains(uv))));
        assert!(scene
            .mesh
            .vertices
            .iter()
            .filter(|v| v.position[3] < 0.0)
            .all(|v| v.position[0].abs() <= 1.001 && v.position[1].abs() <= 1.001));
    }
}
