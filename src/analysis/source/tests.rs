use super::*;
#[test]
fn source_stereo_extrema_are_exact_and_cancellable() {
    let asset = Asset {
        id: 1,
        rate: 48000,
        frames: (0..9001)
            .map(|i| [i as f32 / 9001.0, -(i as f32) / 9001.0])
            .collect(),
    };
    let points = overview(&asset, || false).unwrap();
    assert!(points.len() <= SONG_OVERVIEW_POINTS);
    assert_eq!(points[0].start, 0);
    assert_eq!(points.last().unwrap().end, 9001);
    for p in points {
        let frames = &asset.frames[p.start as usize..p.end as usize];
        assert_eq!(p.min, [frames[0][0], frames.last().unwrap()[1]]);
        assert_eq!(p.max, [frames.last().unwrap()[0], frames[0][1]]);
    }
    assert!(overview(&asset, || true).is_none());
}
#[test]
fn source_spectrum_uses_real_stereo_and_does_not_invent_performed_notes() {
    let asset = Asset {
        id: 1,
        rate: 48000,
        frames: (0..48000)
            .map(|i| {
                let s = (std::f32::consts::TAU * 440.0 * i as f32 / 48000.0).sin();
                [s, -s]
            })
            .collect(),
    };
    let row = Indexer::new(asset.rate).row(&asset, 48000);
    let peak = row
        .spectrum
        .bands
        .iter()
        .max_by(|a, b| a.power.total_cmp(&b.power))
        .unwrap();
    assert!((peak.hz - 440.0).abs() < 0.5);
    assert!(row.field.evidence[9] > 0.9);
    assert_eq!(row.spectrum.age_samples, [1024, 4096, 16384]);
    assert!(row.spectrum.bands.len() <= HISTORY_BANDS);
}
#[test]
fn missing_tiles_remain_missing_and_snapshots_share_storage() {
    let mut index = SongIndex {
        hop: 2400,
        frames: 48000,
        tiles: vec![None],
        ..Default::default()
    };
    assert!(index.row(2400).is_none());
    index.tiles[0] = Some(std::sync::Arc::new(SongTile {
        rows: vec![SongRow {
            spectrum: SpectrumSlice {
                sample: 2400,
                ..Default::default()
            },
            field: Field::default(),
        }],
    }));
    let copy = index.clone();
    assert!(std::sync::Arc::ptr_eq(
        index.tiles[0].as_ref().unwrap(),
        copy.tiles[0].as_ref().unwrap()
    ));
    assert_eq!(index.row(2400).unwrap().spectrum.sample, 2400);
    assert!(index.row(4800).is_none());
}
