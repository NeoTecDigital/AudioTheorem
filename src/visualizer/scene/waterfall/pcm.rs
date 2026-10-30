use super::{fraction, pcm_point, DEPTH};
use crate::contracts::{PcmSlice, StreamHistory, WavePoint};
use crate::visualizer::{
    mesh::{Mesh, CYAN, INK},
    scene::spatial,
};

pub fn row(mesh: &mut Mesh, history: &StreamHistory, row: &PcmSlice) {
    let Some(age) = fraction(history, row.end) else {
        return;
    };
    let z = spatial::SHORE_Z + age * DEPTH;
    let level = row
        .points
        .iter()
        .flat_map(|p| p.min.into_iter().chain(p.max))
        .map(f32::abs)
        .fold(0.0, f32::max);
    for channel in 0..2 {
        let mut color = if channel == 0 { CYAN } else { INK };
        color[3] = (0.08 + 0.42 * level.clamp(0.0, 1.0).sqrt()) * (1.0 - age * 0.56);
        for pair in row.points.windows(2) {
            segment(mesh, row, [&pair[0], &pair[1]], channel, z, color);
        }
        if let Some(point) = row.points.last() {
            tail(mesh, row, point, channel, z, color);
        }
    }
}

pub(super) fn segment(
    mesh: &mut Mesh,
    row: &PcmSlice,
    pair: [&WavePoint; 2],
    channel: usize,
    z: f32,
    color: [f32; 4],
) {
    let [a, b] = pair;
    if a.end != b.start {
        return;
    }
    let raw = a.end - a.start == 1 && b.end - b.start == 1 && a.min == a.max && b.min == b.max;
    if raw {
        mesh.stroke(
            pcm_point(row, a.start, channel, a.min[channel], z),
            pcm_point(row, b.start, channel, b.min[channel], z),
            1.0,
            color,
        );
        return;
    }
    // Envelope boundaries preserve signed extrema. Never call their midpoint a PCM sample.
    for upper in [false, true] {
        let value = |p: &WavePoint| {
            if upper {
                p.max[channel]
            } else {
                p.min[channel]
            }
        };
        mesh.stroke(
            pcm_point(row, a.start, channel, value(a), z),
            pcm_point(row, b.start, channel, value(b), z),
            1.0,
            color,
        );
    }
}

fn tail(mesh: &mut Mesh, row: &PcmSlice, p: &WavePoint, channel: usize, z: f32, color: [f32; 4]) {
    if p.end - p.start == 1 && p.min == p.max {
        let [x, y, z] = pcm_point(row, p.start, channel, p.min[channel], z);
        mesh.diamond(x, y, 0.009, z, color);
        return;
    }
    for value in [p.min[channel], p.max[channel]] {
        mesh.stroke(
            pcm_point(row, p.start, channel, value, z),
            pcm_point(row, p.end, channel, value, z),
            1.0,
            color,
        );
    }
}
