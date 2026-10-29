use super::{
    envelope::Envelope,
    presets::{self, Preset},
    table::Bank,
};
use crate::contracts::{Controls, VoiceObservation, VOICES};
use std::sync::Arc;

#[derive(Clone, Copy, Default)]
struct Voice {
    info: VoiceObservation,
    envelope: Envelope,
    phase: f64,
    modulation: f64,
    cursor: f64,
    velocity: f32,
    filter: f32,
}

pub struct Synth {
    voices: [Voice; VOICES],
    pub controls: Controls,
    smooth: Controls,
    pub bank: Arc<Bank>,
    previous: Option<Arc<Bank>>,
    fade: f32,
    sine: Bank,
    presets: Vec<Preset>,
    rate: f32,
    lfo: [f64; 2],
    modulation: [f32; 4],
    pub processed: bool,
    decimator: Decimator,
}

impl Synth {
    pub fn new(rate: u32) -> Self {
        Self {
            voices: [Voice::default(); VOICES],
            controls: Controls::default(),
            smooth: Controls::default(),
            bank: Arc::new(Bank::sine()),
            previous: None,
            fade: 1.0,
            sine: Bank::sine(),
            presets: presets::prepare(rate),
            rate: rate as f32,
            lfo: [0.0; 2],
            modulation: [0.0; 4],
            processed: false,
            decimator: Decimator::new(),
        }
    }

    pub fn start(&mut self, info: VoiceObservation) -> Result<(), &'static str> {
        if self.voices.iter().any(|v| {
            v.envelope.active() && v.info.client == info.client && v.info.voice == info.voice
        }) {
            return Err("voice already active");
        }
        let voice = self
            .voices
            .iter_mut()
            .find(|v| !v.envelope.active())
            .ok_or("16 voice limit")?;
        *voice = Voice {
            info,
            velocity: info.amplitude,
            ..Voice::default()
        };
        voice.envelope.start();
        Ok(())
    }

    pub fn release(&mut self, client: u64, id: u64) {
        for v in &mut self.voices {
            if v.info.client != client || v.info.voice != id {
                continue;
            }
            v.info.held = false;
            v.envelope.release(self.controls.release, self.rate * 4.0);
        }
    }

    pub fn disconnect(&mut self, slot: usize, watermark: u64) {
        for v in &mut self.voices {
            if v.info.client as usize % 32 == slot && v.info.client <= watermark {
                *v = Voice::default();
            }
        }
    }

    pub fn panic(&mut self) {
        self.voices = [Voice::default(); VOICES];
        self.decimator.clear();
    }

    pub fn observations(&self) -> [VoiceObservation; VOICES] {
        std::array::from_fn(|i| {
            let v = self.voices[i];
            if !v.envelope.active() {
                return VoiceObservation::default();
            }
            VoiceObservation {
                amplitude: v.envelope.level() * v.velocity,
                ..v.info
            }
        })
    }

    pub fn table(&mut self, table: Arc<Bank>) -> Option<Arc<Bank>> {
        let retired = self.previous.take();
        self.previous = Some(std::mem::replace(&mut self.bank, table));
        self.fade = 0.0;
        retired
    }

    pub fn gain(&self) -> f32 {
        self.smooth.gain
    }

    pub fn sample(&mut self) -> f32 {
        self.processed = false;
        self.smooth_controls();
        for _ in 0..4 {
            let (c, frequency_ratio) = self.modulated();
            let cutoff = c.cutoff.min(self.rate * 0.42);
            let filter_a = 1.0 - (-std::f32::consts::TAU * cutoff / (self.rate * 4.0)).exp();
            let context = VoiceContext {
                controls: &c,
                rate: self.rate,
                bank: &self.bank,
                old: self.previous.as_deref(),
                fade: self.fade,
                sine: &self.sine,
                presets: &self.presets,
                frequency_ratio,
                filter_a,
            };
            let mix: f32 = self
                .voices
                .iter_mut()
                .map(|v| voice_sample(v, &context))
                .sum();
            self.processed |= (mix * c.gain).abs() > 0.98;
            self.decimator.push((mix * c.gain).clamp(-0.98, 0.98));
        }
        self.fade = (self.fade + 1.0 / (self.rate * 0.02)).min(1.0);
        self.decimator.output()
    }

    fn smooth_controls(&mut self) {
        let amount = 1.0 - (-1.0 / (self.rate * 0.01)).exp();
        macro_rules! smooth { ($($f:ident),*) => { $(self.smooth.$f += (self.controls.$f-self.smooth.$f)*amount;)* }; }
        smooth!(gain, attack, decay, sustain, release, cutoff, fm_hz, fm_depth, am_depth, morph);
        self.smooth.lfo_hz = self.controls.lfo_hz;
        self.smooth.lfo_depth = self.controls.lfo_depth;
        self.smooth.lfo_destination = self.controls.lfo_destination;
    }

    fn modulated(&mut self) -> (Controls, f32) {
        let mut c = self.smooth;
        let mut destinations = [0.0; 4];
        for i in 0..2 {
            self.lfo[i] = (self.lfo[i] + c.lfo_hz[i] as f64 / (self.rate as f64 * 4.0)).fract();
            let value = self.sine.sample(self.lfo[i], 1) * c.lfo_depth[i];
            destinations[c.lfo_destination[i] as usize] += value;
        }
        for (smoothed, target) in self.modulation.iter_mut().zip(destinations) {
            *smoothed += (target - *smoothed) * 0.001;
        }
        let m = self.modulation;
        c.gain *= (1.0 - m[1].abs() * 0.5).max(0.0);
        c.morph = (c.morph + m[2]).clamp(0.0, 1.0);
        c.cutoff = (c.cutoff * (1.0 + m[3] * 0.45)).clamp(20.0, 20000.0);
        (c, 1.0 + m[0] * 0.02)
    }
}

