//! ADSR Envelope Generator

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EnvelopeState {
    Idle,
    Attack,
    Decay,
    Sustain,
    Release,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct AdsrConfig {
    pub attack: f32,   // seconds
    pub decay: f32,    // seconds
    pub sustain: f32,  // 0.0 to 1.0
    pub release: f32,  // seconds
}

impl Default for AdsrConfig {
    fn default() -> Self {
        Self {
            attack: 0.01,
            decay: 0.15,
            sustain: 0.7,
            release: 0.25,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Adsr {
    pub config: AdsrConfig,
    sample_rate: f32,
    state: EnvelopeState,
    current_level: f32,
    release_start_level: f32,
}

impl Adsr {
    pub fn new(sample_rate: f32, config: AdsrConfig) -> Self {
        Self {
            config,
            sample_rate,
            state: EnvelopeState::Idle,
            current_level: 0.0,
            release_start_level: 0.0,
        }
    }

    pub fn gate(&mut self, is_on: bool) {
        if is_on {
            self.state = EnvelopeState::Attack;
        } else if self.state != EnvelopeState::Idle {
            self.state = EnvelopeState::Release;
            self.release_start_level = self.current_level;
        }
    }

    pub fn is_active(&self) -> bool {
        self.state != EnvelopeState::Idle
    }

    pub fn state(&self) -> EnvelopeState {
        self.state
    }

    pub fn next_sample(&mut self) -> f32 {
        match self.state {
            EnvelopeState::Idle => 0.0,
            EnvelopeState::Attack => {
                let attack_step = 1.0 / (self.config.attack * self.sample_rate).max(1.0);
                self.current_level += attack_step;
                if self.current_level >= 1.0 {
                    self.current_level = 1.0;
                    self.state = EnvelopeState::Decay;
                }
                self.current_level
            }
            EnvelopeState::Decay => {
                let decay_step = (1.0 - self.config.sustain) / (self.config.decay * self.sample_rate).max(1.0);
                self.current_level -= decay_step;
                if self.current_level <= self.config.sustain {
                    self.current_level = self.config.sustain;
                    self.state = EnvelopeState::Sustain;
                }
                self.current_level
            }
            EnvelopeState::Sustain => {
                self.current_level = self.config.sustain;
                self.current_level
            }
            EnvelopeState::Release => {
                let release_step = (self.release_start_level.max(0.01) / (self.config.release * self.sample_rate).max(1.0)).max(0.00001);
                self.current_level -= release_step;
                if self.current_level <= 0.0001 {
                    self.current_level = 0.0;
                    self.state = EnvelopeState::Idle;
                }
                self.current_level
            }
        }
    }
}
