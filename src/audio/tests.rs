use super::{
    asset,
    render::{Operation, Render, Scheduled, Signals},
    table::Bank,
    validation,
};
use crate::contracts::*;
use std::sync::{atomic::Ordering, Arc};

fn start(voice: u64, client: u64, hz: f32) -> Operation {
    Operation::Start(VoiceObservation {
        client,
        voice,
        hz,
        amplitude: 0.7,
        held: true,
        instrument: 0,
    })
}
fn send(ports: &mut super::render::Ports, id: u64, client: u64, at: u64, operation: Operation) {
    assert!(ports
        .commands
        .push(Scheduled {
            client,
            id,
            at,
            generation: 0,
            operation
        })
        .is_ok());
}

#[test]
fn continuous_hz_detuning_and_source_identity() {
    let (mut r, mut p) = Render::new(48000, Arc::new(Signals::default()));
    send(&mut p, 1, 1, 0, start(7, 1, 443.25));
    send(&mut p, 2, 2, 0, start(7, 2, 440.0));
    r.virtual_frames(512);
    assert_eq!(
        r.synth.observations().iter().filter(|v| v.hz > 0.0).count(),
        2
    );
    send(&mut p, 3, 1, 512, Operation::Release(7));
    r.virtual_frames(48000);
    let voices = r.synth.observations();
    assert!(voices.iter().any(|v| v.client == 2 && v.held));
    assert!(!voices.iter().any(|v| v.client == 1 && v.hz > 0.0));
}

#[test]
fn scheduling_ack_and_overload_are_explicit() {
    let (mut r, mut p) = Render::new(48000, Arc::new(Signals::default()));
    send(&mut p, 1, 1, 300, start(1, 1, 440.0));
    r.virtual_frames(256);
    assert!(p.applied.pop().is_err());
    r.virtual_frames(256);
    assert_eq!(p.applied.pop().unwrap().sample, 300);
    for i in 2..=17 {
        send(&mut p, i, 1, 512, start(i, 1, 440.0));
    }
    r.virtual_frames(256);
    let mut errors = 0;
    while let Ok(ack) = p.applied.pop() {
        errors += usize::from(ack.error.is_some());
    }
    assert_eq!(errors, 1);
}

#[test]
fn panic_cancels_future_starts_and_silences_filter_tail() {
    let signals = Arc::new(Signals::default());
    let (mut r, mut p) = Render::new(48000, signals.clone());
    send(&mut p, 1, 1, 0, start(1, 1, 440.0));
    send(&mut p, 2, 1, 1000, start(2, 1, 220.0));
    r.virtual_frames(512);
    signals.panic.fetch_add(1, Ordering::Release);
    r.begin();
    for _ in 0..1024 {
        assert_eq!(r.frame(), [0.0; 2]);
    }
    let mut cancelled = false;
    while let Ok(a) = p.applied.pop() {
        cancelled |= a.error == Some("cancelled by panic");
    }
    assert!(cancelled);
}

#[test]
fn client_disconnect_watermark_does_not_cut_new_generation() {
    let signals = Arc::new(Signals::default());
    let (mut r, mut p) = Render::new(48000, signals.clone());
    send(&mut p, 1, 1, 0, start(1, 1, 440.0));
    send(&mut p, 1, 33, 0, start(1, 33, 440.0));
    r.virtual_frames(256);
    signals.closed[1].store(1, Ordering::Release);
    r.virtual_frames(256);
    assert!(r
        .synth
        .observations()
        .iter()
        .any(|v| v.client == 33 && v.held));
    assert!(!r
        .synth
        .observations()
        .iter()
        .any(|v| v.client == 1 && v.held));
}

#[test]
fn finite_controls_and_arrays_are_validated_without_coercion() {
    let mut c = Controls::default();
    c.fm_depth = f32::INFINITY;
    assert!(validation::controls(&c).is_err());
    let command = Command {
        id: 1,
        at_sample: None,
        action: Action::Partials {
            amplitudes: vec![f32::NAN],
        },
    };
    assert!(validation::command(&command, 0, 48000).is_err());
    let text = r#"{"id":1,"at_sample":null,"action":"start","voice":1,"hz":440.25,"velocity":0.5,"instrument":0}"#;
    assert!(serde_json::from_str::<Command>(text).is_ok());
    assert!(serde_json::from_str::<Command>(
        &text.replace("\"instrument\":0", "\"instrument\":0,\"unexpected\":true")
    )
    .is_err());
    assert!(serde_json::from_str::<Command>(&text.replace("440.25", "1e999")).is_err());
}

