//! Shared world coordinates: upright source wall, depth-running streams, spectral shore.
use super::super::mesh::lerp;
use crate::contracts::AnalysisFrame;

pub const WALL_Z: f32 = -4.8;
pub const SHORE_Z: f32 = 4.5;
pub const BASE_Y: f32 = -1.6;

pub fn spectrum_x(hz: f32, rate: u32) -> f32 {
    let hi = (rate as f32 * 0.5).max(2.0);
    -7.4 + 14.8 * hz.max(1.0).ln() / hi.ln()
}

pub fn height(power: f32) -> f32 {
    ((10.0 * power.max(1e-12).log10() + 90.0) / 90.0).clamp(0.0, 1.0) * 3.6
}

pub fn spectrum(frame: &AnalysisFrame, hz: f32, rate: u32) -> [f32; 3] {
    let index = frame.spectrum.partition_point(|p| p.hz < hz);
    let right = frame.spectrum.get(index);
    let left = index.checked_sub(1).and_then(|i| frame.spectrum.get(i));
    let y = match (left, right) {
        (Some(a), Some(b)) => {
            let xa = spectrum_x(a.hz, rate);
            let xb = spectrum_x(b.hz, rate);
            let t = (spectrum_x(hz, rate) - xa) / (xb - xa).max(f32::EPSILON);
            height(a.power) + (height(b.power) - height(a.power)) * t
        }
        (_, Some(p)) | (Some(p), _) => height(p.power),
        _ => 0.0,
    };
    [spectrum_x(hz, rate), BASE_Y + y, SHORE_Z]
}

/// Bezier endpoints are data coordinates; only the connecting route is illustrative.
pub fn stream(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    let c = [a[0], a[1], a[2] + (b[2] - a[2]) * 0.38];
    let d = [b[0], b[1], b[2] - (b[2] - a[2]) * 0.30];
    let ab = lerp(a, c, t);
    let bc = lerp(c, d, t);
    let cd = lerp(d, b, t);
    lerp(lerp(ab, bc, t), lerp(bc, cd, t), t)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contracts::SpectrumPoint;
    #[test]
    fn between_bin_endpoint_lies_on_rendered_log_frequency_profile() {
        let frame = AnalysisFrame {
            spectrum: vec![
                SpectrumPoint {
                    hz: 440.0,
                    power: 0.01,
                    ..Default::default()
                },
                SpectrumPoint {
                    hz: 880.0,
                    power: 0.00001,
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        let p = spectrum(&frame, (440.0_f32 * 880.0).sqrt(), 48000);
        assert!((p[1] - (BASE_Y + (height(0.01) + height(0.00001)) * 0.5)).abs() < 1e-5);
    }
}
