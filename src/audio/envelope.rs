use crate::contracts::Controls;

#[derive(Clone, Copy, Default)]
pub struct Envelope {
    level: f32,
    release_step: f32,
    stage: u8,
}

impl Envelope {
    pub fn start(&mut self) {
        *self = Self {
            stage: 1,
            ..Self::default()
        };
    }

    pub fn release(&mut self, seconds: f32, rate: f32) {
        if self.stage == 0 || self.stage == 4 {
            return;
        }
        self.release_step = self.level / (seconds * rate).max(1.0);
        self.stage = 4;
    }

    pub fn active(&self) -> bool {
        self.stage != 0
    }
    pub fn level(&self) -> f32 {
        self.level
    }

    pub fn next(&mut self, c: &Controls, rate: f32) -> f32 {
        match self.stage {
            1 => {
                self.level = (self.level + 1.0 / (c.attack * rate).max(1.0)).min(1.0);
                if self.level >= 1.0 {
                    self.stage = 2;
                }
            }
            2 => {
                self.level =
                    (self.level - (1.0 - c.sustain) / (c.decay * rate).max(1.0)).max(c.sustain);
                if self.level <= c.sustain {
                    self.stage = 3;
                }
            }
            3 => self.level += (c.sustain - self.level) * 0.002,
            4 => {
                self.level = (self.level - self.release_step).max(0.0);
                if self.level <= 0.000001 {
                    self.stage = 0;
                    self.level = 0.0;
                }
            }
            _ => self.level = 0.0,
        }
        self.level
    }
}