#[test]
fn analysis_overflow_is_visible_as_gap() {
    let signals = Arc::new(Signals::default());
    let (mut r, mut p) = Render::new(48000, signals.clone());
    r.virtual_frames(256 * 130);
    assert!(signals.drops.load(Ordering::Relaxed) > 0);
    while p.packets.pop().is_ok() {}
    r.virtual_frames(256);
    assert!(p.packets.pop().unwrap().block.gap);
}

#[test]
fn waveform_and_partials_are_bounded_periodic_tables() {
    let table = Bank::waveform(&[0.5; 64]);
    assert!(table.sample(0.25, 32).abs() < 1e-5); // DC removed, never projected as pitch.
    let table = Bank::partials(&[1.0, 0.5, 0.25]);
    for i in 0..10000 {
        assert!(table.sample(i as f64 / 10000.0, 32).abs() <= 1.0);
    }
}

#[test]
fn file_decode_preserves_stereo_and_rejects_bad_input() {
    let mut bytes = std::io::Cursor::new(Vec::new());
    let spec = hound::WavSpec {
        channels: 2,
        sample_rate: 48000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    {
        let mut writer = hound::WavWriter::new(&mut bytes, spec).unwrap();
        for _ in 0..32 {
            writer.write_sample(16384i16).unwrap();
            writer.write_sample(-8192i16).unwrap();
        }
        writer.finalize().unwrap();
    }
    let result = asset::decode(1, bytes.into_inner(), 48000).unwrap();
    assert_eq!(result.frames.len(), 32);
    assert_eq!(result.frames[10], [0.5, -0.25]);
    assert!(asset::decode(2, b"RIFFgarbage".to_vec(), 48000).is_err());
    assert!(asset::decode(3, b"fLaCgarbage".to_vec(), 48000).is_err());
    assert!(asset::decode(4, b"/etc/passwd".to_vec(), 48000).is_err());
}

#[test]
fn brief_notes_retain_logical_energy_before_end_of_block() {
    let (mut r, mut p) = Render::new(48000, Arc::new(Signals::default()));
    send(
        &mut p,
        1,
        1,
        0,
        Operation::Controls(Controls {
            attack: 0.001,
            release: 0.005,
            ..Controls::default()
        }),
    );
    send(&mut p, 2, 1, 0, start(3, 1, 440.0));
    send(&mut p, 3, 1, 10, Operation::Release(3));
    r.virtual_frames(256);
    let packet = p.packets.pop().unwrap();
    assert!(packet
        .block
        .voices
        .iter()
        .any(|v| v.voice == 3 && v.amplitude > 0.0));
    assert!(!packet.voices.iter().any(|v| v.voice == 3 && v.held));
}

#[test]
fn bus_processing_is_explicit_and_not_assigned_to_one_source() {
    let (mut r, mut p) = Render::new(48000, Arc::new(Signals::default()));
    for voice in 1..=16 {
        send(&mut p, voice, 1, 0, start(voice, 1, 440.0));
    }
    r.virtual_frames(2048);
    let mut processing = false;
    while let Ok(packet) = p.packets.pop() {
        processing |= packet.block.processing;
    }
    assert!(processing);
}

#[test]
fn recovered_device_error_marks_analysis_discontinuity() {
    let signals = Arc::new(Signals::default());
    let (mut r, mut p) = Render::new(48000, signals.clone());
    r.virtual_frames(256);
    let before = p.packets.pop().unwrap();
    signals.errors.fetch_add(1, Ordering::Release);
    r.virtual_frames(256);
    let after = p.packets.pop().unwrap();
    assert!(after.block.epoch > before.block.epoch);
    assert!(after.block.gap);
}
