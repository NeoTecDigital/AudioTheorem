use super::Render;
use crate::contracts::{SongTransport, MAX_CLIENTS};

pub(super) struct Fade {
    last: [f32; 2],
    tail: [f32; 2],
    left: u32,
    length: u32,
}
impl Fade {
    pub fn new(rate: u32) -> Self {
        Self {
            last: [0.0; 2],
            tail: [0.0; 2],
            left: 0,
            length: (rate / 200).max(1),
        }
    }
    pub fn reset(&mut self) {
        self.tail = self.last;
        self.left = self.length;
    }
    pub fn silence(&mut self) {
        self.last = [0.0; 2];
        self.tail = [0.0; 2];
        self.left = 0;
    }
    fn sample(&mut self, value: [f32; 2]) -> [f32; 2] {
        let t = self.left as f32 / self.length as f32;
        self.left = self.left.saturating_sub(1);
        self.last = std::array::from_fn(|c| self.tail[c] * t + value[c] * (1.0 - t));
        self.last
    }
}
impl Render {
    pub(super) fn transport(&mut self, client: u64, t: SongTransport) -> Result<(), &'static str> {
        let Some(asset) = self.asset.as_ref().filter(|a| a.id == t.asset) else {
            return Err("transport asset replaced or unavailable");
        };
        if t.frame > asset.frames.len() as u64 {
            return Err("transport beyond asset end");
        }
        let slot = &mut self.transport_generations[client as usize % MAX_CLIENTS];
        if slot.0 == client && slot.1 == t.asset && slot.2 >= t.generation {
            return Err("superseded transport generation");
        }
        *slot = (client, t.asset, t.generation);
        self.fade.reset();
        self.position = t.frame as usize;
        self.playing = t.playing && self.position < asset.frames.len();
        self.discontinuity();
        Ok(())
    }
    pub(super) fn seek(&mut self, seconds: f64) {
        if let Some(asset) = &self.asset {
            self.position = ((seconds * asset.rate as f64) as usize).min(asset.frames.len());
        }
        self.fade.reset();
        self.discontinuity();
    }
    pub(super) fn file_sample(&mut self) -> [f32; 2] {
        let frame = self.next_file_frame();
        self.fade.sample(frame.map(|v| v * self.synth.gain()))
    }
    fn next_file_frame(&mut self) -> [f32; 2] {
        if !self.playing {
            return [0.0; 2];
        }
        let Some(asset) = &self.asset else {
            return [0.0; 2];
        };
        let Some(frame) = asset.frames.get(self.position) else {
            self.playing = false;
            return [0.0; 2];
        };
        self.position += 1;
        *frame
    }
}
