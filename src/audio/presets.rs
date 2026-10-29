//! Existing generated kick/snare/hat/bell palette, prepared off-thread.
use std::f32::consts::TAU;

pub struct Preset {
    pub levels: Vec<Vec<f32>>,
    pub root_hz: f32,
    pub looping: bool,
}

pub fn prepare(rate: u32) -> Vec<Preset> {
    vec![
        generate(rate, 0.45, 65.406, false, kick),
        generate(rate, 0.28, 146.832, false, snare),
        generate(rate, 0.06, 369.994, false, hat),
        generate(rate, 2.0, 440.0, true, bell),
    ]
}

fn generate(
    rate: u32,
    seconds: f32,
    root_hz: f32,
    looping: bool,
    f: fn(f32, usize) -> f32,
) -> Preset {
    let pcm = (0..(rate as f32 * seconds) as usize)
        .map(|i| f(i as f32 / rate as f32, i))
        .collect();
    Preset {
        levels: super::resample::mipmaps(pcm),
        root_hz,
        looping,
    }
}
fn kick(t: f32, _: usize) -> f32 {
    let phase = TAU * (45.0 * t - 3.5 * (-t * 30.0).exp());
    let click = if t < 0.005 {
        (1.0 - t / 0.005) * 0.4
    } else {
        0.0
    };
    ((phase.sin() * 0.85 + click) * (-t * 6.5).exp() * 1.5).tanh()
}
fn noise(i: usize) -> f32 {
    let n = (i as u32).wrapping_mul(747796405).wrapping_add(2891336453);
    let n = ((n >> ((n >> 28) + 4)) ^ n).wrapping_mul(277803737);
    ((n >> 22) ^ n) as f32 / u32::MAX as f32 * 2.0 - 1.0
}
fn snare(t: f32, i: usize) -> f32 {
    let tone = (TAU * (130.0 + 55.0 * (-t * 25.0).exp()) * t).sin() * (-t * 15.0).exp() * 0.45;
    (noise(i) * 0.55 * (-t * 12.0).exp() + tone) * (-t * 8.0).exp()
}
fn hat(t: f32, _: usize) -> f32 {
    let sound: f32 = [263.0, 312.0, 421.0, 538.0, 689.0, 843.0]
        .iter()
        .map(|f| (TAU * f * t).sin().signum())
        .sum();
    sound / 6.0 * (-t * 65.0).exp() * 0.6
}
fn bell(t: f32, _: usize) -> f32 {
    (TAU * 440.0 * t + (TAU * 440.0 * 2.76 * t).sin() * (-t * 4.0).exp() * 4.0).sin()
        * (-t * 2.2).exp()
        * 0.7
}
