use super::{
    super::mesh::{compatibility, Mesh, CYAN, MUTED, PROJECTED},
    emission, matrix_position, spatial,
};
use crate::contracts::{AnalysisFrame, Contribution, Snapshot};
use std::collections::VecDeque;

const LIFE: f32 = 1.8;
struct Event {
    link: Contribution,
    start: [f32; 3],
    end: [f32; 3],
    emitted: u64,
}
pub struct Particles {
    events: VecDeque<Event>,
    epoch: u64,
    last_end: u64,
}

impl Particles {
    pub fn new() -> Self {
        Self {
            events: VecDeque::with_capacity(16384),
            epoch: 0,
            last_end: 0,
        }
    }

    fn ingest(&mut self, frame: &AnalysisFrame, state: &Snapshot) {
        if self.epoch != frame.epoch || frame.gap {
            self.events.clear();
            self.epoch = frame.epoch;
            self.last_end = 0;
        }
        if frame.end == self.last_end {
            return;
        }
        self.last_end = frame.end;
        for layer in ["logical", "measured", "projected"] {
            let mut links: Vec<_> = frame
                .contributions
                .iter()
                .filter(|c| c.layer == layer && c.energy > 1e-9)
                .collect();
            links.sort_by(|a, b| b.energy.total_cmp(&a.energy));
            for link in links
                .into_iter()
                .take(if layer == "measured" { 32 } else { 16 })
            {
                self.emit(state, frame, link);
            }
        }
        let age = (state.device.sample_rate as f32 * LIFE) as u64;
        while self
            .events
            .front()
            .is_some_and(|e| e.emitted.saturating_add(age) < state.sample)
        {
            self.events.pop_front();
        }
    }

    fn emit(&mut self, state: &Snapshot, frame: &AnalysisFrame, link: &Contribution) {
        let Some((start, end)) = endpoints(state, frame, link) else {
            return;
        };
        let response = emission::response(link.energy);
        for index in 0..response.count {
            if self.events.len() == 16384 {
                self.events.pop_front();
            }
            // Subdivide the actual published interval, not wall-clock animation time.
            let offset =
                frame.end.saturating_sub(frame.start) * index as u64 / response.count as u64;
            let seed = frame.end ^ link.source ^ link.hz.to_bits() as u64 ^ index as u64;
            self.events.push_back(Event {
                link: link.clone(),
                start: emission::origin(start, response.radius, seed),
                end,
                emitted: frame.end - offset,
            });
        }
    }

    pub fn draw(
        &mut self,
        mesh: &mut Mesh,
        state: &Snapshot,
        frame: &AnalysisFrame,
        budget: usize,
    ) {
        self.ingest(frame, state);
        if state.view.history_offset > 0.0 {
            return;
        }
        for layer in ["measured", "logical", "projected"] {
            for link in frame
                .contributions
                .iter()
                .filter(|c| c.layer == layer && visible(c, state))
                .take(12)
            {
                path(mesh, state, frame, link);
            }
        }
        if state.view.reduced_motion {
            return;
        }
        let available = (super::super::mesh::CAPACITY - mesh.vertices.len()) / 12;
        let count = self.events.len().max(1);
        let step = count.div_ceil(budget.min(16384).min(available).max(1));
        // Stratify over history rather than only retaining the newborn end of each stream.
        for event in self
            .events
            .iter()
            .step_by(step)
            .filter(|e| visible(&e.link, state))
        {
            particle(mesh, state, frame, event);
        }
    }
}

fn visible(link: &Contribution, state: &Snapshot) -> bool {
    match link.layer.as_str() {
        "logical" => state.view.logical,
        "projected" => state.view.projected,
        "measured" => state.view.measured,
        _ => false,
    }
}

