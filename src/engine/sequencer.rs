//! DAW Multi-track Pattern Sequencer & Transport

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct SequencerStep {
    pub active: bool,
    pub note: u8,
    pub velocity: f32,
}

impl Default for SequencerStep {
    fn default() -> Self {
        Self {
            active: false,
            note: 60, // C4
            velocity: 0.8,
        }
    }
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct SequencerTrack {
    pub id: usize,
    pub name: String,
    pub steps: Vec<SequencerStep>,
    pub muted: bool,
    pub solo: bool,
    pub volume: f32,
}

impl SequencerTrack {
    pub fn new(id: usize, name: &str, num_steps: usize, default_note: u8) -> Self {
        let steps = (0..num_steps)
            .map(|_| SequencerStep {
                active: false,
                note: default_note,
                velocity: 0.8,
            })
            .collect();

        Self {
            id,
            name: name.to_string(),
            steps,
            muted: false,
            solo: false,
            volume: 0.8,
        }
    }
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct TransportState {
    pub is_playing: bool,
    pub bpm: f32,
    pub current_step: usize,
    pub total_steps: usize,
}

pub struct Sequencer {
    pub tracks: Vec<SequencerTrack>,
    pub is_playing: bool,
    pub bpm: f32,
    pub current_step: usize,
    pub total_steps: usize,
    pub sample_rate: f32,
    pub samples_per_step: f32,
    pub sample_accumulator: f32,
}

impl Sequencer {
    pub fn new(sample_rate: f32, total_steps: usize) -> Self {
        let bpm = 120.0;
        let samples_per_step = (60.0 / (bpm * 4.0)) * sample_rate; // 16th notes

        let tracks = vec![
            SequencerTrack::new(0, "Wavetable Lead", total_steps, 60), // C4
            SequencerTrack::new(1, "Sub Bass", total_steps, 36),       // C2
            SequencerTrack::new(2, "808 Kick", total_steps, 36),       // C2
            SequencerTrack::new(3, "Snare", total_steps, 38),          // D2
            SequencerTrack::new(4, "Hi-Hat", total_steps, 42),         // F#2
            SequencerTrack::new(5, "FM Bell", total_steps, 72),        // C5
        ];

        let mut seq = Self {
            tracks,
            is_playing: false,
            bpm,
            current_step: 0,
            total_steps,
            sample_rate,
            samples_per_step,
            sample_accumulator: 0.0,
        };

        // Load a catchy default rhythm
        seq.load_default_pattern();
        seq
    }

    pub fn set_bpm(&mut self, bpm: f32) {
        self.bpm = bpm.clamp(40.0, 300.0);
        self.samples_per_step = (60.0 / (self.bpm * 4.0)) * self.sample_rate;
    }

    pub fn play(&mut self) {
        self.is_playing = true;
    }

    pub fn pause(&mut self) {
        self.is_playing = false;
    }

    pub fn stop(&mut self) {
        self.is_playing = false;
        self.current_step = 0;
        self.sample_accumulator = 0.0;
    }

    pub fn toggle_step(&mut self, track_id: usize, step_idx: usize, note: Option<u8>, velocity: Option<f32>) {
        if let Some(track) = self.tracks.get_mut(track_id) {
            if let Some(step) = track.steps.get_mut(step_idx) {
                step.active = !step.active;
                if let Some(n) = note {
                    step.note = n;
                }
                if let Some(v) = velocity {
                    step.velocity = v;
                }
            }
        }
    }

    pub fn load_default_pattern(&mut self) {
        // Kick on beats 1, 5, 9, 13 (four-on-the-floor)
        for &step in &[0, 4, 8, 12] {
            if step < self.total_steps {
                self.tracks[2].steps[step].active = true;
            }
        }
        // Snare on beats 4, 12 (backbeat)
        for &step in &[4, 12] {
            if step < self.total_steps {
                self.tracks[3].steps[step].active = true;
            }
        }
        // Hi-hat on every 8th note
        for step in (0..self.total_steps).step_by(2) {
            self.tracks[4].steps[step].active = true;
        }
        // Bassline rhythm
        if self.total_steps >= 16 {
            self.tracks[1].steps[0] = SequencerStep { active: true, note: 36, velocity: 0.9 }; // C2
            self.tracks[1].steps[3] = SequencerStep { active: true, note: 36, velocity: 0.8 };
            self.tracks[1].steps[6] = SequencerStep { active: true, note: 39, velocity: 0.85 }; // Eb2
            self.tracks[1].steps[8] = SequencerStep { active: true, note: 41, velocity: 0.9 }; // F2
            self.tracks[1].steps[11] = SequencerStep { active: true, note: 43, velocity: 0.85 }; // G2
            self.tracks[1].steps[14] = SequencerStep { active: true, note: 41, velocity: 0.8 };
        }
        // Synth melody
        if self.total_steps >= 16 {
            self.tracks[0].steps[2] = SequencerStep { active: true, note: 60, velocity: 0.7 }; // C4
            self.tracks[0].steps[6] = SequencerStep { active: true, note: 63, velocity: 0.75 }; // Eb4
            self.tracks[0].steps[10] = SequencerStep { active: true, note: 65, velocity: 0.8 }; // F4
            self.tracks[0].steps[12] = SequencerStep { active: true, note: 67, velocity: 0.85 }; // G4
        }
    }

    /// Advance sequencer by `num_samples`. Returns list of (track_id, note, velocity) triggered on step change.
    pub fn advance(&mut self, num_samples: usize) -> Option<Vec<(usize, u8, f32)>> {
        if !self.is_playing {
            return None;
        }

        self.sample_accumulator += num_samples as f32;
        if self.sample_accumulator >= self.samples_per_step {
            self.sample_accumulator -= self.samples_per_step;
            self.current_step = (self.current_step + 1) % self.total_steps;

            // Collect notes triggered on this new step
            let mut triggered = Vec::new();
            let step = self.current_step;

            let has_solo = self.tracks.iter().any(|t| t.solo);

            for track in &self.tracks {
                if track.muted || (has_solo && !track.solo) {
                    continue;
                }
                if let Some(s) = track.steps.get(step) {
                    if s.active {
                        triggered.push((track.id, s.note, s.velocity * track.volume));
                    }
                }
            }

            Some(triggered)
        } else {
            None
        }
    }

    pub fn transport_state(&self) -> TransportState {
        TransportState {
            is_playing: self.is_playing,
            bpm: self.bpm,
            current_step: self.current_step,
            total_steps: self.total_steps,
        }
    }
}
