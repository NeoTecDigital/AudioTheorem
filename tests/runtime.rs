use nova_daw::{
    contracts::{Action, Command, Controls},
    runtime::{self, Handle, Runtime},
};
use std::time::Duration;

fn executor() -> tokio::runtime::Runtime {
    tokio::runtime::Runtime::new().unwrap()
}
fn command(
    rt: &tokio::runtime::Runtime,
    engine: &mut Runtime,
    client: u64,
    id: u64,
    at_sample: Option<u64>,
    action: Action,
) -> Result<nova_daw::contracts::Ack, String> {
    let handle = engine.handle.clone();
    let pending = rt.spawn(async move {
        handle
            .command(
                client,
                Command {
                    id,
                    at_sample,
                    action,
                },
            )
            .await
    });
    for _ in 0..1000 {
        engine.tick_virtual(256);
        std::thread::sleep(Duration::from_millis(1));
        if pending.is_finished() {
            break;
        }
    }
    rt.block_on(pending).unwrap()
}
fn start(voice: u64, hz: f32) -> Action {
    Action::Start {
        voice,
        hz,
        velocity: 0.7,
        instrument: 0,
    }
}
fn settle(engine: &mut Runtime) {
    for _ in 0..20 {
        engine.tick_virtual(256);
        std::thread::sleep(Duration::from_millis(2));
    }
}

#[test]
fn complete_acknowledged_state_and_client_isolation() {
    let rt = executor();
    let mut engine = runtime::start(true).unwrap();
    assert!(!engine.handle.snapshot.borrow().device.available);
    assert!(command(&rt, &mut engine, 1, 1, None, start(1, 443.25))
        .unwrap()
        .error
        .is_none());
    assert!(command(&rt, &mut engine, 2, 1, None, start(1, 330.0))
        .unwrap()
        .error
        .is_none());
    let controls = Controls {
        gain: 0.3,
        release: 0.005,
        ..Controls::default()
    };
    let ack = command(&rt, &mut engine, 1, 2, None, Action::Controls { controls }).unwrap();
    settle(&mut engine);
    assert_eq!(engine.handle.snapshot.borrow().controls, controls);
    assert!(engine.handle.snapshot.borrow().revision >= ack.revision);
    engine.handle.disconnect(1);
    settle(&mut engine);
    let state = engine.handle.snapshot.borrow().clone();
    assert!(state.voices.iter().any(|v| v.client == 2));
    assert!(!state.voices.iter().any(|v| v.client == 1));
    assert!(command(&rt, &mut engine, 33, 1, None, start(2, 220.0))
        .unwrap()
        .error
        .is_none());
    engine.handle.disconnect(1);
    settle(&mut engine);
    assert!(engine
        .handle
        .snapshot
        .borrow()
        .voices
        .iter()
        .any(|v| v.client == 33));
}

#[test]
fn scheduled_start_then_early_release_cannot_stick() {
    let rt = executor();
    let mut engine = runtime::start(true).unwrap();
    let h = engine.handle.clone();
    let pending = rt.spawn(async move {
        h.command(
            1,
            Command {
                id: 1,
                at_sample: Some(12000),
                action: start(5, 440.0),
            },
        )
        .await
    });
    for _ in 0..8 {
        engine.tick_virtual(256);
        std::thread::sleep(Duration::from_millis(1));
    }
    assert!(!pending.is_finished());
    let release = command(&rt, &mut engine, 1, 2, None, Action::Release { voice: 5 }).unwrap();
    assert!(release.applied_sample >= 12000);
    assert!(rt.block_on(pending).unwrap().unwrap().error.is_none());
    settle(&mut engine);
    assert!(engine.handle.snapshot.borrow().voices.is_empty());
}

