use crate::contracts::{Action, Command, Controls, View};

pub fn finite_range(value: f32, low: f32, high: f32) -> bool {
    value.is_finite() && (low..=high).contains(&value)
}

pub fn controls(c: &Controls) -> Result<(), String> {
    let values = [
        (c.gain, 0.0, 0.8),
        (c.attack, 0.001, 5.0),
        (c.decay, 0.001, 5.0),
        (c.sustain, 0.0, 1.0),
        (c.release, 0.005, 10.0),
        (c.cutoff, 20.0, 20000.0),
        (c.fm_hz, 0.0, 1000.0),
        (c.fm_depth, 0.0, 500.0),
        (c.am_depth, 0.0, 1.0),
        (c.morph, 0.0, 1.0),
    ];
    if values.iter().any(|&(v, l, h)| !finite_range(v, l, h)) {
        return Err("control outside finite supported range".into());
    }
    if c.lfo_hz.iter().any(|&v| !finite_range(v, 0.0, 20.0)) {
        return Err("LFO frequency 0..20 Hz".into());
    }
    if c.lfo_depth.iter().any(|&v| !finite_range(v, 0.0, 1.0)) {
        return Err("LFO depth 0..1".into());
    }
    if c.lfo_destination.iter().any(|&v| v > 3) {
        return Err("unknown LFO destination".into());
    }
    Ok(())
}

pub fn view(v: &View) -> Result<(), String> {
    if !finite_range(v.history_seconds, 0.002, 30.0) || !finite_range(v.history_offset, 0.0, 30.0) {
        return Err("invalid waveform history range".into());
    }
    if !finite_range(v.yaw, -6.3, 6.3)
        || !finite_range(v.pitch, -1.5, 1.5)
        || !finite_range(v.distance, 4.0, 80.0)
    {
        return Err("invalid finite camera range".into());
    }
    Ok(())
}

pub fn command(c: &Command, now: u64, rate: u32) -> Result<(), String> {
    if c.id == 0 || c.id > 9_007_199_254_740_991 {
        return Err("invalid command id".into());
    }
    if c.at_sample
        .is_some_and(|t| t > now.saturating_add(rate as u64))
    {
        return Err("schedule exceeds one-second lookahead".into());
    }
    match &c.action {
        Action::Start {
            voice,
            hz,
            velocity,
            instrument,
        } => {
            if *voice == 0
                || *voice > 9_007_199_254_740_991
                || *instrument > 5
                || !finite_range(*hz, 8.0, 8000.0)
                || !finite_range(*velocity, 0.0, 1.0)
            {
                return Err(
                    "start requires voice, 8..8000 Hz, velocity 0..1, instrument 0..5".into(),
                );
            }
        }
        Action::Controls { controls: c } => controls(c)?,
        Action::View { view: v } => view(v)?,
        Action::Wavetable { samples } => check_array(samples, 32, 2048, -1.0, 1.0)?,
        Action::Partials { amplitudes } => check_array(amplitudes, 1, 32, 0.0, 1.0)?,
        Action::Seek { seconds } if !seconds.is_finite() || !(0.0..=600.0).contains(seconds) => {
            return Err("seek must be finite, 0..600 seconds".into());
        }
        _ => {}
    }
    Ok(())
}

fn check_array(v: &[f32], min: usize, max: usize, low: f32, high: f32) -> Result<(), String> {
    if !(min..=max).contains(&v.len()) || v.iter().any(|&f| !finite_range(f, low, high)) {
        return Err(format!(
            "expected {min}..{max} finite values in {low}..{high}"
        ));
    }
    Ok(())
}