fn endpoints(
    state: &Snapshot,
    frame: &AnalysisFrame,
    link: &Contribution,
) -> Option<([f32; 3], [f32; 3])> {
    if link.layer == "processing" || link.hz <= 0.0 || link.target_hz <= 0.0 {
        return None;
    }
    let mut end = spatial::spectrum(frame, link.target_hz, state.device.sample_rate);
    if link.layer == "projected" {
        end[1] = spatial::BASE_Y;
    }
    // Out-of-matrix evidence stays at its exact spectrum position, never a clamped cell.
    let start = matrix_position(link.hz, false)?;
    Some((start, end))
}

fn color(link: &Contribution, frame: &AnalysisFrame) -> [f32; 4] {
    match link.layer.as_str() {
        "projected" => PROJECTED,
        "logical" => CYAN,
        _ => super::pitch(link.target_hz)
            .map(|(pc, _)| {
                compatibility(frame.measured.compatibility[pc], frame.measured.confidence)
            })
            .unwrap_or(MUTED),
    }
}

fn path(mesh: &mut Mesh, state: &Snapshot, frame: &AnalysisFrame, link: &Contribution) {
    let Some((a, b)) = endpoints(state, frame, link) else {
        return;
    };
    let mut color = color(link, frame);
    let response = emission::response(link.energy);
    if link.layer == "measured" {
        emission::footprint(mesh, a, response, color);
    }
    color[3] = response.level
        * if link.layer == "projected" {
            0.13
        } else {
            0.22
        };
    let step = if link.layer == "projected" { 2 } else { 1 };
    for i in (0..40).step_by(step) {
        mesh.line(
            spatial::stream(a, b, i as f32 / 40.0),
            spatial::stream(a, b, (i + 1) as f32 / 40.0),
            0.012,
            color,
        );
    }
    // A separate temporal link identifies actual PCM intervals; never maps frequency to sample index.
    if link.layer != "projected" {
        temporal_link(mesh, frame, link, b, color);
    }
}

fn temporal_link(
    mesh: &mut Mesh,
    frame: &AnalysisFrame,
    link: &Contribution,
    start: [f32; 3],
    mut color: [f32; 4],
) {
    let Some(endpoint) =
        super::waterfall::temporal_anchor(&frame.stream_history, link.sample, link.end_sample)
    else {
        return;
    };
    color[3] *= 0.3;
    mesh.line(start, endpoint, 0.008, color);
}

fn particle(mesh: &mut Mesh, state: &Snapshot, frame: &AnalysisFrame, event: &Event) {
    let age =
        state.sample.saturating_sub(event.emitted) as f32 / state.device.sample_rate.max(1) as f32;
    if age >= LIFE {
        return;
    }
    let t = (age / LIFE).clamp(0.0, 1.0);
    let p = spatial::stream(event.start, event.end, t);
    let tail = spatial::stream(event.start, event.end, (t - 0.025).max(0.0));
    let mut color = color(&event.link, frame);
    let response = emission::response(event.link.energy);
    color[3] *= response.level * (1.0 - t * 0.5);
    let size = response.size * if state.view.immersive { 1.375 } else { 1.0 };
    mesh.line(tail, p, size * 0.6, color);
    mesh.diamond(p[0], p[1], size, p[2], color);
}

