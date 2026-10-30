use super::*;
fn state() -> Snapshot {
    let runtime = crate::runtime::start(true).unwrap();
    let mut s = (**runtime.handle.snapshot.borrow()).clone();
    s.asset = Some(7);
    s.duration_seconds = 120.0;
    s.playing = true;
    s
}
fn pointer(kind: u32, x: f32, y: f32) -> PointerEvent {
    PointerEvent {
        kind,
        x: x / 1280.0,
        y: 1.0 - y / 720.0,
        delta: 0.0,
    }
}
#[test]
fn drag_pauses_once_previews_without_seek_then_commits_asset_transaction() {
    let s = state();
    let mut t = Timeline::default();
    t.sync(&s);
    assert!(matches!(
        t.pointer(pointer(1, 640.0, 130.0), &s, 1280.0).1,
        Some(Action::Playback { playing: false })
    ));
    assert!(t.pointer(pointer(2, 900.0, 130.0), &s, 1280.0).1.is_none());
    let draft = t.cursor(&s);
    assert!(draft > 48000 * 60);
    let (_, Some(Action::Transport { transport })) =
        t.pointer(pointer(3, 900.0, 130.0), &s, 1280.0)
    else {
        panic!()
    };
    assert_eq!(transport.asset, 7);
    assert_eq!(transport.frame, draft);
    assert!(transport.playing);
    assert!(t.inspecting());
    t.acknowledge(transport.generation);
    assert!(!t.inspecting());
}
#[test]
fn paused_drag_stays_paused_cancel_and_replace_never_resume() {
    let mut s = state();
    s.playing = false;
    let mut t = Timeline::default();
    t.sync(&s);
    t.pointer(pointer(1, 640.0, 130.0), &s, 1280.0);
    assert!(t.cancel());
    assert!(!t.inspecting());
    assert!(t.pointer(pointer(3, 900.0, 130.0), &s, 1280.0).1.is_none());
    t.pointer(pointer(1, 640.0, 130.0), &s, 1280.0);
    s.asset = Some(8);
    t.sync(&s);
    assert!(!t.inspecting());
    t.pointer(pointer(1, 640.0, 130.0), &s, 1280.0);
    let (_, Some(Action::Transport { transport })) =
        t.pointer(pointer(3, 900.0, 130.0), &s, 1280.0)
    else {
        panic!()
    };
    assert!(!transport.playing);
    assert_eq!(transport.asset, 8);
}
#[test]
fn fit_covers_entire_song_and_view_clamps_without_retuning() {
    let s = state();
    let mut t = Timeline::default();
    t.sync(&s);
    t.fit = true;
    assert_eq!(t.range(&s), (0, 120 * 48000));
    let result = t.pointer(pointer(1, 130.0, 570.0), &s, 1280.0);
    assert!(result.0 && result.1.is_none());
    assert_eq!(t.pinned, Some(0));
    t.pointer(pointer(1, 130.0, 350.0), &s, 1280.0);
    assert_eq!(t.mode, 1);
}

#[test]
fn narrow_hud_hit_testing_keeps_top_and_bottom_anchored_without_stretch() {
    let size = [842, 1393];
    let height = hud_height(size);
    assert!((height / 1393.0 - hud_width(size) / 842.0).abs() < 1e-6);
    for y in [130.0, 490.0, 598.0] {
        let actual = if y >= 330.0 { y + height - 720.0 } else { y };
        assert!((pointer_y(1.0 - actual / height, size) - (1.0 - y / 720.0)).abs() < 1e-5);
    }
}
