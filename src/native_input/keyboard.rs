use crate::contracts::Action;

/// SDL physical scancodes, matching the browser's two-octave typing layout.
const NOTES: [u32; 25] = [
    29, 22, 27, 7, 6, 25, 10, 5, 11, 17, 13, 16, 20, 31, 26, 32, 8, 21, 34, 23, 35, 28, 36, 24, 12,
];

#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct KeyEvent {
    pub scancode: u32,
    pub down: u32,
    pub modifiers: u32,
}

pub struct Keyboard {
    held: [Option<u64>; 25],
    next_voice: u64,
    pub octave: u8,
    pub instrument: u8,
}

impl Default for Keyboard {
    fn default() -> Self {
        Self {
            held: [None; 25],
            next_voice: 0,
            octave: 4,
            instrument: 0,
        }
    }
}

impl Keyboard {
    pub fn forget(&mut self) {
        self.held.fill(None);
    }

    pub fn event(&mut self, key: KeyEvent) -> Option<Action> {
        // Releases never depend on modifiers or current octave/instrument.
        if key.down == 0 {
            let index = NOTES.iter().position(|&code| code == key.scancode)?;
            return self.held[index]
                .take()
                .map(|voice| Action::Release { voice });
        }
        if key.scancode == 41 {
            self.forget();
            return Some(Action::Panic);
        }
        if key.modifiers & 0x0fc0 != 0 {
            return None;
        } // Ctrl/Alt/GUI, not Shift.
        match key.scancode {
            47 => {
                self.octave = self.octave.saturating_sub(1);
                return None;
            }
            48 => {
                self.octave = (self.octave + 1).min(6);
                return None;
            }
            58..=63 => {
                self.instrument = (key.scancode - 58) as u8;
                return None;
            }
            _ => {}
        }
        let index = NOTES.iter().position(|&code| code == key.scancode)?;
        if self.held[index].is_some() {
            return None;
        }
        self.next_voice += 1;
        self.held[index] = Some(self.next_voice);
        let midi = (self.octave as usize + 1) * 12 + index;
        Some(Action::Start {
            voice: self.next_voice,
            hz: 440.0 * 2.0_f32.powf((midi as f32 - 69.0) / 12.0),
            velocity: 0.7,
            instrument: self.instrument,
        })
    }
}
