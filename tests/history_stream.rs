use nova_daw::{
    analysis::Analyzer,
    contracts::{PcmBlock, HISTORY_PCM_POINTS, HISTORY_ROWS},
};

fn block(start: u64, epoch: u64) -> PcmBlock {
    let mut block = PcmBlock {
        start,
        epoch,
        len: 256,
        ..Default::default()
    };
    for (i, point) in block.pcm.iter_mut().enumerate() {
        let wave = ((start + i as u64) as f32 * 0.02).sin() * 0.5;
        *point = [wave, -wave * 0.7];
    }
    block
}

#[test]
fn history_survives_unobserved_frames_but_never_crosses_gaps_or_epochs() {
    let mut analyzer = Analyzer::new(48000);
    let mut latest = None;
    for start in (0..48000).step_by(256) {
        latest = analyzer.push(&block(start, 1)).or(latest);
    }
    let recorded = latest.unwrap().stream_history;
    assert!(recorded.spectrum.len() > 10 && recorded.pcm.len() > 10);
    assert_eq!(recorded.start, 0);
    let mut next = None;
    for start in (96000..98048).step_by(256) {
        next = analyzer.push(&block(start, 2)).or(next);
    }
    let frame = next.unwrap();
    assert_eq!(frame.stream_history.epoch, 2);
    assert!(frame.stream_history.start >= 96000);
    assert!(frame
        .stream_history
        .spectrum
        .iter()
        .all(|s| s.sample >= 96000));
    assert_eq!(recorded.start, 0); // Already published immutable history stays immutable.
}

#[test]
#[ignore = "release-only 32-second virtual analysis diagnostic, not hardware soak"]
fn history_analysis_budget() {
    let mut analyzer = Analyzer::new(48000);
    let mut timings = Vec::new();
    for start in (0..48000 * 32).step_by(256) {
        let block = block(start, 1);
        let at = std::time::Instant::now();
        if let Some(frame) = analyzer.push(&block) {
            timings.push(at.elapsed().as_micros());
            assert!(frame.stream_history.pcm.len() <= HISTORY_ROWS);
            assert!(
                frame
                    .stream_history
                    .pcm
                    .iter()
                    .map(|s| s.points.len())
                    .sum::<usize>()
                    <= HISTORY_PCM_POINTS
            );
        }
    }
    timings.sort_unstable();
    println!(
        "32s virtual analysis + history: {} frames, p95={}us p99={}us",
        timings.len(),
        timings[timings.len() * 95 / 100],
        timings[timings.len() * 99 / 100]
    );
}
