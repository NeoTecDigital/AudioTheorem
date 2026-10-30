//! Coordinator owns control/analysis; audio owns DSP; immutable newest-only snapshots.
mod source;
mod worker;
use crate::{
    audio::{
        asset::{self, Asset},
        device::Device,
        render::{Render, Signals},
    },
    contracts::*,
};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use tokio::sync::{mpsc, oneshot, watch, Semaphore};

pub(super) enum Request {
    Command {
        client: u64,
        command: Command,
        reply: oneshot::Sender<Result<Ack, String>>,
    },
    Import {
        client: u64,
        asset: Arc<Asset>,
        reply: oneshot::Sender<Result<u64, String>>,
    },
}
#[derive(Clone)]
pub struct Handle {
    pub snapshot: watch::Receiver<Arc<Snapshot>>,
    requests: mpsc::Sender<Request>,
    signals: Arc<Signals>,
    import_slot: Arc<Semaphore>,
    asset_id: Arc<AtomicU64>,
    source_cursor: Arc<AtomicU64>,
}

impl Handle {
    pub fn preview(&self, frame: u64) {
        self.source_cursor.store(frame, Ordering::Relaxed);
    }

    pub async fn command(&self, client: u64, command: Command) -> Result<Ack, String> {
        let receive = self.submit(client, command)?;
        tokio::time::timeout(std::time::Duration::from_secs(5), receive)
            .await
            .map_err(|_| "audio acknowledgement timeout".to_string())?
            .map_err(|_| "coordinator stopped".to_string())?
    }

    /// Ordered, nonblocking enqueue; the receiver resolves only after application.
    pub fn submit(
        &self,
        client: u64,
        command: Command,
    ) -> Result<oneshot::Receiver<Result<Ack, String>>, String> {
        let release = matches!(command.action, Action::Release { .. });
        if matches!(command.action, Action::Panic) {
            self.panic();
        }
        let (reply, receive) = oneshot::channel();
        if self
            .requests
            .try_send(Request::Command {
                client,
                command,
                reply,
            })
            .is_err()
        {
            if release {
                self.disconnect(client);
            }
            return Err("control queue full; failed release silences client, reconnect".into());
        }
        Ok(receive)
    }

    pub async fn import(&self, client: u64, bytes: Vec<u8>) -> Result<u64, String> {
        let _permit = self
            .import_slot
            .clone()
            .try_acquire_owned()
            .map_err(|_| "another import is in progress")?;
        let id = self.asset_id.fetch_add(1, Ordering::Relaxed);
        let rate = self.snapshot.borrow().device.sample_rate;
        let asset = tokio::task::spawn_blocking(move || asset::decode(id, bytes, rate))
            .await
            .map_err(|e| e.to_string())??;
        let (reply, receive) = oneshot::channel();
        self.requests
            .try_send(Request::Import {
                client,
                asset: Arc::new(asset),
                reply,
            })
            .map_err(|_| "control queue full")?;
        tokio::time::timeout(std::time::Duration::from_secs(5), receive)
            .await
            .map_err(|_| "import acknowledgement timeout")?
            .map_err(|_| "coordinator stopped".to_string())?
    }

    pub fn disconnect(&self, client: u64) {
        if client == 0 {
            return;
        }
        self.signals.closed[client as usize % MAX_CLIENTS].fetch_max(client, Ordering::Release);
    }

    pub fn panic(&self) {
        self.signals.panic.fetch_add(1, Ordering::Release);
    }
}

pub struct Runtime {
    pub handle: Handle,
    stream: Option<cpal::Stream>,
    virtual_render: Option<Render>,
    worker: Option<std::thread::JoinHandle<()>>,
}

pub fn start(headless: bool) -> Result<Runtime, String> {
    let device = if headless {
        None
    } else {
        Some(Device::prepare()?)
    };
    let status = device_status(&device);
    let signals = Arc::new(Signals::default());
    let (render, ports) = Render::new(status.sample_rate, signals.clone());
    let (requests, receive) = mpsc::channel(64);
    let snapshot = initial(status);
    let (publish, snapshot_rx) = watch::channel(Arc::new(snapshot.clone()));
    let source_cursor = Arc::new(AtomicU64::new(0));
    let source = source::SourceCache::start(source_cursor.clone(), signals.clone())?;
    let handle = Handle {
        source_cursor,
        snapshot: snapshot_rx,
        requests,
        signals: signals.clone(),
        import_slot: Arc::new(Semaphore::new(1)),
        asset_id: Arc::new(AtomicU64::new(1)),
    };
    let (stream, virtual_render) = match device {
        Some(d) => (Some(d.start(render)?), None),
        None => (None, Some(render)),
    };
    let worker = std::thread::Builder::new()
        .name("harmonic-coordinator".into())
        .spawn(move || {
            worker::run(receive, ports, signals, publish, snapshot, source);
        })
        .map_err(|e| e.to_string())?;
    Ok(Runtime {
        handle,
        stream,
        virtual_render,
        worker: Some(worker),
    })
}

fn device_status(device: &Option<Device>) -> DeviceStatus {
    device
        .as_ref()
        .map(|d| d.status.clone())
        .unwrap_or(DeviceStatus {
            available: false,
            name: "Virtual clock — audio unavailable".into(),
            sample_rate: 48000,
            channels: 2,
            format: "f32 virtual".into(),
            requested_buffer: 256,
            actual_buffer: 256,
            ..DeviceStatus::default()
        })
}

impl Runtime {
    pub fn tick_virtual(&mut self, frames: usize) {
        if let Some(render) = &mut self.virtual_render {
            render.virtual_frames(frames);
        }
    }
    pub fn shutdown(&mut self) {
        self.handle.panic();
        self.handle.signals.stop.store(true, Ordering::Release);
        self.stream.take();
        self.virtual_render.take();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
impl Drop for Runtime {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn initial(device: DeviceStatus) -> Snapshot {
    Snapshot {
        version: VERSION,
        revision: 0,
        epoch: 1,
        sample: 0,
        controls: Controls::default(),
        view: View::default(),
        wavetable: Vec::new(),
        partials: vec![1.0],
        voices: Vec::new(),
        acknowledgements: Vec::new(),
        device,
        asset: None,
        playback_seconds: 0.0,
        playback_frame: 0,
        song: None,
        duration_seconds: 0.0,
        playing: false,
        panic: false,
        overloads: 0,
        analysis: None,
    }
}
