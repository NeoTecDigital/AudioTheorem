//! Immutable source previews: asset time, never evidence of audible output.
use super::{Field, SpectrumSlice, WavePoint};
use std::sync::Arc;

pub const SONG_TILE_ROWS: usize = 32;
pub const SONG_OVERVIEW_POINTS: usize = 2048;
pub const SONG_HOP_MS: u32 = 50;

#[derive(Clone, Debug)]
pub struct SongRow {
    pub spectrum: SpectrumSlice,
    pub field: Field,
}
#[derive(Clone, Debug, Default)]
pub struct SongTile {
    pub rows: Vec<SongRow>,
}
#[derive(Clone, Debug, Default)]
pub struct SongIndex {
    pub model_version: u32,
    pub asset: u64,
    pub rate: u32,
    pub frames: u64,
    pub hop: u64,
    pub overview: Arc<Vec<WavePoint>>,
    pub tiles: Vec<Option<Arc<SongTile>>>,
    pub ready: usize,
}

impl SongIndex {
    pub fn row(&self, frame: u64) -> Option<&SongRow> {
        let hop = self.hop.max(1);
        let count = if frame == self.frames {
            frame.div_ceil(hop)
        } else {
            frame / hop
        };
        let index = count.checked_sub(1)?;
        self.tiles
            .get(index as usize / SONG_TILE_ROWS)?
            .as_ref()?
            .rows
            .get(index as usize % SONG_TILE_ROWS)
    }
    pub fn coverage(&self) -> f32 {
        self.ready as f32 / self.tiles.len().max(1) as f32
    }
}

/// Asset-scoped atomic transport. Generation is strictly increasing per client/asset.
#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SongTransport {
    pub asset: u64,
    pub frame: u64,
    pub generation: u64,
    pub playing: bool,
}
