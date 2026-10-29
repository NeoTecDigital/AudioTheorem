use super::*;

fn samples(count: usize) -> Vec<[f32; 2]> {
    (0..count)
        .map(|i| [(i % 31) as f32 / 31.0 - 0.5, (i % 17) as f32 / 17.0 - 0.5])
        .collect()
}

fn assert_actual(points: &[WavePoint], pcm: &[[f32; 2]], origin: u64) {
    for point in points {
        let slice = &pcm[(point.start - origin) as usize..(point.end - origin) as usize];
        for channel in 0..2 {
            let min = slice
                .iter()
                .map(|s| s[channel])
                .fold(f32::INFINITY, f32::min);
            let max = slice
                .iter()
                .map(|s| s[channel])
                .fold(f32::NEG_INFINITY, f32::max);
            assert_eq!(point.min[channel], min);
            assert_eq!(point.max[channel], max);
        }
    }
    assert!(points.windows(2).all(|p| p[0].end == p[1].start));
    assert!(points.len() <= 512);
}

#[test]
fn scrubbed_close_zoom_is_signed_sample_exact() {
    let pcm = samples(2048);
    let mut history = PcmHistory::new(48000);
    history.push(10000, &pcm);
    let points = history.waveform_view(512, 127, 303);
    assert_eq!(points.len(), 127);
    assert_eq!(points.first().unwrap().start, 11618);
    assert_eq!(points.last().unwrap().end, 11745);
    assert!(points
        .iter()
        .all(|p| p.end == p.start + 1 && p.min == p.max));
    assert_actual(&points, &pcm, 10000);
}

#[test]
fn medium_zoom_minmax_uses_only_selected_interval() {
    let pcm = samples(8192);
    let mut history = PcmHistory::new(48000);
    history.push(50, &pcm);
    let points = history.waveform_view(512, 1751, 729);
    assert_eq!(points.first().unwrap().start, 5762);
    assert_eq!(points.last().unwrap().end, 7513);
    assert_actual(&points, &pcm, 50);
}

#[test]
fn wide_zoom_merges_cached_extrema_and_exact_edge_fragments() {
    let pcm = samples(200000);
    let mut history = PcmHistory::new(48000);
    history.push(91, &pcm);
    let points = history.waveform_view(512, 150023, 137);
    assert_eq!(points.first().unwrap().start, 49931);
    assert_eq!(points.last().unwrap().end, 199954);
    assert_actual(&points, &pcm, 91);
}

#[test]
fn expired_or_unrecorded_history_never_becomes_fake_zero_samples() {
    let pcm = samples(4000);
    let mut history = PcmHistory::new(100);
    history.push(500, &pcm);
    let clipped = history.waveform_view(512, 4000, 33);
    assert_eq!(clipped.first().unwrap().start, 1500);
    assert_eq!(clipped.last().unwrap().end, 4467);
    assert_actual(&clipped, &pcm, 500);
    assert!(history.waveform_view(512, 50, 3100).is_empty());
    assert!(history.waveform_view(512, 0, 0).is_empty());
    history.clear();
    assert!(history.waveform_view(512, 30, 0).is_empty());
}
