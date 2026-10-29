use super::*;
use crate::contracts::{VoiceObservation, BLOCK};

fn render(
    analyzer: &mut Analyzer,
    hz: f32,
    partial: f32,
    logical: bool,
    start: u64,
    blocks: usize,
) -> AnalysisFrame {
    let mut frame = None;
    for n in 0..blocks {
        let mut block = PcmBlock {
            start: start + (n * BLOCK) as u64,
            len: BLOCK,
            ..PcmBlock::default()
        };
        if logical {
            block.voices[0] = voice(hz);
        }
        block.pcm = std::array::from_fn(|i| {
            let phase = std::f32::consts::TAU * hz * (block.start + i as u64) as f32 / 48000.0;
            let value = 0.2 * phase.sin() + partial * (phase * 3.0).sin();
            [value, value]
        });
        frame = analyzer.push(&block).or(frame);
    }
    frame.expect("fixture must cross an analysis hop")
}

fn voice(hz: f32) -> VoiceObservation {
    VoiceObservation {
        hz,
        amplitude: 0.8,
        held: true,
        client: 1,
        voice: 9,
        ..VoiceObservation::default()
    }
}

#[test]
fn timbre_changes_measured_not_logical_interpretation() {
    let mut pure = Analyzer::new(48_000);
    let mut rich = Analyzer::new(48_000);
    let a = render(&mut pure, 220.0, 0.0, true, 0, 128);
    let b = render(&mut rich, 220.0, 0.8, true, 0, 128);
    assert_eq!(a.logical.evidence, b.logical.evidence);
    assert_eq!(a.logical.compatibility, b.logical.compatibility);
    assert!(b.measured.evidence[4] > a.measured.evidence[4] + 0.4);
    assert!(b.cells[76] > a.cells[76]);
}

#[test]
fn files_are_measured_only_and_projections_never_become_power() {
    let mut imported = Analyzer::new(48_000);
    let mut played = Analyzer::new(48_000);
    let a = render(&mut imported, 440.0, 0.0, false, 0, 128);
    let b = render(&mut played, 440.0, 0.0, true, 0, 128);
    assert_eq!(a.measured.evidence, b.measured.evidence);
    assert_eq!(a.cells, b.cells);
    assert_eq!(a.logical.evidence, [0.0; 12]);
    assert!(a.contributions.iter().all(|c| c.layer == "measured"));
    assert!(b.contributions.iter().any(|c| c.layer == "projected"));
    assert!(b.contributions.len() <= config::CONTRIBUTION_LIMIT);
}

#[test]
fn discontinuities_clear_history_and_cadence_and_report_gap() {
    let mut analyzer = Analyzer::new(48_000);
    render(&mut analyzer, 220.0, 0.0, true, 0, 128);
    let resumed = render(&mut analyzer, 880.0, 0.0, true, 50_000, 4);
    assert!(resumed.gap);
    assert_eq!(resumed.waveform.first().unwrap().start, 50_000);
    assert!(resumed.logical_cadence.events.is_empty());
    assert!(resumed.measured_cadence.events.is_empty());
    assert_eq!(resumed.age_samples, [u32::MAX; 3]);
    analyzer.reset();
    assert!(analyzer.pcm.recent(1024).is_empty());
}

#[test]
fn out_of_matrix_spectrum_keeps_energy_without_edge_clamping() {
    let points = vec![
        SpectrumPoint {
            hz: 1.0,
            power: 0.4,
            ..SpectrumPoint::default()
        },
        SpectrumPoint {
            hz: 100_000.0,
            power: 0.6,
            ..SpectrumPoint::default()
        },
    ];
    let (evidence, _, cells) = measured_evidence(&points);
    assert_eq!(cells.iter().sum::<f32>(), 0.0);
    assert!((evidence.iter().sum::<f32>() - 1.0).abs() < 1e-6);
}

#[test]
fn noise_is_finite_and_no_default_cadence_is_declared() {
    let mut analyzer = Analyzer::new(48_000);
    let mut seed = 17u32;
    let mut last = None;
    for n in 0..128 {
        let mut block = PcmBlock {
            start: n * BLOCK as u64,
            len: BLOCK,
            ..PcmBlock::default()
        };
        block.pcm = std::array::from_fn(|_| {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            let value = (seed as f32 / u32::MAX as f32 - 0.5) * 0.2;
            [value, value]
        });
        last = analyzer.push(&block).or(last);
    }
    let frame = last.unwrap();
    assert!(frame
        .spectrum
        .iter()
        .all(|p| p.power.is_finite() && p.power >= 0.0));
    assert_eq!(frame.logical.confidence, 0.0);
    assert!(frame.measured_cadence.events.is_empty());
}

