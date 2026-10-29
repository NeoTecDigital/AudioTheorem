//! Allocation instrumentation is thread-local: test runner allocations are excluded.
use nova_daw::{
    audio::render::{Operation, Render, Scheduled, Signals},
    contracts::VoiceObservation,
};
use std::{
    alloc::{GlobalAlloc, Layout, System},
    cell::Cell,
    sync::Arc,
};
thread_local! {static ACTIVE:Cell<bool>=const{Cell::new(false)};static ALLOCS:Cell<usize>=const{Cell::new(0)};static FREES:Cell<usize>=const{Cell::new(0)};}
struct Allocator;
#[global_allocator]
static ALLOCATOR: Allocator = Allocator;
unsafe impl GlobalAlloc for Allocator {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        ACTIVE.with(|v| {
            if v.get() {
                ALLOCS.with(|c| c.set(c.get() + 1))
            }
        });
        System.alloc(l)
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
        ACTIVE.with(|v| {
            if v.get() {
                FREES.with(|c| c.set(c.get() + 1))
            }
        });
        System.dealloc(p, l)
    }
}

#[test]
fn callback_no_allocations_or_deallocations_at_sixteen_voices() {
    let (mut render, mut ports) = Render::new(48000, Arc::new(Signals::default()));
    for id in 1..=16 {
        let info = VoiceObservation {
            client: 1,
            voice: id,
            hz: 110.0 + id as f32 * 27.13,
            amplitude: 0.7,
            held: true,
            instrument: 0,
        };
        assert!(ports
            .commands
            .push(Scheduled {
                client: 1,
                id,
                at: 0,
                generation: 0,
                operation: Operation::Start(info)
            })
            .is_ok());
    }
    ALLOCS.with(|v| v.set(0));
    FREES.with(|v| v.set(0));
    ACTIVE.with(|v| v.set(true));
    render.virtual_frames(256 * 100);
    ACTIVE.with(|v| v.set(false));
    assert_eq!(ALLOCS.with(Cell::get), 0, "callback allocations");
    assert_eq!(FREES.with(Cell::get), 0, "callback deallocations");
}

#[test]
#[ignore = "release-only offline DSP benchmark; not a hardware soak"]
fn callback_budget_reference() {
    let (mut render, mut ports) = Render::new(48000, Arc::new(Signals::default()));
    load_voices(&mut ports);
    render.synth.controls = nova_daw::contracts::Controls {
        fm_hz: 1000.0,
        fm_depth: 500.0,
        am_depth: 1.0,
        lfo_hz: [20.0; 2],
        lfo_depth: [1.0; 2],
        lfo_destination: [0, 3],
        ..nova_daw::contracts::Controls::default()
    };
    render
        .synth
        .table(Arc::new(nova_daw::audio::table::Bank::partials(&[1.0; 32])));
    let mut times = Vec::new();
    for block in 0..6000 {
        let start = std::time::Instant::now();
        render.virtual_frames(256);
        if block > 200 {
            times.push(start.elapsed().as_micros());
        }
        while ports.packets.pop().is_ok() {}
        while ports.applied.pop().is_ok() {}
    }
    times.sort();
    let p99 = times[times.len() * 99 / 100];
    println!(
        "Offline 16-voice DSP: p50={}us p95={}us p99={p99}us deadline=5333us",
        times[times.len() / 2],
        times[times.len() * 95 / 100]
    );
    assert!(p99 < 2666, "p99 must stay below half 256-frame deadline");
}

fn load_voices(ports: &mut nova_daw::audio::render::Ports) {
    for id in 1..=16 {
        let info = VoiceObservation {
            client: 1,
            voice: id,
            hz: 110.0 + id as f32 * 27.13,
            amplitude: 0.7,
            held: true,
            instrument: 0,
        };
        assert!(ports
            .commands
            .push(Scheduled {
                client: 1,
                id,
                at: 0,
                generation: 0,
                operation: Operation::Start(info)
            })
            .is_ok());
    }
}

#[test]
fn resource_replacement_retires_tables_and_assets_off_callback() {
    use nova_daw::audio::{asset::Asset, table::Bank};
    let (mut render, mut ports) = Render::new(48000, Arc::new(Signals::default()));
    let operations = [
        Operation::Table(Arc::new(Bank::partials(&[1.0, 0.5]))),
        Operation::Table(Arc::new(Bank::sine())),
        Operation::Asset(Arc::new(Asset {
            id: 1,
            frames: vec![[0.0; 2]; 256],
            rate: 48000,
        })),
        Operation::Asset(Arc::new(Asset {
            id: 2,
            frames: vec![[0.0; 2]; 256],
            rate: 48000,
        })),
    ];
    for (id, operation) in operations.into_iter().enumerate() {
        assert!(ports
            .commands
            .push(Scheduled {
                client: 1,
                id: id as u64,
                at: 0,
                generation: 0,
                operation
            })
            .is_ok());
    }
    ALLOCS.with(|v| v.set(0));
    FREES.with(|v| v.set(0));
    ACTIVE.with(|v| v.set(true));
    render.virtual_frames(512);
    ACTIVE.with(|v| v.set(false));
    assert_eq!(ALLOCS.with(Cell::get), 0);
    assert_eq!(FREES.with(Cell::get), 0);
    assert!(ports.retired.pop().is_ok());
    assert!(ports.retired.pop().is_ok());
}
