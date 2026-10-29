use super::*;
use crate::contracts::{AnalysisFrame, SpectrumPoint};

fn record(end: u64, power: f32) -> AnalysisFrame {
    AnalysisFrame {
        end,
        spectrum: vec![SpectrumPoint {
            hz: 440.0,
            power,
            ..Default::default()
        }],
        ..Default::default()
    }
}

#[test]
fn history_retains_different_measured_frames_not_copies_of_current() {
    let mut pcm = PcmHistory::new(100);
    pcm.push(0, &vec![[0.25, -0.5]; 3000]);
    let mut history = AnalysisHistory::new(100);
    history.push(&record(500, 0.1));
    history.push(&record(2500, 0.9));
    let view = history.stream(&pcm, 7, 30.0, 0.0, 100);
    assert_eq!(view.epoch, 7);
    assert_eq!(
        view.spectrum.iter().map(|s| s.sample).collect::<Vec<_>>(),
        [500, 2500]
    );
    assert_eq!(view.spectrum[0].bands[0].power, 0.1);
    assert_eq!(view.spectrum[1].bands[0].power, 0.9);
    history.clear();
    assert!(history.stream(&pcm, 8, 30.0, 0.0, 100).spectrum.is_empty());
    assert_eq!(view.spectrum[0].bands[0].power, 0.1);
}

#[test]
fn pcm_stream_covers_every_selected_sample_with_exact_signed_stereo_extrema() {
    let mut pcm = PcmHistory::new(48000);
    let data: Vec<_> = (0..72000)
        .map(|i| [(i as f32 * 0.021).sin(), (i as f32 * 0.037).cos()])
        .collect();
    pcm.push(300, &data);
    let history = AnalysisHistory::new(48000);
    let view = history.stream(&pcm, 1, 1.0, 0.25, 48000);
    assert_eq!((view.start, view.end), (12300, 60300));
    let points: Vec<_> = view.pcm.iter().flat_map(|r| &r.points).collect();
    assert_eq!(points.first().unwrap().start, view.start);
    assert_eq!(points.last().unwrap().end, view.end);
    assert!(points.windows(2).all(|pair| pair[0].end == pair[1].start));
    for point in points {
        let samples = &data[(point.start - 300) as usize..(point.end - 300) as usize];
        for channel in 0..2 {
            assert_eq!(
                point.min[channel],
                samples
                    .iter()
                    .map(|s| s[channel])
                    .fold(f32::INFINITY, f32::min)
            );
            assert_eq!(
                point.max[channel],
                samples
                    .iter()
                    .map(|s| s[channel])
                    .fold(f32::NEG_INFINITY, f32::max)
            );
        }
    }
}

#[test]
fn zoom_is_raw_pcm_and_unavailable_history_is_empty() {
    let mut pcm = PcmHistory::new(48000);
    pcm.push(0, &vec![[-0.8, 0.3]; 4800]);
    let history = AnalysisHistory::new(48000);
    let view = history.stream(&pcm, 1, 0.002, 0.0, 48000);
    assert_eq!(view.end - view.start, 96);
    assert!(view
        .pcm
        .iter()
        .flat_map(|r| &r.points)
        .all(|p| p.end - p.start == 1 && p.min == p.max && p.min == [-0.8, 0.3]));
    let missing = history.stream(&pcm, 1, 1.0, 20.0, 48000);
    assert!(missing.pcm.is_empty() && missing.spectrum.is_empty());
}

#[test]
fn row_and_band_limits_are_bounded_and_selection_never_invents_timestamps() {
    let mut history = AnalysisHistory::new(100);
    let mut pcm = PcmHistory::new(100);
    pcm.push(0, &vec![[0.0; 2]; 3000]);
    for time in 1..3000 {
        history.push(&record(time, time as f32));
    }
    let view = history.stream(&pcm, 1, 10.0, 5.0, 100);
    assert!(view.spectrum.len() <= HISTORY_ROWS && view.pcm.len() <= HISTORY_ROWS);
    assert!(view.pcm.iter().map(|s| s.points.len()).sum::<usize>() <= HISTORY_PCM_POINTS);
    assert!(view
        .spectrum
        .iter()
        .all(|s| s.sample >= 1500 && s.sample <= 2500 && s.bands.len() <= HISTORY_BANDS));
    assert!(view.spectrum.windows(2).all(|p| p[0].sample < p[1].sample));
    assert_eq!(history.records.len(), 2048);
}

#[test]
fn native_history_does_not_multiply_browser_json_payload() {
    let mut frame = record(500, 0.5);
    frame.stream_history = StreamHistory {
        epoch: 4,
        start: 100,
        end: 500,
        ..Default::default()
    }
    .into();
    let encoded = serde_json::to_string(&frame).unwrap();
    assert!(!encoded.contains("stream_history"));
    let decoded: AnalysisFrame = serde_json::from_str(&encoded).unwrap();
    assert_eq!(decoded.stream_history.epoch, 0);
}