#[test]
fn waveform_fidelity_uses_signed_stereo_not_spectral_bins() {
    let mut analyzer = Analyzer::new(48_000);
    let frame = render(&mut analyzer, 440.0, 0.0, false, 0, 8);
    assert_eq!(frame.recent_pcm, analyzer.pcm.recent(1024));
    assert!(frame.recent_pcm.iter().any(|s| s[0] < 0.0));
    assert!(frame.recent_pcm.iter().any(|s| s[0] > 0.0));
    assert_eq!(frame.waveform.last().unwrap().end, frame.end);
    assert_eq!(frame.logical_modes.len(), 84);
    assert_eq!(frame.measured_modes.len(), 84);
}

#[test]
fn epoch_reset_does_not_join_disjoint_pcm_or_temporal_evidence() {
    let mut analyzer = Analyzer::new(48_000);
    render(&mut analyzer, 440.0, 0.0, true, 0, 16);
    let mut result = None;
    for n in 0..4 {
        let block = PcmBlock {
            epoch: 2,
            start: n * BLOCK as u64,
            len: BLOCK,
            pcm: [[-0.25, 0.125]; BLOCK],
            ..PcmBlock::default()
        };
        result = analyzer.push(&block).or(result);
    }
    let frame = result.unwrap();
    assert!(frame.gap);
    assert_eq!(frame.epoch, 2);
    assert_eq!(frame.recent_pcm, vec![[-0.25, 0.125]; 1024]);
    assert_eq!(frame.logical.evidence, [0.0; 12]);
    assert!(frame.logical_cadence.events.is_empty());
}

#[test]
fn silence_suppresses_measured_cadence_despite_long_window_tail() {
    let mut analyzer = Analyzer::new(48_000);
    render(&mut analyzer, 110.0, 0.0, false, 0, 128);
    let mut result = None;
    for n in 0..4 {
        let block = PcmBlock {
            start: 32768 + n * BLOCK as u64,
            len: BLOCK,
            ..PcmBlock::default()
        };
        result = analyzer.push(&block).or(result);
    }
    let frame = result.unwrap();
    assert_eq!(frame.rms, 0.0);
    assert!(frame.spectrum.iter().any(|p| p.power > 1e-4));
    assert_eq!(frame.measured_cadence.tension, 0.0);
    assert_eq!(frame.measured_cadence.destination, None);
    assert!(frame.measured_cadence.events.is_empty());
}

#[test]
fn selecting_history_view_changes_only_waveform_window() {
    let mut full = Analyzer::new(48_000);
    let mut zoom = Analyzer::new(48_000);
    zoom.set_history_view(0.002, 0.005);
    let a = render(&mut full, 440.0, 0.0, true, 0, 16);
    let b = render(&mut zoom, 440.0, 0.0, true, 0, 16);
    assert_eq!(a.recent_pcm, b.recent_pcm);
    assert_eq!(a.cells, b.cells);
    assert_eq!(a.logical.compatibility, b.logical.compatibility);
    assert_eq!(a.measured.compatibility, b.measured.compatibility);
    assert_eq!(b.waveform.len(), 96);
    assert_eq!(b.waveform.first().unwrap().start, b.end - 336);
    assert_eq!(b.waveform.last().unwrap().end, b.end - 240);
    for (i, point) in b.waveform.iter().enumerate() {
        assert_eq!(point.min, a.recent_pcm[1024 - 336 + i]);
        assert_eq!(point.max, point.min);
    }
}

#[test]
fn history_view_clamps_inputs_without_resetting_view_on_analysis_gap() {
    let mut analyzer = Analyzer::new(48_000);
    analyzer.set_history_view(-2.0, 40.0);
    assert_eq!(
        (analyzer.history_seconds, analyzer.history_offset),
        (0.002, 30.0)
    );
    analyzer.reset();
    assert_eq!(
        (analyzer.history_seconds, analyzer.history_offset),
        (0.002, 30.0)
    );
    analyzer.set_history_view(f32::NAN, f32::INFINITY);
    assert_eq!(
        (analyzer.history_seconds, analyzer.history_offset),
        (30.0, 0.0)
    );
}