#[cfg(test)]
mod tests {
    use super::*;
    fn link() -> Contribution {
        Contribution {
            layer: "measured".into(),
            hz: 440.0,
            target_hz: 440.0,
            energy: 0.1,
            sample: 1000,
            end_sample: 1200,
            ..Default::default()
        }
    }
    #[test]
    fn stream_reaches_exact_frequency_and_measured_height_through_real_depth() {
        let state = super::super::fixtures::snapshot();
        let frame = state.analysis.as_ref().unwrap();
        let (a, b) = endpoints(&state, frame, &link()).unwrap();
        assert_eq!(a[2], spatial::WALL_Z);
        assert_eq!(b, spatial::spectrum(frame, 440.0, 48000));
        assert_eq!(spatial::stream(a, b, 0.0), a);
        assert_eq!(spatial::stream(a, b, 1.0), b);
        assert!(spatial::stream(a, b, 0.5)[2] > a[2] + 3.0);
    }
    #[test]
    fn projection_cannot_claim_measured_height_or_pcm_and_processing_has_no_path() {
        let state = super::super::fixtures::snapshot();
        let frame = state.analysis.as_ref().unwrap();
        let mut projected = link();
        projected.layer = "projected".into();
        let (_, b) = endpoints(&state, frame, &projected).unwrap();
        assert_eq!(b[1], spatial::BASE_Y);
        let mut mesh = Mesh::new();
        path(&mut mesh, &state, frame, &projected);
        assert!(mesh
            .vertices
            .iter()
            .all(|v| v.position[2] <= spatial::SHORE_Z));
        projected.layer = "processing".into();
        assert!(endpoints(&state, frame, &projected).is_none());
    }
    #[test]
    fn selected_history_rejects_unrelated_temporal_links_without_hiding_spectrum_stream() {
        let state = super::super::fixtures::snapshot();
        let frame = state.analysis.as_ref().unwrap();
        let mut outside = link();
        outside.sample = 96000;
        outside.end_sample = 97000;
        let mut mesh = Mesh::new();
        temporal_link(&mut mesh, frame, &outside, [0.0; 3], CYAN);
        assert!(mesh.vertices.is_empty());
        assert!(endpoints(&state, frame, &outside).is_some());
    }
    #[test]
    fn paused_audio_freezes_particles_and_gaps_clear_stream_history() {
        let state = super::super::fixtures::snapshot();
        let mut frame = state.analysis.clone().unwrap();
        let mut particles = Particles::new();
        particles.ingest(&frame, &state);
        let count = particles.events.len();
        particles.ingest(&frame, &state);
        assert_eq!(particles.events.len(), count);
        frame.gap = true;
        frame.contributions.clear();
        particles.ingest(&frame, &state);
        assert!(particles.events.is_empty());
    }

    #[test]
    fn measured_events_spread_with_power_but_keep_exact_spectral_destination() {
        let state = super::super::fixtures::snapshot();
        let frame = state.analysis.as_ref().unwrap();
        let mut particles = Particles::new();
        let mut contribution = link();
        contribution.hz *= 2.0_f32.powf(22.0 / 1200.0);
        contribution.target_hz = contribution.hz;
        let center = matrix_position(contribution.hz, false).unwrap();
        for power in [1e-6, 0.001, 0.1] {
            contribution.energy = power;
            particles.events.clear();
            particles.emit(&state, frame, &contribution);
            let response = emission::response(power);
            assert_eq!(particles.events.len(), response.count);
            for event in &particles.events {
                assert!(
                    (event.start[0] - center[0]).hypot(event.start[1] - center[1])
                        <= response.radius + 1e-6
                );
                assert_eq!(event.end, spatial::spectrum(frame, contribution.hz, 48000));
                assert_eq!(event.link.energy, power);
            }
        }
    }
    #[test]
    fn stream_history_and_draw_stay_bounded_under_maximum_input() {
        let mut state = super::super::fixtures::snapshot();
        let mut frame = state.analysis.clone().unwrap();
        frame.contributions.clear();
        for layer in ["logical", "measured", "projected"] {
            for source in 0..32 {
                frame.contributions.push(Contribution {
                    layer: layer.into(),
                    source,
                    energy: 1.0,
                    ..link()
                });
            }
        }
        let mut particles = Particles::new();
        for index in 0..400 {
            state.sample = 48000 + index * 256;
            frame.start = state.sample - 256;
            frame.end = state.sample;
            particles.ingest(&frame, &state);
        }
        assert_eq!(particles.events.len(), 16384);
        let mut mesh = Mesh::new();
        particles.draw(&mut mesh, &state, &frame, 16384);
        assert!(mesh.vertices.len() <= super::super::super::mesh::CAPACITY);
        assert!(mesh
            .vertices
            .iter()
            .all(|v| v.position.iter().all(|x| x.is_finite())));
    }
}
