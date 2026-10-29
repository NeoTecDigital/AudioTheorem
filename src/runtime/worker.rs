use super::Request;
use crate::{
    analysis::Analyzer,
    audio::{
        render::{Applied, Operation, Ports, Scheduled, Signals},
        table::Bank,
        validation,
    },
    contracts::*,
};
use std::{
    collections::HashMap,
    sync::{atomic::Ordering, Arc},
    time::{Duration, Instant},
};
use tokio::sync::{mpsc, oneshot, watch};

pub(super) enum Pending {
    Command(Command, oneshot::Sender<Result<Ack, String>>),
    Import(u64, f64, oneshot::Sender<Result<u64, String>>),
}
type Deferred = (u64, Command, oneshot::Sender<Result<Ack, String>>);
struct Worker {
    ports: Ports,
    signals: Arc<Signals>,
    snapshot: Snapshot,
    analyzer: Analyzer,
    pending: HashMap<(u64, u64), Pending>,
    last: [(u64, u64); 32],
    internal: u64,
    panic_generation: u64,
    coalesced: [Option<Deferred>; 32],
}

pub fn run(
    mut requests: mpsc::Receiver<Request>,
    ports: Ports,
    signals: Arc<Signals>,
    publish: watch::Sender<Arc<Snapshot>>,
    snapshot: Snapshot,
) {
    let analyzer = Analyzer::new(snapshot.device.sample_rate);
    let mut worker = Worker {
        ports,
        signals,
        snapshot,
        analyzer,
        pending: HashMap::new(),
        last: [(0, 0); 32],
        internal: 0,
        panic_generation: 0,
        coalesced: std::array::from_fn(|_| None),
    };
    let mut last_publish = Instant::now();
    while !worker.signals.stop.load(Ordering::Acquire) {
        worker.drain();
        for _ in 0..64 {
            let Ok(request) = requests.try_recv() else {
                break;
            };
            worker.request(request);
        }
        worker.flush_controls();
        if last_publish.elapsed() >= Duration::from_millis(16) {
            worker.metrics();
            publish.send_replace(Arc::new(worker.snapshot.clone()));
            last_publish = Instant::now();
        }
        std::thread::sleep(Duration::from_millis(1));
    }
}

impl Worker {
    fn request(&mut self, request: Request) {
        match request {
            Request::Command {
                client,
                command,
                reply,
            } => self.command(client, command, reply),
            Request::Import {
                client,
                asset,
                reply,
            } => {
                if self
                    .pending
                    .values()
                    .any(|p| matches!(p, Pending::Import(..)))
                {
                    let _ = reply.send(Err("an asset is still awaiting the audio device".into()));
                    return;
                }
                let duration = asset.frames.len() as f64 / asset.rate as f64;
                let id = asset.id;
                self.internal += 1;
                let at = self.signals.sample.load(Ordering::Acquire);
                let op = Scheduled {
                    client,
                    id: self.internal,
                    at,
                    generation: self.signals.panic.load(Ordering::Acquire),
                    operation: Operation::Asset(asset),
                };
                match self.enqueue(op, false) {
                    Ok(()) => {
                        self.pending.insert(
                            (client, self.internal),
                            Pending::Import(id, duration, reply),
                        );
                    }
                    Err(e) => {
                        let _ = reply.send(Err(e));
                    }
                }
            }
        }
    }

    fn command(
        &mut self,
        client: u64,
        command: Command,
        reply: oneshot::Sender<Result<Ack, String>>,
    ) {
        let now = self.signals.sample.load(Ordering::Acquire);
        if let Err(e) = self.validate(client, &command, now) {
            let _ = reply.send(Err(e));
            return;
        }
        if let Action::View { view } = command.action {
            self.snapshot.view = view;
            self.analyzer
                .set_history_view(view.history_seconds, view.history_offset);
            let ack = self.ack(client, command.id, now, None);
            let _ = reply.send(Ok(ack));
            return;
        }
        if matches!(command.action, Action::Controls { .. }) {
            let old = self.coalesced[client as usize % 32].replace((client, command, reply));
            if let Some((_, _, reply)) = old {
                let _ = reply.send(Err("superseded by newer controls before application".into()));
            }
            return;
        }
        self.queue_command(client, command, reply, now);
    }

    fn flush_controls(&mut self) {
        for slot in 0..32 {
            let Some((client, command, reply)) = self.coalesced[slot].take() else {
                continue;
            };
            let now = self.signals.sample.load(Ordering::Acquire);
            self.queue_command(client, command, reply, now);
        }
    }

    fn queue_command(
        &mut self,
        client: u64,
        command: Command,
        reply: oneshot::Sender<Result<Ack, String>>,
        now: u64,
    ) {
        let release = matches!(command.action, Action::Release { .. } | Action::Panic);
        let operation = self.operation(client, &command.action);
        let at = self.release_time(client, &command, now);
        self.internal += 1;
        let ticket = self.internal;
        let scheduled = Scheduled {
            client,
            id: ticket,
            at,
            generation: self.signals.panic.load(Ordering::Acquire),
            operation,
        };
        match self.enqueue(scheduled, release) {
            Ok(()) => {
                self.pending
                    .insert((client, ticket), Pending::Command(command, reply));
            }
            Err(e) => {
                self.queue_failure(client, release);
                let _ = reply.send(Err(e));
            }
        }
    }

    fn queue_failure(&mut self, client: u64, release: bool) {
        if release && client != 0 {
            self.signals.closed[client as usize % 32].fetch_max(client, Ordering::Release);
        }
        self.snapshot.overloads += 1;
    }

