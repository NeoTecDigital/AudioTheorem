//! Bounded amplitude response for contribution emitters; never normalized to the loudest band.
use super::matrix_layout;
use crate::visualizer::mesh::{Color, Mesh};

#[derive(Clone, Copy, Debug, Default)]
pub struct Response {
    pub level: f32,
    pub radius: f32,
    pub size: f32,
    pub count: usize,
}

pub fn response(power: f32) -> Response {
    if !power.is_finite() || power <= 0.0 {
        return Response::default();
    }
    // sqrt(power) is amplitude; a fixed square-root display response keeps quiet bands visible.
    let level = power.sqrt().clamp(0.0, 1.0).sqrt();
    Response {
        level,
        radius: 0.13 * matrix_layout::SCALE * level,
        size: 0.085 * level,
        count: (level * 3.0).ceil() as usize,
    }
}

/// Deterministic spread illustrates emission strength, not pitch uncertainty or extra frequencies.
pub fn origin(center: [f32; 3], radius: f32, seed: u64) -> [f32; 3] {
    let hash = seed.wrapping_mul(0x9e3779b97f4a7c15).rotate_left(29);
    let angle = hash as u32 as f32 / u32::MAX as f32 * std::f32::consts::TAU;
    let distance = ((hash >> 32) as f32 / u32::MAX as f32).sqrt() * radius;
    [
        center[0] + angle.cos() * distance,
        center[1] + angle.sin() * distance,
        center[2],
    ]
}

pub fn footprint(mesh: &mut Mesh, center: [f32; 3], response: Response, mut color: Color) {
    if response.radius == 0.0 {
        return;
    }
    color[3] *= response.level * 0.35;
    let [x, y, z] = center;
    let center = [x, y, z + 0.04];
    for index in 0..16 {
        let edge = |i: usize| {
            let angle = i as f32 / 16.0 * std::f32::consts::TAU;
            [
                x + angle.cos() * response.radius,
                y + angle.sin() * response.radius,
                z + 0.04,
            ]
        };
        mesh.quad([center, edge(index), edge(index + 1), center], color);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absolute_power_controls_radius_intensity_size_and_density_without_quiet_floor() {
        let mut previous = Response::default();
        for power in [0.0, 1e-8, 1e-6, 1e-4, 0.01, 0.25, 1.0] {
            let value = response(power);
            assert!(value.level >= previous.level && value.radius >= previous.radius);
            assert!(value.size >= previous.size && value.count >= previous.count);
            assert!(value.count <= 3 && value.radius <= 0.26);
            previous = value;
        }
        assert_eq!(response(0.0).level, 0.0);
        assert_eq!(response(0.0).count, 0);
        assert_eq!(response(f32::NAN).radius, 0.0);
        assert_eq!(response(f32::INFINITY).count, 0);
        assert_eq!(response(-1.0).level, 0.0);
        assert!((response(0.0625).level - 0.5).abs() < 1e-6);
    }

    #[test]
    fn deterministic_emission_disc_stays_bounded_and_silent_power_draws_nothing() {
        let center = [1.0, 2.0, -4.8];
        let radius = response(0.01).radius;
        for seed in 0..256 {
            let point = origin(center, radius, seed);
            assert_eq!(point, origin(center, radius, seed));
            let distance = (point[0] - center[0]).hypot(point[1] - center[1]);
            assert!(distance <= radius + 1e-6);
            assert_eq!(point[2], center[2]);
        }
        let mut mesh = Mesh::new();
        footprint(&mut mesh, center, response(0.0), [1.0; 4]);
        assert!(mesh.vertices.is_empty());
        footprint(&mut mesh, center, response(1.0), [1.0; 4]);
        assert_eq!(mesh.vertices.len(), 16 * 6);
    }
}
