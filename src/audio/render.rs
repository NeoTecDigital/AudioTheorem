//! Real-time boundary: fixed storage, moved resources retired by coordinator.
mod file;
use super::{
    asset::Asset,
    synth::Synth,
    table::Bank,
    transport::{self, Consumer, Producer},
};
use crate::contracts::{Controls, PcmBlock, VoiceObservation, BLOCK, MAX_CLIENTS};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc,
};

pub enum Operation {
    Start(VoiceObservation),
    Release(u64),
    Controls(Controls),
    Table(Arc<Bank>),
    Asset(Arc<Asset>),
    Playback(bool),
    Seek(f64),
    Transport(crate::contracts::SongTransport),
    Reset,
    Panic,
}
pub struct Scheduled {
    pub client: u64,
    pub id: u64,
    pub at: u64,
    pub generation: u64,
    pub operation: Operation,
}
pub enum Retired {
    Table(Arc<Bank>),
    Asset(Arc<Asset>),
}
#[derive(Clone, Copy)]
pub struct Applied {
    pub client: u64,
    pub id: u64,
    pub sample: u64,
    pub error: Option<&'static str>,
}
pub struct Packet {
    pub voices: [VoiceObservation; crate::contracts::VOICES],
    pub block: PcmBlock,
    pub playing: bool,
    pub position: u64,
    pub asset: Option<u64>,
}
pub struct Signals {
    pub panic: AtomicU64,
    pub applied_panic: AtomicU64,
    pub closed: [AtomicU64; MAX_CLIENTS],
    pub stop: AtomicBool,
    pub sample: AtomicU64,
    pub drops: AtomicU64,
    pub errors: AtomicU64,
    pub max_us: AtomicU64,
    pub buffer: AtomicU64,
}
impl Default for Signals {
    fn default() -> Self {
        Self {
            panic: AtomicU64::new(0),
            applied_panic: AtomicU64::new(0),
            closed: std::array::from_fn(|_| AtomicU64::new(0)),
            stop: AtomicBool::new(false),
            sample: AtomicU64::new(0),
            drops: AtomicU64::new(0),
            errors: AtomicU64::new(0),
            max_us: AtomicU64::new(0),
            buffer: AtomicU64::new(0),
        }
    }
}
pub struct Ports {
    pub commands: Producer<Scheduled>,
    pub releases: Producer<Scheduled>,
    pub applied: Consumer<Applied>,
    pub packets: Consumer<Packet>,
    pub retired: Consumer<Retired>,
}
pub struct Render {
    pub synth: Synth,
    pub signals: Arc<Signals>,
    commands: Consumer<Scheduled>,
    releases: Consumer<Scheduled>,
    applied: Producer<Applied>,
    packets: Producer<Packet>,
    retired: Producer<Retired>,
    pending: [Option<Scheduled>; 64],
    block: PcmBlock,
    sample: u64,
    epoch: u64,
    generation: u64,
    channels: u16,
    last_error: u64,
    closed: [u64; MAX_CLIENTS],
    asset: Option<Arc<Asset>>,
    position: usize,
    playing: bool,
    transport_generations: [(u64, u64, u64); MAX_CLIENTS],
    fade: file::Fade,
    gap: bool,
}

impl Render {
    pub fn new(rate: u32, signals: Arc<Signals>) -> (Self, Ports) {
        let (commands, cmd) = transport::channel(32);
        let (releases, rel) = transport::channel(32);
        let (ack, applied) = transport::channel(128);
        let (packets_out, packets) = transport::channel(128);
        let (retired_out, retired) = transport::channel(128);
        let ports = Ports {
            commands,
            releases,
            applied,
            packets,
            retired,
        };
        let render = Self {
            synth: Synth::new(rate),
            signals,
            commands: cmd,
            releases: rel,
            applied: ack,
            packets: packets_out,
            retired: retired_out,
            pending: std::array::from_fn(|_| None),
            block: PcmBlock::default(),
            sample: 0,
            epoch: 1,
            generation: 0,
            channels: 2,
            last_error: 0,
            closed: [0; MAX_CLIENTS],
            asset: None,
            position: 0,
            playing: false,
            transport_generations: [(0, 0, 0); MAX_CLIENTS],
            fade: file::Fade::new(rate),
            gap: false,
        };
        (render, ports)
    }

    pub fn set_output_channels(&mut self, channels: u16) {
        self.channels = channels;
    }

    pub fn begin(&mut self) {
        let errors = self.signals.errors.load(Ordering::Acquire);
        if errors != self.last_error {
            self.last_error = errors;
            self.discontinuity();
        }
        let generation = self.signals.panic.load(Ordering::Acquire);
        if generation != self.generation {
            self.synth.panic();
            self.fade.silence();
            self.playing = false;
            self.generation = generation;
            self.signals
                .applied_panic
                .store(generation, Ordering::Release);
        }
        for slot in 0..MAX_CLIENTS {
            let closed = self.signals.closed[slot].load(Ordering::Acquire);
            if closed == self.closed[slot] {
                continue;
            }
            self.synth.disconnect(slot, closed);
            self.closed[slot] = closed;
        }
        ingest(&mut self.commands, &mut self.pending[..32]);
        ingest(&mut self.releases, &mut self.pending[32..]);
    }

