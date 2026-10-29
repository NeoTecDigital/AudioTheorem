use super::*;

fn key(scancode: u32, down: bool) -> KeyEvent {
    KeyEvent {
        scancode,
        down: down as u32,
        modifiers: 0,
    }
}
fn pump(engine: &mut crate::runtime::Runtime, input: &mut Controller) {
    for _ in 0..60 {
        engine.tick_virtual(256);
        std::thread::sleep(Duration::from_millis(1));
        input.input(&[], true, false);
    }
}

fn browser_start(handle: &Handle) {
    let _reply = handle
        .submit(
            1,
            Command {
                id: 1,
                at_sample: None,
                action: Action::Start {
                    voice: 1,
                    hz: 330.0,
                    velocity: 0.7,
                    instrument: 0,
                },
            },
        )
        .unwrap();
}

#[test]
fn keyboard_matches_browser_hz_and_release_survives_octave_instrument_modifiers() {
    let mut keys = Keyboard::default();
    let Action::Start {
        voice,
        hz,
        instrument,
        ..
    } = keys.event(key(29, true)).unwrap()
    else {
        panic!()
    };
    assert!((hz - 261.6256).abs() < 0.001);
    assert_eq!(instrument, 0);
    assert!(keys.event(key(29, true)).is_none());
    keys.event(key(48, true));
    keys.event(key(63, true));
    assert_eq!(keys.octave, 5);
    assert_eq!(keys.instrument, 5);
    let release = KeyEvent {
        modifiers: 0x0fc0,
        ..key(29, false)
    };
    assert!(matches!(keys.event(release),Some(Action::Release {voice:id}) if id==voice));
    assert!(keys.event(release).is_none());
    assert!(keys
        .event(KeyEvent {
            modifiers: 0x40,
            ..key(29, true)
        })
        .is_none());
}

#[test]
fn native_down_up_order_focus_reset_and_browser_isolation() {
    let mut engine = crate::runtime::start(true).unwrap();
    let mut input = Controller::new(engine.handle.clone());
    browser_start(&engine.handle);
    input.input(&[key(29, true), key(27, true)], true, false);
    pump(&mut engine, &mut input);
    assert_eq!(
        engine
            .handle
            .snapshot
            .borrow()
            .voices
            .iter()
            .filter(|v| v.client == 32 && v.held)
            .count(),
        2
    );
    input.input(&[], false, true);
    pump(&mut engine, &mut input);
    assert!(engine
        .handle
        .snapshot
        .borrow()
        .voices
        .iter()
        .all(|v| v.client != 32));
    assert!(engine
        .handle
        .snapshot
        .borrow()
        .voices
        .iter()
        .any(|v| v.client == 1 && v.held));
    input.input(&[key(29, true), key(29, false)], true, false);
    pump(&mut engine, &mut input);
    assert!(engine
        .handle
        .snapshot
        .borrow()
        .voices
        .iter()
        .all(|v| v.client != 64 || !v.held));
    assert!(input.status().error.is_none());
}

#[test]
fn overflow_disconnect_cancels_queued_native_starts_without_global_panic() {
    let mut engine = crate::runtime::start(true).unwrap();
    let mut input = Controller::new(engine.handle.clone());
    input.input(&[key(29, true)], true, false);
    input.input(&[key(27, true)], true, true);
    pump(&mut engine, &mut input);
    assert!(engine
        .handle
        .snapshot
        .borrow()
        .voices
        .iter()
        .all(|v| v.client != 32));
    assert!(!engine.handle.snapshot.borrow().panic);
    input.input(&[key(27, true)], true, false);
    pump(&mut engine, &mut input);
    assert!(engine
        .handle
        .snapshot
        .borrow()
        .voices
        .iter()
        .any(|v| v.client == 64 && v.held));
}

#[test]
fn native_backlog_has_bounded_memory_and_independent_fail_safe() {
    let mut engine = crate::runtime::start(true).unwrap();
    let mut input = Controller::new(engine.handle.clone());
    for _ in 0..66 {
        if !input.send(Action::Release { voice: 1 }) {
            break;
        }
    }
    assert!(input.status().error.is_some());
    assert!(input.pending.is_empty());
    assert!(input.client > 32);
    pump(&mut engine, &mut input);
    assert!(!engine.handle.snapshot.borrow().panic);
}

#[test]
fn escape_uses_independent_global_panic_and_drop_releases_native_client() {
    let mut engine = crate::runtime::start(true).unwrap();
    let mut input = Controller::new(engine.handle.clone());
    input.input(&[key(29, true)], true, false);
    pump(&mut engine, &mut input);
    input.input(&[key(41, true)], true, false);
    pump(&mut engine, &mut input);
    assert!(engine.handle.snapshot.borrow().voices.is_empty());
    assert!(engine.handle.snapshot.borrow().panic);
    input.input(&[key(29, true)], true, false);
    pump(&mut engine, &mut input);
    drop(input);
    for _ in 0..40 {
        engine.tick_virtual(256);
        std::thread::sleep(Duration::from_millis(1));
    }
    assert!(engine.handle.snapshot.borrow().voices.is_empty());
}
