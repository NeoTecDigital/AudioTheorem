//! Main-thread native input; ordered bounded requests, independent client cancellation.
mod keyboard;
pub mod timeline;
use crate::{
    contracts::{Ack, Action, Command, View},
    runtime::Handle,
};
pub use keyboard::KeyEvent;
use keyboard::Keyboard;
use std::{
    collections::VecDeque,
    time::{Duration, Instant},
};
use tokio::sync::oneshot;

struct Pending {
    response: oneshot::Receiver<Result<Ack, String>>,
    started: Instant,
    transport: Option<u64>,
}

pub struct Controller {
    handle: Handle,
    pub timeline: timeline::Timeline,
    keyboard: Keyboard,
    client: u64,
    next_id: u64,
    pending: VecDeque<Pending>,
    focused: bool,
    error: Option<String>,
}

pub struct Status<'a> {
    pub octave: u8,
    pub instrument: u8,
    pub focused: bool,
    pub pending: usize,
    pub error: Option<&'a str>,
}

impl Controller {
    pub fn new(handle: Handle) -> Self {
        Self {
            handle,
            timeline: timeline::Timeline::default(),
            keyboard: Keyboard::default(),
            client: 32,
            next_id: 0,
            pending: VecDeque::with_capacity(64),
            focused: false,
            error: None,
        }
    }

    pub fn status(&self) -> Status<'_> {
        Status {
            octave: self.keyboard.octave,
            instrument: self.keyboard.instrument,
            focused: self.focused,
            pending: self.pending.len(),
            error: self.error.as_deref(),
        }
    }

    pub fn input(&mut self, keys: &[KeyEvent], focused: bool, reset: bool) {
        self.collect();
        if reset || (self.focused && !focused) {
            self.reset();
        }
        self.focused = focused;
        if !focused || reset {
            return;
        }
        for &key in keys {
            let Some(action) = self.keyboard.event(key) else {
                continue;
            };
            if matches!(action, Action::Panic) {
                self.handle.panic();
                self.reset();
                break;
            }
            if !self.send(action) {
                break;
            }
        }
    }

    pub fn navigation(
        &mut self,
        events: &[timeline::PointerEvent],
        keys: &[KeyEvent],
        state: &crate::contracts::Snapshot,
        size: [u32; 2],
        reset: bool,
    ) -> bool {
        self.timeline.sync(state);
        if !self.focused || reset || keys.iter().any(|k| k.scancode == 41 && k.down != 0) {
            return true;
        }
        let mut captured = false;
        for &event in events {
            let event = timeline::PointerEvent {
                y: timeline::pointer_y(event.y, size),
                ..event
            };
            let (used, action) = self
                .timeline
                .pointer(event, state, timeline::hud_width(size));
            captured |= used;
            if let Some(action) = action {
                self.send(action);
            }
        }
        if keys
            .iter()
            .any(|k| k.scancode == 44 && k.down != 0 && k.modifiers & 0x0fc0 == 0)
        {
            if let Some(action) = self.timeline.toggle(state) {
                self.send(action);
            }
        }
        self.handle.preview(self.timeline.cursor(state));
        captured
    }

    pub fn view(&mut self, view: View) {
        // Don't accumulate camera requests while waiting for acknowledged values.
        if self.pending.is_empty() {
            self.send(Action::View { view });
        }
    }

    fn send(&mut self, action: Action) -> bool {
        if self.pending.len() == 64 {
            self.fail("Native command backlog; held notes released".into());
            return false;
        }
        let transport = match &action {
            Action::Transport { transport } => Some(transport.generation),
            _ => None,
        };
        self.next_id += 1;
        let command = Command {
            id: self.next_id,
            at_sample: None,
            action,
        };
        match self.handle.submit(self.client, command) {
            Ok(response) => {
                self.pending.push_back(Pending {
                    response,
                    started: Instant::now(),
                    transport,
                });
                true
            }
            Err(error) => {
                self.fail(error);
                false
            }
        }
    }

    fn collect(&mut self) {
        while let Some(front) = self.pending.front_mut() {
            let outcome = match front.response.try_recv() {
                Ok(Ok(ack)) => ack.error.map_or(Ok(()), Err),
                Ok(Err(error)) => Err(error),
                Err(oneshot::error::TryRecvError::Closed) => Err("Engine disconnected".into()),
                Err(_) if front.started.elapsed() < Duration::from_secs(5) => break,
                Err(_) => Err("Native acknowledgement timeout".into()),
            };
            let done = self.pending.pop_front().unwrap();
            if let Some(generation) = done.transport {
                self.timeline.acknowledge(generation);
            }
            if let Err(error) = outcome {
                self.fail(error);
                break;
            }
            self.error = None;
        }
    }

    fn fail(&mut self, error: String) {
        eprintln!("Native input: {error}");
        self.reset();
        self.error = Some(error);
    }

    fn reset(&mut self) {
        // Slot zero is reserved for native generations; browser leases use slots 1..31.
        self.handle.disconnect(self.client);
        self.client += 32;
        self.keyboard.forget();
        self.pending.clear();
        if self.timeline.cancel() {
            self.send(crate::contracts::Action::Playback { playing: false });
        }
    }
}

impl Drop for Controller {
    fn drop(&mut self) {
        self.handle.disconnect(self.client);
    }
}

#[cfg(test)]
mod tests;
