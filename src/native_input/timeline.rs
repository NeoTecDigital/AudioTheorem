//! Local navigation drafts; transport changes are acknowledged engine commands.
use crate::contracts::{Action, Snapshot, SongTransport};

#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct PointerEvent {
    pub kind: u32,
    pub x: f32,
    pub y: f32,
    pub delta: f32,
}
#[derive(Clone, Copy)]
struct Scrub {
    asset: u64,
    frame: u64,
    resume: bool,
}

pub struct Timeline {
    asset: Option<u64>,
    drag: Option<Scrub>,
    pending: Option<(u64, u64)>,
    generation: u64,
    pub follow: bool,
    pub fit: bool,
    pub seconds: f32,
    pub center: u64,
    pub pinned: Option<u8>,
    pub mode: usize,
}
impl Default for Timeline {
    fn default() -> Self {
        Self {
            asset: None,
            drag: None,
            pending: None,
            generation: 0,
            follow: true,
            fit: false,
            seconds: 12.0,
            center: 0,
            pinned: None,
            mode: 0,
        }
    }
}
impl Timeline {
    pub fn sync(&mut self, state: &Snapshot) {
        if self.asset != state.asset {
            self.cancel();
            self.asset = state.asset;
            self.follow = true;
            self.fit = false;
            self.center = 0;
        }
        if self.follow && !self.inspecting() {
            self.center = state.playback_frame;
        }
    }
    pub fn cursor(&self, state: &Snapshot) -> u64 {
        self.drag
            .map(|s| s.frame)
            .or(self.pending.map(|p| p.1))
            .unwrap_or(state.playback_frame)
    }
    pub fn inspecting(&self) -> bool {
        self.drag.is_some() || self.pending.is_some()
    }
    pub fn range(&self, state: &Snapshot) -> (u64, u64) {
        let total = (state.duration_seconds * state.device.sample_rate as f64).round() as u64;
        if self.fit {
            return (0, total);
        }
        let span = (self.seconds * state.device.sample_rate as f32) as u64;
        let center = if self.inspecting() {
            self.cursor(state)
        } else {
            self.center
        };
        let start = center
            .saturating_sub(span / 2)
            .min(total.saturating_sub(span));
        (start, (start + span).min(total))
    }
    pub fn cancel(&mut self) -> bool {
        let active = self.inspecting();
        self.drag = None;
        self.pending = None;
        active
    }
    pub fn acknowledge(&mut self, generation: u64) {
        if self.pending.is_some_and(|p| p.0 == generation) {
            self.pending = None;
        }
    }
    pub fn toggle(&mut self, state: &Snapshot) -> Option<Action> {
        if self.inspecting() {
            return None;
        }
        self.transport(state.asset?, state.playback_frame, !state.playing)
    }
    fn transport(&mut self, asset: u64, frame: u64, playing: bool) -> Option<Action> {
        self.generation += 1;
        self.pending = Some((self.generation, frame));
        Some(Action::Transport {
            transport: SongTransport {
                asset,
                frame,
                generation: self.generation,
                playing,
            },
        })
    }
    pub fn pointer(
        &mut self,
        e: PointerEvent,
        state: &Snapshot,
        width: f32,
    ) -> (bool, Option<Action>) {
        if ![e.x, e.y, e.delta].iter().all(|v| v.is_finite()) {
            return (true, None);
        }
        let [x, y] = [e.x * width, (1.0 - e.y) * 720.0];
        if self.drag.is_some() {
            return (true, self.drag_event(e.kind, x, width, state));
        }
        if (18.0..242.0).contains(&x) && (330.0..610.0).contains(&y) {
            self.compass(e.kind, x, y);
            return (true, None);
        }
        if state.asset.is_none() || !(110.0..184.0).contains(&y) {
            return (false, None);
        }
        if e.kind == 4 {
            self.seconds = (self.seconds * 0.8_f32.powf(e.delta)).clamp(0.5, 600.0);
            self.fit = false;
            return (true, None);
        }
        if e.kind != 1 || self.pending.is_some() {
            return (true, None);
        }
        if y >= 154.0 {
            return (true, self.button(x, state));
        }
        self.drag = Some(Scrub {
            asset: state.asset.unwrap(),
            frame: frame_at(x, width, state),
            resume: state.playing,
        });
        (true, Some(Action::Playback { playing: false }))
    }
    fn drag_event(&mut self, kind: u32, x: f32, width: f32, state: &Snapshot) -> Option<Action> {
        let scrub = self.drag.as_mut()?;
        if kind == 2 || kind == 3 {
            scrub.frame = frame_at(x, width, state);
        }
        if kind != 3 {
            return None;
        }
        let scrub = self.drag.take()?;
        self.center = scrub.frame;
        self.transport(scrub.asset, scrub.frame, scrub.resume)
    }
    fn button(&mut self, x: f32, state: &Snapshot) -> Option<Action> {
        match x as u32 {
            18..=94 => return self.toggle(state),
            100..=188 => {
                self.fit = !self.fit;
            }
            194..=282 => {
                self.follow = !self.follow;
                self.center = state.playback_frame;
            }
            288..=330 => {
                self.seconds = (self.seconds * 1.5).min(600.0);
                self.fit = false;
            }
            336..=378 => {
                self.seconds = (self.seconds / 1.5).max(0.5);
                self.fit = false;
            }
            _ => {}
        }
        None
    }
    fn compass(&mut self, kind: u32, x: f32, y: f32) {
        if kind != 1 {
            return;
        }
        if y < 368.0 {
            self.mode = (self.mode + 1) % 7;
            return;
        }
        let [dx, dy] = [x - 130.0, y - 490.0];
        if dx.hypot(dy) < 25.0 {
            self.pinned = None;
            return;
        }
        if !(25.0..=92.0).contains(&dx.hypot(dy)) {
            return;
        }
        let angle = dx.atan2(dy).rem_euclid(std::f32::consts::TAU);
        let sector = (angle * 12.0 / std::f32::consts::TAU).round() as usize % 12;
        self.pinned = Some(crate::analysis::compass::FIFTHS[sector]);
    }
}
pub fn hud_width(size: [u32; 2]) -> f32 {
    (720.0 * size[0].max(1) as f32 / size[1].max(1) as f32).max(960.0)
}
fn frame_at(x: f32, width: f32, state: &Snapshot) -> u64 {
    let fraction = ((x - 18.0) / (width - 36.0)).clamp(0.0, 1.0);
    (fraction as f64 * state.duration_seconds * state.device.sample_rate as f64).round() as u64
}
#[cfg(test)]
mod tests;

/// Preserve square HUD units in narrow windows; top and bottom panels stay anchored.
pub fn hud_height(size: [u32; 2]) -> f32 {
    hud_width(size) * size[1].max(1) as f32 / size[0].max(1) as f32
}
pub fn pointer_y(y: f32, size: [u32; 2]) -> f32 {
    let height = hud_height(size);
    let mut logical = (1.0 - y) * height;
    if logical >= height - 390.0 {
        logical -= height - 720.0;
    }
    1.0 - logical / 720.0
}
