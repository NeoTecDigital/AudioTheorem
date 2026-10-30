//! Latest-only, cancellable background indexing. No work on the device callback.
use crate::{
    analysis::source,
    audio::{asset::Asset, render::Signals},
    contracts::*,
};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tokio::sync::watch;

pub(super) struct SourceCache {
    assets: watch::Sender<Option<Arc<Asset>>>,
    output: watch::Receiver<Option<Arc<SongIndex>>>,
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl SourceCache {
    pub fn start(priority: Arc<AtomicU64>, signals: Arc<Signals>) -> Result<Self, String> {
        let (assets, receive) = watch::channel(None);
        let (publish, output) = watch::channel(None);
        let stop = Arc::new(AtomicBool::new(false));
        let cancel = stop.clone();
        let thread = std::thread::Builder::new()
            .name("song-index".into())
            .spawn(move || run(receive, publish, priority, signals, cancel))
            .map_err(|e| e.to_string())?;
        Ok(Self {
            assets,
            output,
            stop,
            thread: Some(thread),
        })
    }
    pub fn load(&self, asset: Arc<Asset>) {
        self.assets.send_replace(Some(asset));
    }
    pub fn latest(&self, asset: Option<u64>) -> Option<Arc<SongIndex>> {
        self.output
            .borrow()
            .as_ref()
            .filter(|s| Some(s.asset) == asset)
            .cloned()
    }
}
impl Drop for SourceCache {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
fn run(
    mut assets: watch::Receiver<Option<Arc<Asset>>>,
    publish: watch::Sender<Option<Arc<SongIndex>>>,
    priority: Arc<AtomicU64>,
    signals: Arc<Signals>,
    stop: Arc<AtomicBool>,
) {
    while !stop.load(Ordering::Acquire) && !signals.stop.load(Ordering::Acquire) {
        if !assets.has_changed().unwrap_or(false) {
            std::thread::sleep(Duration::from_millis(10));
            continue;
        }
        let asset = assets.borrow_and_update().clone();
        if let Some(asset) = asset {
            let cancelled = || {
                stop.load(Ordering::Acquire)
                    || signals.stop.load(Ordering::Acquire)
                    || assets.has_changed().unwrap_or(true)
            };
            index(&asset, &publish, &priority, cancelled);
        }
    }
}
fn index(
    asset: &Asset,
    publish: &watch::Sender<Option<Arc<SongIndex>>>,
    priority: &AtomicU64,
    cancelled: impl Fn() -> bool,
) {
    let Some(overview) = source::overview(asset, &cancelled) else {
        return;
    };
    let hop = (asset.rate as u64 * SONG_HOP_MS as u64 / 1000).max(1);
    let count = asset.frames.len().div_ceil(hop as usize);
    let mut result = SongIndex {
        model_version: crate::analysis::config::MODEL_VERSION,
        asset: asset.id,
        rate: asset.rate,
        frames: asset.frames.len() as u64,
        hop,
        overview: Arc::new(overview),
        tiles: vec![None; count.div_ceil(SONG_TILE_ROWS)],
        ready: 0,
    };
    publish.send_replace(Some(Arc::new(result.clone())));
    let mut analyzer = source::Indexer::new(asset.rate);
    while !cancelled() && result.ready < result.tiles.len() {
        let cursor = priority.load(Ordering::Relaxed) / hop / SONG_TILE_ROWS as u64;
        let tile = next_tile(&result, cursor as usize);
        let Some(rows) = build_tile(asset, &mut analyzer, tile, hop, count, &cancelled) else {
            return;
        };
        result.tiles[tile] = Some(Arc::new(SongTile { rows }));
        result.ready += 1;
        publish.send_replace(Some(Arc::new(result.clone())));
    }
}
fn next_tile(index: &SongIndex, cursor: usize) -> usize {
    index
        .tiles
        .iter()
        .enumerate()
        .filter(|(_, tile)| tile.is_none())
        .min_by_key(|(i, _)| i.abs_diff(cursor))
        .map(|(i, _)| i)
        .unwrap()
}
fn build_tile(
    asset: &Asset,
    analyzer: &mut source::Indexer,
    tile: usize,
    hop: u64,
    count: usize,
    cancelled: &impl Fn() -> bool,
) -> Option<Vec<SongRow>> {
    let first = tile * SONG_TILE_ROWS;
    let mut rows = Vec::with_capacity(SONG_TILE_ROWS);
    for i in first..(first + SONG_TILE_ROWS).min(count) {
        if cancelled() {
            return None;
        }
        let started = Instant::now();
        let end = ((i as u64 + 1) * hop).min(asset.frames.len() as u64) as usize;
        rows.push(analyzer.row(asset, end));
        // At most ~1/3 of one core; bounded sleep keeps replacement/shutdown responsive.
        std::thread::sleep(
            (started.elapsed() * 2).clamp(Duration::from_millis(1), Duration::from_millis(20)),
        );
    }
    Some(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn source_index_is_latest_only_survives_seek_and_stops() {
        let signals = Arc::new(Signals::default());
        let cache = SourceCache::start(Arc::new(AtomicU64::new(0)), signals).unwrap();
        for id in 1..=3 {
            cache.load(Arc::new(Asset {
                id,
                rate: 48000,
                frames: vec![[0.0; 2]; 4800],
            }));
        }
        let start = Instant::now();
        let song = loop {
            if let Some(s) = cache.latest(Some(3)).filter(|s| s.coverage() == 1.0) {
                break s;
            }
            assert!(start.elapsed() < Duration::from_secs(10));
            std::thread::sleep(Duration::from_millis(10));
        };
        assert_eq!(song.frames, 4800);
        assert_eq!(song.overview.last().unwrap().end, 4800);
        assert!(cache.latest(Some(1)).is_none());
        assert!(song.row(4800).is_some());
        assert!(song.row(2400).is_some());
        drop(cache); // joins cancellable worker; snapshots remain valid
        assert_eq!(song.row(4800).unwrap().field.evidence, [0.0; 12]);
    }
}
