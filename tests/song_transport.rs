use nova_daw::{
    audio::{
        asset::Asset,
        render::{Operation, Ports, Render, Scheduled, Signals},
    },
    contracts::SongTransport,
};
use std::sync::{atomic::Ordering, Arc};
fn queue(ports: &mut Ports, id: u64, operation: Operation) {
    assert!(ports
        .commands
        .push(Scheduled {
            client: 1,
            id,
            at: 0,
            generation: 0,
            operation
        })
        .is_ok());
}
fn setup() -> (Render, Ports) {
    let (mut r, mut p) = Render::new(48000, Arc::new(Signals::default()));
    queue(
        &mut p,
        1,
        Operation::Asset(Arc::new(Asset {
            id: 3,
            rate: 48000,
            frames: vec![[0.5, -0.5]; 48000],
        })),
    );
    r.virtual_frames(256);
    p.applied.pop().unwrap();
    (r, p)
}
fn transport(generation: u64, frame: u64, playing: bool) -> Operation {
    Operation::Transport(SongTransport {
        asset: 3,
        frame,
        generation,
        playing,
    })
}
#[test]
fn atomic_seek_is_asset_scoped_ordered_and_stereo_preserving() {
    let (mut r, mut p) = setup();
    queue(&mut p, 2, transport(2, 24000, true));
    r.virtual_frames(256);
    assert!(p.applied.pop().unwrap().error.is_none());
    let mut packet = p.packets.pop().unwrap();
    while let Ok(next) = p.packets.pop() {
        packet = next;
    }
    assert_eq!(packet.position, 24256);
    assert!(packet.playing);
    assert_eq!(packet.asset, Some(3));
    assert!(packet.block.gap);
    assert!(packet.block.pcm[255][0] > 0.0);
    assert_eq!(packet.block.pcm[255][0], -packet.block.pcm[255][1]);
    queue(&mut p, 3, transport(1, 0, false));
    r.virtual_frames(256);
    assert_eq!(
        p.applied.pop().unwrap().error,
        Some("superseded transport generation")
    );
    queue(
        &mut p,
        4,
        Operation::Transport(SongTransport {
            asset: 8,
            frame: 0,
            generation: 3,
            playing: true,
        }),
    );
    r.virtual_frames(256);
    assert!(p.applied.pop().unwrap().error.is_some());
}
#[test]
fn panic_cancels_queued_resume_and_end_seek_stays_paused() {
    let (mut r, mut p) = setup();
    queue(&mut p, 2, transport(1, 48000, true));
    r.virtual_frames(256);
    assert!(p.applied.pop().unwrap().error.is_none());
    while let Ok(packet) = p.packets.pop() {
        assert!(!packet.playing);
    }
    queue(&mut p, 3, transport(2, 0, true));
    r.signals.panic.fetch_add(1, Ordering::Release);
    r.virtual_frames(256);
    assert_eq!(p.applied.pop().unwrap().error, Some("cancelled by panic"));
    assert_eq!(r.frame(), [0.0, 0.0]);
}
