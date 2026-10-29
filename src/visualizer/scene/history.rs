use super::super::mesh::{Mesh, CYAN, INK};
use crate::contracts::{AnalysisFrame, Snapshot};
use std::collections::VecDeque;

struct Point {
    sample: u64,
    tension: [f32; 2],
}
pub struct CadenceHistory {
    epoch: u64,
    points: VecDeque<Point>,
}

impl CadenceHistory {
    pub fn new() -> Self {
        Self {
            epoch: 0,
            points: VecDeque::with_capacity(2048),
        }
    }

    pub fn draw(&mut self, mesh: &mut Mesh, state: &Snapshot, frame: &AnalysisFrame) {
        if self.epoch != frame.epoch || frame.gap {
            self.epoch = frame.epoch;
            self.points.clear();
        }
        if self
            .points
            .back()
            .is_none_or(|point| point.sample != frame.end)
        {
            if self.points.len() == 2048 {
                self.points.pop_front();
            }
            self.points.push_back(Point {
                sample: frame.end,
                tension: [
                    frame.logical_cadence.tension,
                    frame.measured_cadence.tension,
                ],
            });
        }
        let span = u64::from(state.device.sample_rate.max(1)) * 30;
        while self
            .points
            .front()
            .is_some_and(|point| point.sample.saturating_add(span) < state.sample)
        {
            self.points.pop_front();
        }
        if !state.view.cadence {
            return;
        }
        for layer in 0..2 {
            self.trace(mesh, state.sample, span, layer);
        }
    }

    fn trace(&self, mesh: &mut Mesh, sample: u64, span: u64, layer: usize) {
        let mut previous = None;
        let color = if layer == 0 { CYAN } else { INK };
        for point in &self.points {
            let age = sample.saturating_sub(point.sample) as f32 / span as f32;
            let x = 8.1 - age * 8.4;
            let y = -4.60 - layer as f32 * 0.43 + (point.tension[layer] - 0.5) * 0.28;
            let current = [x, y, 0.1];
            if let Some(prior) = previous {
                mesh.line(prior, current, 0.013, color);
            }
            previous = Some(current);
        }
    }
}
