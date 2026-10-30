//! Shared native menu layout/hit targets. Engine controls are read from acknowledged snapshots.
use super::{timeline::PointerEvent, Status};
use crate::contracts::{Action, Snapshot, View};

pub const INSTRUMENTS: [&str; 6] = ["WAVETABLE", "SINE", "KICK", "SNARE", "HAT", "BELL"];
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Choice {
    Play,
    Gain(f32),
    Sound(i8),
    Octave(i8),
    Immersive(bool),
    Logical,
    Measured,
    Projected,
    Roots,
    Modes,
    Cadence,
    Motion,
    Camera,
    Analysis,
    Panic,
}
pub struct Item {
    pub choice: Choice,
    pub label: String,
    pub rect: [f32; 4],
    pub active: bool,
    pub enabled: bool,
}
#[derive(Default)]
pub struct Menu {
    pub open: bool,
    captured: bool,
}
impl Menu {
    pub fn cancel(&mut self) {
        self.open = false;
        self.captured = false;
    }
    pub fn pointer(
        &mut self,
        event: PointerEvent,
        width: f32,
        items: &[Item],
    ) -> (bool, Option<Choice>) {
        if ![event.x, event.y, event.delta, width]
            .iter()
            .all(|v| v.is_finite())
        {
            return (true, None);
        }
        let x = event.x * width;
        let y = (1.0 - event.y) * 720.0;
        let toggle = contains([width - 150.0, 654.0, 132.0, 25.0], x, y);
        let inside = self.open && contains([width - 344.0, 334.0, 332.0, 316.0], x, y);
        let used = toggle || inside || self.open || self.captured;
        if event.kind == 3 {
            self.captured = false;
        }
        if event.kind != 1 || !used {
            return (used, None);
        }
        self.captured = true;
        if toggle {
            self.open = !self.open;
            return (true, None);
        }
        if !inside {
            self.open = false;
            return (true, None);
        }
        let choice = items
            .iter()
            .find(|i| i.enabled && contains(i.rect, x, y))
            .map(|i| i.choice);
        (true, choice)
    }
}
fn contains([x, y, w, h]: [f32; 4], px: f32, py: f32) -> bool {
    (x..=x + w).contains(&px) && (y..=y + h).contains(&py)
}
fn item(
    choice: Choice,
    label: impl Into<String>,
    width: f32,
    row: u8,
    col: u8,
    span: u8,
    active: bool,
) -> Item {
    Item {
        choice,
        label: label.into(),
        rect: [
            width - 332.0 + col as f32 * 104.0,
            598.0 - row as f32 * 26.0,
            span as f32 * 104.0 - 6.0,
            22.0,
        ],
        active,
        enabled: true,
    }
}
pub fn items(state: &Snapshot, status: &Status<'_>, width: f32) -> Vec<Item> {
    use Choice::*;
    let make = |c, l, r, col, span, on| item(c, l, width, r, col, span, on);
    let mut items = vec![
        make(
            Play,
            if state.playing {
                "PAUSE SONG"
            } else {
                "PLAY SONG"
            },
            0,
            0,
            3,
            state.playing,
        ),
        make(Gain(-0.05), "VOL -", 1, 0, 1, false),
        make(Gain(0.05), "VOL +", 1, 2, 1, false),
        make(Sound(-1), "SOUND <", 2, 0, 1, false),
        make(Sound(1), ">", 2, 2, 1, false),
        make(Octave(-1), "OCTAVE -", 3, 0, 1, false),
        make(Octave(1), "OCTAVE +", 3, 2, 1, false),
        make(Immersive(false), "PRECISE", 4, 0, 1, !state.view.immersive),
        make(Immersive(true), "IMMERSIVE", 4, 1, 2, state.view.immersive),
        make(Logical, "LOGICAL", 5, 0, 1, state.view.logical),
        make(Measured, "MEASURED", 5, 1, 1, state.view.measured),
        make(Projected, "PROJECTED", 5, 2, 1, state.view.projected),
        make(Roots, "ROOTS", 6, 0, 1, state.view.roots),
        make(Modes, "MODES", 6, 1, 1, state.view.modes),
        make(Cadence, "CADENCE", 6, 2, 1, state.view.cadence),
        make(Motion, "REDUCED MOTION", 7, 0, 3, state.view.reduced_motion),
        make(Camera, "RESET CAMERA", 8, 0, 2, false),
        make(Analysis, "RESET FFT", 8, 2, 1, false),
        make(Panic, "PANIC / SILENCE ALL", 9, 0, 3, state.panic),
    ];
    for i in &mut items {
        i.enabled = matches!(i.choice, Sound(_) | Octave(_) | Panic) || status.pending == 0;
        if i.choice == Play {
            i.enabled &= state.asset.is_some();
        }
    }
    items
}
pub fn action(choice: Choice, state: &Snapshot) -> Option<Action> {
    use Choice::*;
    let mut view = state.view;
    match choice {
        Gain(delta) => {
            return Some(Action::Controls {
                controls: crate::contracts::Controls {
                    gain: (state.controls.gain + delta).clamp(0.0, 1.0),
                    ..state.controls
                },
            })
        }
        Analysis => return Some(Action::ResetAnalysis),
        Immersive(value) => view.immersive = value,
        Logical => view.logical = !view.logical,
        Measured => view.measured = !view.measured,
        Projected => view.projected = !view.projected,
        Roots => view.roots = !view.roots,
        Modes => view.modes = !view.modes,
        Cadence => view.cadence = !view.cadence,
        Motion => view.reduced_motion = !view.reduced_motion,
        Camera => {
            let defaults = View::default();
            view.yaw = defaults.yaw;
            view.pitch = defaults.pitch;
            view.distance = defaults.distance;
        }
        _ => return None,
    }
    Some(Action::View { view })
}

#[cfg(test)]
mod tests;
