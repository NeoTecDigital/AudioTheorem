use super::*;
fn pointer(kind: u32, x: f32, y: f32) -> PointerEvent {
    PointerEvent {
        kind,
        x: x / 1280.0,
        y: 1.0 - y / 720.0,
        delta: 0.0,
    }
}
#[test]
fn menu_captures_drag_outside_and_does_not_activate_disabled_items() {
    let mut menu = Menu::default();
    assert!(menu.pointer(pointer(1, 1200.0, 665.0), 1280.0, &[]).0);
    assert!(menu.open);
    let mut button = item(Choice::Play, "PLAY", 1280.0, 0, 0, 3, false);
    button.enabled = false;
    assert_eq!(
        menu.pointer(pointer(1, 1000.0, 605.0), 1280.0, &[button]).1,
        None
    );
    assert!(menu.pointer(pointer(2, 10.0, 200.0), 1280.0, &[]).0);
    assert!(menu.pointer(pointer(3, 10.0, 200.0), 1280.0, &[]).0);
    menu.pointer(pointer(1, 10.0, 200.0), 1280.0, &[]);
    assert!(!menu.open);
    assert!(menu.pointer(pointer(2, 11.0, 201.0), 1280.0, &[]).0);
    menu.pointer(pointer(3, 11.0, 201.0), 1280.0, &[]);
    assert!(!menu.pointer(pointer(2, 11.0, 201.0), 1280.0, &[]).0);
}
#[test]
fn menu_actions_preserve_unrelated_engine_parameters() {
    let runtime = crate::runtime::start(true).unwrap();
    let state = (**runtime.handle.snapshot.borrow()).clone();
    let Some(Action::Controls { controls }) = action(Choice::Gain(-1.0), &state) else {
        panic!()
    };
    assert_eq!(controls.gain, 0.0);
    assert_eq!(controls.cutoff, state.controls.cutoff);
    let Some(Action::View { view }) = action(Choice::Motion, &state) else {
        panic!()
    };
    assert_ne!(view.reduced_motion, state.view.reduced_motion);
    assert_eq!(view.logical, state.view.logical);
}
