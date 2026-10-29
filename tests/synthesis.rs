use nova_daw::{
    audio::{synth::Synth, table::Bank},
    contracts::{Controls, VoiceObservation},
};
use rustfft::{num_complex::Complex, FftPlanner};
use std::sync::Arc;

fn synth(hz: f32, controls: Controls) -> Synth {
    let mut s = Synth::new(48000);
    s.controls = controls;
    s.start(VoiceObservation {
        client: 1,
        voice: 1,
        hz,
        amplitude: 1.0,
        held: true,
        instrument: 0,
    })
    .unwrap();
    s
}
fn steady() -> Controls {
    Controls {
        attack: 0.001,
        decay: 0.001,
        sustain: 1.0,
        ..Controls::default()
    }
}
fn spectrum(s: &mut Synth) -> Vec<f32> {
    for _ in 0..4800 {
        s.sample();
    }
    let mut data: Vec<_> = (0..32768).map(|_| Complex::new(s.sample(), 0.0)).collect();
    let fft = FftPlanner::new().plan_fft_forward(data.len());
    fft.process(&mut data);
    data[..16384].iter().map(|x| x.norm_sqr()).collect()
}
fn band(power: &[f32], hz: f32) -> f32 {
    let bin = (hz / 48000.0 * 32768.0).round() as usize;
    power[bin.saturating_sub(2)..(bin + 3).min(power.len())]
        .iter()
        .sum()
}

#[test]
fn continuous_detuned_tone_peak_matches_requested_hz() {
    let mut s = synth(443.25, steady());
    let power = spectrum(&mut s);
    let peak = (1..power.len() - 1)
        .max_by(|a, b| power[*a].total_cmp(&power[*b]))
        .unwrap();
    assert!((peak as f32 * 48000.0 / 32768.0 - 443.25).abs() < 1.5);
}
#[test]
fn additive_partials_and_fm_am_sidebands_are_audible() {
    let mut s = synth(375.0, steady());
    s.table(Arc::new(Bank::partials(&[1.0, 0.5, 0.25])));
    let power = spectrum(&mut s);
    assert!(band(&power, 750.0) > band(&power, 375.0) * 0.20);
    assert!(band(&power, 1125.0) > band(&power, 375.0) * 0.04);
    let mut c = steady();
    c.fm_hz = 187.5;
    c.fm_depth = 100.0;
    let fm = spectrum(&mut synth(750.0, c));
    assert!(band(&fm, 562.5) > band(&fm, 750.0) * 0.03);
    assert!(band(&fm, 937.5) > band(&fm, 750.0) * 0.03);
    c.fm_depth = 0.0;
    c.am_depth = 1.0;
    let am = spectrum(&mut synth(750.0, c));
    assert!(band(&am, 562.5) > band(&am, 750.0) * 0.15);
}
#[test]
fn high_note_band_limits_do_not_fold_additive_partials() {
    let mut s = synth(7500.0, steady());
    s.table(Arc::new(Bank::partials(&[1.0; 32])));
    let power = spectrum(&mut s);
    let below: f32 = power[..(7000.0 / 48000.0 * 32768.0) as usize].iter().sum();
    assert!(
        below / band(&power, 7500.0) < 1e-5,
        "folded alias power ratio {}",
        below / band(&power, 7500.0)
    );
}
#[test]
fn envelope_release_and_parameter_smoothing_do_not_step_output() {
    let mut s = synth(440.0, steady());
    for _ in 0..4800 {
        s.sample();
    }
    let before = s.sample();
    s.controls.gain = 0.0;
    let after = s.sample();
    assert!((after - before).abs() < 0.02);
    s.release(1, 1);
    for _ in 0..24000 {
        s.sample();
    }
    assert!(s.observations().iter().all(|v| v.hz == 0.0));
    s.panic();
    assert_eq!(s.sample(), 0.0);
}