#[test]
fn replay_and_invalid_values_are_rejected() {
    let rt = executor();
    let mut engine = runtime::start(true).unwrap();
    command(&rt, &mut engine, 1, 1, None, start(1, 440.0)).unwrap();
    assert!(command(&rt, &mut engine, 1, 1, None, Action::Release { voice: 1 }).is_err());
    assert!(command(&rt, &mut engine, 1, 2, None, start(2, f32::NAN)).is_err());
    engine.handle.panic();
    settle(&mut engine);
    assert!(engine.handle.snapshot.borrow().voices.is_empty());
}

#[test]
fn analysis_reset_changes_epoch_and_drops_old_history() {
    let rt = executor();
    let mut engine = runtime::start(true).unwrap();
    command(&rt, &mut engine, 1, 1, None, start(1, 440.0)).unwrap();
    settle(&mut engine);
    let old = engine.handle.snapshot.borrow().epoch;
    command(&rt, &mut engine, 1, 2, None, Action::ResetAnalysis).unwrap();
    settle(&mut engine);
    let state = engine.handle.snapshot.borrow().clone();
    assert!(state.epoch > old);
    assert_eq!(state.analysis.as_ref().unwrap().epoch, state.epoch);
}

#[test]
fn saturated_control_queue_has_independent_emergency_silence() {
    let rt = executor();
    let mut engine = runtime::start(true).unwrap();
    command(&rt, &mut engine, 1, 1, None, start(1, 440.0)).unwrap();
    let handles: Vec<_> = (2..200)
        .map(|id| {
            let h: Handle = engine.handle.clone();
            rt.spawn(async move {
                h.command(
                    1,
                    Command {
                        id,
                        at_sample: None,
                        action: Action::Release { voice: 1 },
                    },
                )
                .await
            })
        })
        .collect();
    std::thread::sleep(Duration::from_millis(5));
    engine.handle.panic();
    settle(&mut engine);
    assert!(engine.handle.snapshot.borrow().voices.is_empty());
    for handle in handles {
        handle.abort();
    }
}

fn stereo_fixture() -> Vec<u8> {
    let mut bytes = std::io::Cursor::new(Vec::new());
    let spec = hound::WavSpec {
        channels: 2,
        sample_rate: 48000,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    {
        let mut writer = hound::WavWriter::new(&mut bytes, spec).unwrap();
        for i in 0..24000 {
            let sample = (std::f32::consts::TAU * 440.0 * i as f32 / 48000.0).sin() * 0.5;
            writer.write_sample(sample).unwrap();
            writer.write_sample(-sample * 0.5).unwrap();
        }
        writer.finalize().unwrap();
    }
    bytes.into_inner()
}

#[test]
fn imported_stereo_is_measured_only_and_seek_starts_new_epoch() {
    let rt = executor();
    let mut engine = runtime::start(true).unwrap();
    let handle = engine.handle.clone();
    let upload = rt.spawn(async move { handle.import(1, stereo_fixture()).await });
    for _ in 0..500 {
        engine.tick_virtual(256);
        std::thread::sleep(Duration::from_millis(1));
        if upload.is_finished() {
            break;
        }
    }
    assert!(rt.block_on(upload).unwrap().is_ok());
    command(
        &rt,
        &mut engine,
        1,
        1,
        None,
        Action::Playback { playing: true },
    )
    .unwrap();
    settle(&mut engine);
    let state = engine.handle.snapshot.borrow().clone();
    assert!(state.voices.is_empty());
    assert!(state.analysis.as_ref().unwrap().rms > 0.01);
    assert_eq!(state.analysis.as_ref().unwrap().logical.confidence, 0.0);
    let old = state.epoch;
    command(&rt, &mut engine, 1, 2, None, Action::Seek { seconds: 0.25 }).unwrap();
    settle(&mut engine);
    assert!(engine.handle.snapshot.borrow().epoch > old);
    assert!(engine.handle.snapshot.borrow().playback_seconds >= 0.25);
    command(
        &rt,
        &mut engine,
        1,
        3,
        None,
        Action::Playback { playing: false },
    )
    .unwrap();
    settle(&mut engine);
    assert!(!engine.handle.snapshot.borrow().playing);
}