    fn release_time(&self, client: u64, command: &Command, now: u64) -> u64 {
        let mut at = command.at_sample.unwrap_or(now).max(now);
        let Action::Release { voice } = command.action else {
            return at;
        };
        for ((source, _), pending) in &self.pending {
            let Pending::Command(start, _) = pending else {
                continue;
            };
            if *source != client {
                continue;
            }
            if matches!(start.action,Action::Start {voice:id,..} if id==voice) {
                at = at.max(start.at_sample.unwrap_or(now));
            }
        }
        at
    }

    fn validate(&mut self, client: u64, command: &Command, now: u64) -> Result<(), String> {
        if client > 9_007_199_254_740_991 {
            return Err("invalid client identity".into());
        }
        validation::command(command, now, self.snapshot.device.sample_rate)?;
        let slot = client as usize % 32;
        if client != 0 && client <= self.signals.closed[slot].load(Ordering::Acquire) {
            return Err("client closed; reconnect".into());
        }
        let (old, id) = self.last[slot];
        if old == client && command.id <= id {
            return Err("command ids must increase per client".into());
        }
        self.last[slot] = (client, command.id);
        Ok(())
    }

    fn operation(&mut self, client: u64, action: &Action) -> Operation {
        match action {
            Action::Start {
                voice,
                hz,
                velocity,
                instrument,
            } => Operation::Start(VoiceObservation {
                client,
                voice: *voice,
                hz: *hz,
                amplitude: *velocity,
                held: true,
                instrument: *instrument,
            }),
            Action::Release { voice } => Operation::Release(*voice),
            Action::Controls { controls } => Operation::Controls(*controls),
            Action::Wavetable { samples } => Operation::Table(Arc::new(Bank::waveform(samples))),
            Action::Partials { amplitudes } => {
                Operation::Table(Arc::new(Bank::partials(amplitudes)))
            }
            Action::Playback { playing } => Operation::Playback(*playing),
            Action::Seek { seconds } => Operation::Seek(*seconds),
            Action::Panic => Operation::Panic,
            _ => Operation::Reset,
        }
    }

    fn enqueue(&mut self, operation: Scheduled, release: bool) -> Result<(), String> {
        if self.pending.len() >= 112 {
            return Err("pending command limit; retry".into());
        }
        let queue = if release {
            &mut self.ports.releases
        } else {
            &mut self.ports.commands
        };
        queue.push(operation).map_err(|_| {
            "audio command queue full; release failures silence client; reconnect".into()
        })
    }

    fn drain(&mut self) {
        let generation = self.signals.applied_panic.load(Ordering::Acquire);
        if generation != self.panic_generation {
            self.snapshot.panic = true;
            self.panic_generation = generation;
        }
        while let Ok(resource) = self.ports.retired.pop() {
            drop(resource);
        }
        while let Ok(applied) = self.ports.applied.pop() {
            self.applied(applied);
        }
        while let Ok(packet) = self.ports.packets.pop() {
            let frame = self.analyzer.push(&packet.block);
            self.snapshot.epoch = packet.block.epoch;
            self.snapshot.sample = packet.block.start + packet.block.len as u64;
            self.snapshot.voices = packet
                .voices
                .iter()
                .filter(|v| v.hz > 0.0)
                .copied()
                .collect();
            self.snapshot.playing = packet.playing;
            self.snapshot.asset = packet.asset;
            self.snapshot.playback_seconds =
                packet.position as f64 / self.snapshot.device.sample_rate as f64;
            if let Some(frame) = frame {
                self.snapshot.analysis = Some(frame);
            }
        }
    }

    fn applied(&mut self, applied: Applied) {
        let Some(pending) = self.pending.remove(&(applied.client, applied.id)) else {
            return;
        };
        let error = applied.error.map(str::to_string);
        match pending {
            Pending::Command(command, reply) => {
                let ack = self.ack(applied.client, command.id, applied.sample, error.clone());
                if error.is_none() {
                    self.update(&command.action);
                }
                let _ = reply.send(Ok(ack));
            }
            Pending::Import(id, duration, reply) => {
                self.snapshot.revision += 1;
                if error.is_none() {
                    self.snapshot.duration_seconds = duration;
                }
                let _ = reply.send(error.map_or(Ok(id), Err));
            }
        }
    }

    fn update(&mut self, action: &Action) {
        match action {
            Action::Controls { controls } => self.snapshot.controls = *controls,
            Action::Wavetable { samples } => {
                self.snapshot.wavetable = samples.clone();
                self.snapshot.partials.clear();
            }
            Action::Partials { amplitudes } => {
                self.snapshot.partials = amplitudes.clone();
                self.snapshot.wavetable.clear();
            }
            Action::Panic => self.snapshot.panic = true,
            Action::Start { .. } | Action::Playback { playing: true } => {
                self.snapshot.panic = false
            }
            _ => {}
        }
    }

    fn ack(&mut self, client: u64, id: u64, sample: u64, error: Option<String>) -> Ack {
        self.snapshot.revision += 1;
        let ack = Ack {
            client,
            id,
            revision: self.snapshot.revision,
            applied_sample: sample,
            error,
        };
        if self.snapshot.acknowledgements.len() == 64 {
            self.snapshot.acknowledgements.remove(0);
        }
        self.snapshot.acknowledgements.push(ack.clone());
        ack
    }

    fn metrics(&mut self) {
        self.snapshot.device.actual_buffer = self.signals.buffer.load(Ordering::Relaxed) as u32;
        self.snapshot.device.analysis_drops = self.signals.drops.load(Ordering::Relaxed);
        self.snapshot.device.errors = self.signals.errors.load(Ordering::Relaxed);
        self.snapshot.device.callback_max_us = self.signals.max_us.load(Ordering::Relaxed);
    }
}