struct VoiceContext<'a> {
    controls: &'a Controls,
    rate: f32,
    bank: &'a Bank,
    old: Option<&'a Bank>,
    fade: f32,
    sine: &'a Bank,
    presets: &'a [Preset],
    frequency_ratio: f32,
    filter_a: f32,
}

fn voice_sample(v: &mut Voice, context: &VoiceContext<'_>) -> f32 {
    if !v.envelope.active() {
        return 0.0;
    }
    let env = v.envelope.next(context.controls, context.rate * 4.0) * v.velocity;
    let sample = if v.info.instrument >= 2 {
        preset_sample(v, &context.presets[(v.info.instrument - 2) as usize])
    } else {
        oscillator(v, context)
    };
    v.filter += context.filter_a * (sample - v.filter);
    v.filter * env
}

fn oscillator(v: &mut Voice, context: &VoiceContext<'_>) -> f32 {
    let c = context.controls;
    let rate = context.rate;
    v.modulation = (v.modulation + c.fm_hz as f64 / (rate as f64 * 4.0)).fract();
    let modulator = context.sine.sample(v.modulation, 1);
    let base = v.info.hz * context.frequency_ratio;
    let hz = base + c.fm_depth * modulator;
    v.phase = (v.phase + hz as f64 / (rate as f64 * 4.0)).rem_euclid(1.0);
    let guard = if c.fm_depth > 0.01 || c.am_depth > 0.01 {
        c.fm_hz * 8.0
    } else {
        0.0
    };
    let limit = ((rate * 0.40 - guard).max(base) / (base + c.fm_depth).max(1.0)).max(1.0);
    let mut wave = context.bank.blend_sample(v.phase, limit);
    if context.fade < 1.0 {
        wave = context.old.map_or(wave, |b| {
            b.blend_sample(v.phase, limit) * (1.0 - context.fade) + wave * context.fade
        });
    }
    let morph = if v.info.instrument == 1 { 1.0 } else { c.morph };
    wave = wave * (1.0 - morph) + context.sine.sample(v.phase, 1) * morph;
    wave * (1.0 - c.am_depth * 0.5 + modulator * c.am_depth * 0.5)
}

fn preset_sample(v: &mut Voice, preset: &Preset) -> f32 {
    let len = preset.levels[0].len();
    if v.cursor >= len as f64 {
        if preset.looping {
            v.cursor = len as f64 * 0.1;
        } else {
            v.envelope = Envelope::default();
            return 0.0;
        }
    }
    let ratio = v.info.hz / preset.root_hz;
    let level = ratio.max(1.0).log2().ceil() as usize;
    let level = level.min(preset.levels.len() - 1);
    let pcm = &preset.levels[level];
    let position = v.cursor / (1u64 << level) as f64;
    let index = (position as usize).min(pcm.len() - 1);
    let frac = (position - index as f64) as f32;
    let sample = pcm[index] + (pcm[(index + 1).min(pcm.len() - 1)] - pcm[index]) * frac;
    v.cursor += ratio as f64 * 0.25;
    sample
}

struct Decimator {
    history: [f32; 127],
    taps: [f32; 127],
    cursor: usize,
}
impl Decimator {
    fn new() -> Self {
        let mut taps = [0.0; 127];
        for (i, tap) in taps.iter_mut().enumerate() {
            let x = i as f32 - 63.0;
            let sinc = if x == 0.0 {
                0.22
            } else {
                (std::f32::consts::PI * 0.22 * x).sin() / (std::f32::consts::PI * x)
            };
            let window = 0.42 - 0.5 * (std::f32::consts::TAU * i as f32 / 126.0).cos()
                + 0.08 * (2.0 * std::f32::consts::TAU * i as f32 / 126.0).cos();
            *tap = sinc * window;
        }
        let sum: f32 = taps.iter().sum();
        for t in &mut taps {
            *t /= sum;
        }
        Self {
            history: [0.0; 127],
            taps,
            cursor: 0,
        }
    }
    fn clear(&mut self) {
        self.history.fill(0.0);
    }
    fn push(&mut self, v: f32) {
        self.history[self.cursor] = v;
        self.cursor = (self.cursor + 1) % 127;
    }
    fn output(&self) -> f32 {
        self.taps
            .iter()
            .enumerate()
            .map(|(i, t)| t * self.history[(self.cursor + i) % 127])
            .sum()
    }
}
