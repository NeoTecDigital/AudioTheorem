use super::{config, field, theory::Memberships};
use crate::contracts::{CadenceEvent, CadenceState, Field};

pub struct CadenceTrace {
    context: [f32; 12],
    context_age: f32,
    fast: f32,
    peak: f32,
    peak_sample: u64,
    peak_context: [f32; 12],
    peak_reference: f32,
    settling: f32,
    destination: Option<u8>,
    events: Vec<CadenceEvent>,
    rate: f32,
}

impl CadenceTrace {
    pub fn new(rate: u32) -> Self {
        Self {
            context: [0.0; 12],
            context_age: 0.0,
            fast: 0.0,
            peak: 0.0,
            peak_sample: 0,
            peak_context: [0.5; 12],
            peak_reference: 0.0,
            settling: 0.0,
            destination: None,
            events: Vec::new(),
            rate: rate as f32,
        }
    }

    pub fn update(
        &mut self,
        current: &Field,
        dt: f32,
        sample: u64,
        matrix: &Memberships,
    ) -> (CadenceState, Option<u8>) {
        // Critically, classify new evidence BEFORE updating its context.
        let previous = field::interpret(self.context, matrix);
        let active = current.evidence.iter().sum::<f32>() > config::SILENCE_POWER;
        let raw = 1.0 - field::dot(&current.evidence, &previous.compatibility);
        let before = self.fast;
        self.fast += (1.0 - (-dt / config::FAST_SECONDS).exp()) * (raw - self.fast);
        let reliable = active
            && previous.confidence >= config::CONTEXT_CONFIDENCE
            && self.context_age >= config::CONTEXT_WARMUP_SECONDS;
        let arrival = if reliable {
            self.track(current, &previous, dt, sample)
        } else {
            self.interrupt(sample);
            None
        };
        self.remember(current, dt, active);
        let oldest = sample.saturating_sub((self.rate * 30.0) as u64);
        self.events.retain(|e| e.sample >= oldest);
        let state = CadenceState {
            tension: if active { self.fast } else { 0.0 },
            direction: if active {
                (self.fast - before) / dt.max(1e-6)
            } else {
                0.0
            },
            destination: self.destination,
            settling: (self.settling / config::SETTLE_SECONDS).min(1.0),
            events: self.events.clone(),
        };
        (state, arrival)
    }

    fn track(&mut self, current: &Field, previous: &Field, dt: f32, sample: u64) -> Option<u8> {
        let age = sample.saturating_sub(self.peak_sample) as f32 / self.rate;
        if self.fast >= self.peak || age > config::RESOLUTION_SECONDS {
            self.peak = self.fast;
            self.peak_sample = sample;
            self.peak_context = previous.compatibility;
            self.peak_reference = 1.0 - field::dot(&current.evidence, &self.peak_context);
        }
        let candidate = destination(current, previous);
        // Context adaptation alone is not a new musical arrival. Require the same
        // drop against the frozen peak context as well as the live smoothed trace.
        let reference_tension = 1.0 - field::dot(&current.evidence, &self.peak_context);
        let falling = self.peak >= config::PEAK_MINIMUM
            && self.peak - self.fast >= config::RESOLUTION_DROP
            && self.peak_reference - reference_tension >= config::RESOLUTION_DROP;
        if !falling || candidate.is_none() {
            self.settling = 0.0;
            self.destination = None;
            return None;
        }
        if self.destination != candidate {
            self.settling = 0.0;
        }
        self.destination = candidate;
        self.settling += dt;
        if self.settling < config::SETTLE_SECONDS {
            return None;
        }
        self.complete(sample)
    }

    fn complete(&mut self, sample: u64) -> Option<u8> {
        let root = self.destination?;
        if self.events.len() == config::MAX_CADENCES {
            self.events.remove(0);
        }
        self.events.push(CadenceEvent {
            sample,
            root,
            peak: self.peak,
            arrival: self.fast,
        });
        self.peak = self.fast;
        self.peak_sample = sample;
        self.settling = 0.0;
        self.destination = None;
        Some(root)
    }

    fn interrupt(&mut self, sample: u64) {
        self.peak = self.fast;
        self.peak_sample = sample;
        self.settling = 0.0;
        self.destination = None;
    }

    fn remember(&mut self, current: &Field, dt: f32, active: bool) {
        let keep = (-dt / config::CONTEXT_SECONDS).exp();
        for p in 0..12 {
            self.context[p] = keep * self.context[p] + (1.0 - keep) * current.evidence[p];
        }
        if active {
            self.context_age += dt;
        } else {
            self.context_age = 0.0;
            self.fast = 0.0;
        }
    }
}

fn destination(current: &Field, previous: &Field) -> Option<u8> {
    let support: [f32; 12] =
        std::array::from_fn(|p| current.evidence[p] * previous.compatibility[p]);
    let root = (0..12).max_by(|a, b| support[*a].total_cmp(&support[*b]))?;
    (support[root] >= config::DESTINATION_SUPPORT).then_some(root as u8)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::theory;

    fn run(trace: &mut CadenceTrace, pitch: usize, ticks: usize, start: &mut u64) -> CadenceState {
        let mut evidence = [0.0; 12];
        evidence[pitch] = 1.0;
        let matrix = theory::memberships();
        let field = field::interpret(evidence, &matrix);
        let mut state = CadenceState::default();
        for _ in 0..ticks {
            *start += 480;
            state = trace.update(&field, 0.01, *start, &matrix).0;
        }
        state
    }

    #[test]
    fn resolution_requires_tension_drop_and_half_second_support() {
        let mut trace = CadenceTrace::new(48_000);
        let mut time = 0;
        run(&mut trace, 0, 100, &mut time);
        run(&mut trace, 1, 30, &mut time);
        let early = run(&mut trace, 0, 20, &mut time);
        assert!(early.events.is_empty());
        let settled = run(&mut trace, 0, 70, &mut time);
        assert_eq!(settled.events.len(), 1);
        assert_eq!(settled.events[0].root, 0);
        assert!(settled.events[0].peak - settled.events[0].arrival >= 0.15);
    }

    #[test]
    fn silence_and_unresolved_tension_never_declare_arrival() {
        let mut trace = CadenceTrace::new(48_000);
        let mut time = 0;
        run(&mut trace, 0, 100, &mut time);
        let tense = run(&mut trace, 1, 50, &mut time);
        assert!(tense.events.is_empty());
        let matrix = theory::memberships();
        for _ in 0..100 {
            time += 480;
            let (state, arrival) = trace.update(&Field::default(), 0.01, time, &matrix);
            assert!(arrival.is_none());
            assert!(state.events.is_empty());
            assert_eq!(state.tension, 0.0);
        }
    }

    #[test]
    fn holding_unresolved_note_cannot_resolve_itself_by_context_adaptation() {
        let mut trace = CadenceTrace::new(48_000);
        let mut time = 0;
        run(&mut trace, 0, 1200, &mut time);
        let state = run(&mut trace, 1, 1200, &mut time);
        assert!(state.events.is_empty());
    }
}