    pub fn frame(&mut self) -> [f32; 2] {
        self.apply_due();
        let synth = self.synth.sample();
        let file = self.file_sample();
        self.block.processing |=
            self.synth.processed || (synth + file[0]).abs() > 1.0 || (synth + file[1]).abs() > 1.0;
        let mut output = [
            (synth + file[0]).clamp(-1.0, 1.0),
            (synth + file[1]).clamp(-1.0, 1.0),
        ];
        if self.channels == 1 {
            let mono = (output[0] + output[1]) * 0.5;
            output = [mono, mono];
        }
        self.accumulate_logical();
        self.record(output);
        output
    }

    pub fn virtual_frames(&mut self, frames: usize) {
        for i in 0..frames {
            if i % BLOCK == 0 {
                self.begin();
            }
            self.frame();
        }
    }

    fn apply_due(&mut self) {
        while self.applied.slots() > 0 && self.retired.slots() > 1 {
            let next = self
                .pending
                .iter()
                .enumerate()
                .filter_map(|(i, c)| c.as_ref().map(|c| (i, c.at)))
                .filter(|(_, t)| *t <= self.sample)
                .min_by_key(|(_, t)| *t);
            let Some((index, _)) = next else {
                break;
            };
            let command = self.pending[index].take().expect("occupied command");
            let ack = self.apply(command);
            // Capacity reserved before applying: cannot lose acknowledgements.
            let _ = self.applied.push(ack);
        }
    }

    fn apply(&mut self, command: Scheduled) -> Applied {
        let mut ack = Applied {
            client: command.client,
            id: command.id,
            sample: self.sample,
            error: None,
        };
        if let Some(error) = self.reject(&command) {
            ack.error = Some(error);
            self.retire_operation(command.operation);
            return ack;
        }
        match command.operation {
            Operation::Start(info) => ack.error = self.synth.start(info).err(),
            Operation::Release(voice) => self.synth.release(command.client, voice),
            Operation::Controls(c) => self.synth.controls = c,
            Operation::Table(t) => {
                if let Some(old) = self.synth.table(t) {
                    let _ = self.retired.push(Retired::Table(old));
                }
            }
            Operation::Asset(asset) => {
                if let Some(old) = self.asset.replace(asset) {
                    let _ = self.retired.push(Retired::Asset(old));
                }
                self.fade.reset();
                self.position = 0;
                self.playing = false;
                self.discontinuity();
            }
            Operation::Playback(playing) => {
                self.fade.reset();
                self.playing = playing && self.asset.is_some();
            }
            Operation::Transport(t) => ack.error = self.transport(command.client, t).err(),
            Operation::Seek(seconds) => self.seek(seconds),
            Operation::Reset => self.discontinuity(),
            Operation::Panic => {
                self.synth.panic();
                self.fade.silence();
                self.playing = false;
            }
        }
        ack
    }

    fn reject(&self, command: &Scheduled) -> Option<&'static str> {
        if command.client != 0
            && command.client <= self.closed[command.client as usize % MAX_CLIENTS]
        {
            return Some("client disconnected");
        }
        let audible = matches!(
            command.operation,
            Operation::Start(_)
                | Operation::Playback(true)
                | Operation::Transport(crate::contracts::SongTransport { playing: true, .. })
        );
        if command.generation != self.generation && audible {
            return Some("cancelled by panic");
        }
        None
    }

    fn retire_operation(&mut self, op: Operation) {
        match op {
            Operation::Table(t) => {
                let _ = self.retired.push(Retired::Table(t));
            }
            Operation::Asset(a) => {
                let _ = self.retired.push(Retired::Asset(a));
            }
            _ => {}
        }
    }

    fn discontinuity(&mut self) {
        self.epoch += 1;
        self.gap = true;
        self.block.len = 0;
        self.block.voices.fill(VoiceObservation::default());
        self.block.processing = false;
    }

    fn accumulate_logical(&mut self) {
        let current = self.synth.observations();
        for (stored, voice) in self.block.voices.iter_mut().zip(current) {
            if voice.hz == 0.0 {
                stored.held = false;
                continue;
            }
            if stored.hz != 0.0 && (stored.client != voice.client || stored.voice != voice.voice) {
                self.gap = true;
                *stored = VoiceObservation::default();
            }
            let energy = stored.amplitude + voice.amplitude.powi(2);
            *stored = VoiceObservation {
                amplitude: energy,
                ..voice
            };
        }
    }

    fn record(&mut self, frame: [f32; 2]) {
        if self.block.len == 0 {
            self.block.start = self.sample;
            self.block.epoch = self.epoch;
        }
        self.block.pcm[self.block.len] = frame;
        self.block.len += 1;
        self.sample += 1;
        self.signals.sample.store(self.sample, Ordering::Release);
        if self.block.len != BLOCK {
            return;
        }
        for voice in &mut self.block.voices {
            voice.amplitude = (voice.amplitude / BLOCK as f32).sqrt();
        }
        self.block.gap = self.gap;
        let packet = Packet {
            voices: self.synth.observations(),
            block: self.block.clone(),
            playing: self.playing,
            position: self.position as u64,
            asset: self.asset.as_ref().map(|a| a.id),
        };
        self.gap = self.packets.push(packet).is_err();
        if self.gap {
            self.signals.drops.fetch_add(1, Ordering::Relaxed);
        }
        self.block.len = 0;
        self.block.processing = false;
        self.block.voices.fill(VoiceObservation::default());
    }
}

fn ingest(source: &mut Consumer<Scheduled>, target: &mut [Option<Scheduled>]) {
    for slot in target.iter_mut().filter(|s| s.is_none()) {
        match source.pop() {
            Ok(command) => *slot = Some(command),
            Err(_) => break,
        }
    }
}
