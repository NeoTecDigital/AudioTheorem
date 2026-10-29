//! Explicit synthetic recording for software geometry previews, never production history.
use crate::contracts::*;

pub(super) fn recording(end: u64) -> StreamHistory {
    let start = end.saturating_sub(48000);
    let mut result = StreamHistory {
        epoch: 1,
        start,
        end,
        ..Default::default()
    };
    for index in 0..48 {
        let from = start + (end - start) * index / 48;
        let to = start + (end - start) * (index + 1) / 48;
        result.pcm.push(pcm(from, to, index));
        result.spectrum.push(spectrum(to, index));
    }
    result
}

fn sample(time: u64, row: u64) -> [f32; 2] {
    let phase = time as f32 * 0.014;
    let level = 0.2 + 0.65 * (row as f32 * 0.13).sin().abs();
    [
        (phase.sin() + 0.3 * (phase * 2.0).sin()) * level,
        (phase * 0.71).cos() * level,
    ]
}

fn pcm(start: u64, end: u64, row: u64) -> PcmSlice {
    let stride = (end - start).div_ceil(64).max(1);
    let points = (start..end)
        .step_by(stride as usize)
        .map(|from| {
            let to = (from + stride).min(end);
            let mut point = WavePoint {
                start: from,
                end: to,
                min: sample(from, row),
                max: sample(from, row),
            };
            for time in from + 1..to {
                let value = sample(time, row);
                point.min = std::array::from_fn(|i| point.min[i].min(value[i]));
                point.max = std::array::from_fn(|i| point.max[i].max(value[i]));
            }
            point
        })
        .collect();
    PcmSlice { start, end, points }
}

fn spectrum(time: u64, row: u64) -> SpectrumSlice {
    let root = 180.0 + row as f32 * 9.0;
    let bands = (0..160)
        .map(|index| {
            let hz = (index as f32 / 159.0 * 24000.0_f32.ln()).exp();
            let power = (1..8)
                .map(|partial| {
                    let center = root * partial as f32;
                    (-(hz / center).ln().powi(2) * 600.0).exp() * 0.02 / (partial * partial) as f32
                })
                .sum::<f32>();
            HistoryBand {
                hz,
                power: power + 1e-10,
            }
        })
        .collect();
    SpectrumSlice {
        sample: time,
        bands,
        compatibility: [0.75; 12],
        confidence: 0.5,
        age_samples: [1024, 4096, 16384],
    }
}
