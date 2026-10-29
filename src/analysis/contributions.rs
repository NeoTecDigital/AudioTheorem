use super::{config, theory};
use crate::contracts::{Contribution, PcmBlock, SpectrumPoint};

pub fn logical(block: &PcmBlock) -> Vec<Contribution> {
    block
        .voices
        .iter()
        .filter(|v| v.amplitude > 1e-6 && v.hz > 0.0)
        .map(|v| Contribution {
            layer: "logical".into(),
            source: v.voice,
            client: Some(v.client),
            hz: v.hz,
            target_hz: v.hz,
            energy: v.amplitude.powi(2),
            sample: block.start,
            end_sample: block.start + block.len as u64,
            ratio: 1.0,
            cents: theory::pitch(v.hz).map_or(0.0, |(_, cents)| cents),
        })
        .collect()
}

pub fn finish(
    mut links: Vec<Contribution>,
    block: &PcmBlock,
    spectrum: &[SpectrumPoint],
    rate: u32,
) -> Vec<Contribution> {
    if block.processing {
        links.push(Contribution {
            layer: "processing".into(),
            sample: block.start,
            end_sample: block.start + block.len as u64,
            energy: 1.0,
            ..Contribution::default()
        });
    }
    let mut bands: Vec<_> = spectrum
        .iter()
        .filter(|p| p.power > config::SILENCE_POWER)
        .collect();
    bands.sort_by(|a, b| b.power.total_cmp(&a.power));
    links.extend(
        bands
            .into_iter()
            .take(config::SPECTRAL_LINKS)
            .map(|p| measured(block, p, rate)),
    );
    for source in logical(block) {
        append_projections(&source, &mut links);
    }
    links.truncate(config::CONTRIBUTION_LIMIT);
    links
}

fn measured(block: &PcmBlock, point: &SpectrumPoint, rate: u32) -> Contribution {
    let window_frames = (rate as f32 / point.resolution_hz).round() as u64;
    // Fits JSON’s exact integer range while retaining resolution + FFT-band identity.
    let source = (window_frames << 32) | (point.hz / point.resolution_hz).round() as u64;
    let window = (rate as f32 / point.resolution_hz).round().max(1.0) as u64;
    let lag = (point.age_samples as u64).saturating_sub(window / 2);
    let end = (block.start + block.len as u64).saturating_sub(lag);
    Contribution {
        layer: "measured".into(),
        source,
        client: None,
        hz: point.hz,
        target_hz: point.hz,
        energy: point.power,
        sample: end.saturating_sub(window),
        end_sample: end,
        ratio: 1.0,
        cents: point.cents,
    }
}

fn append_projections(source: &Contribution, links: &mut Vec<Contribution>) {
    let ratios = (2..=config::MAX_HARMONIC)
        .map(|n| n as f32)
        .chain([0.5, 1.0 / 3.0]);
    for ratio in ratios {
        let hz = source.hz * ratio;
        links.push(Contribution {
            layer: "projected".into(),
            source: source.source,
            client: source.client,
            hz: source.hz,
            target_hz: hz,
            // Illustrative salience, deliberately NOT measured spectral power.
            energy: source.energy / ratio.max(1.0 / ratio),
            sample: source.sample,
            end_sample: source.end_sample,
            ratio,
            cents: theory::pitch(hz).map_or(0.0, |(_, cents)| cents),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contracts::VoiceObservation;

    #[test]
    fn projected_relationships_keep_exact_ratios_and_explicit_status() {
        let mut block = PcmBlock {
            len: 256,
            ..PcmBlock::default()
        };
        block.voices[0] = VoiceObservation {
            client: 3,
            voice: 21,
            hz: 440.0,
            amplitude: 1.0,
            ..VoiceObservation::default()
        };
        let links = finish(logical(&block), &block, &[], 48_000);
        assert_eq!(links.len(), 18);
        assert!(links.iter().all(|p| p.layer != "measured"));
        let third = links.iter().find(|p| p.ratio == 3.0).unwrap();
        assert_eq!(third.target_hz, 1320.0);
        assert!((third.cents - 1.955).abs() < 0.01);
        assert_eq!(third.client, Some(3));
        assert_eq!(third.source, 21);
    }

    #[test]
    fn imported_audio_bands_never_gain_performer_identity() {
        let block = PcmBlock {
            len: 256,
            ..PcmBlock::default()
        };
        let spectrum = [SpectrumPoint {
            hz: 440.0,
            power: 0.5,
            resolution_hz: 10.0,
            age_samples: 1024,
            ..SpectrumPoint::default()
        }];
        let links = finish(vec![], &block, &spectrum, 48_000);
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].layer, "measured");
        assert_eq!(links[0].client, None);
        assert!(links[0].source < (1_u64 << 53));
    }
}
