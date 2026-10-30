mod compass;
mod emission;
mod field;
mod history;
mod hud;
mod labels;
mod matrix_layout;
mod menu;
mod particles;
#[cfg(test)]
mod selection;
mod song;
mod spatial;
mod traces;
mod waterfall;
use super::mesh::{Mesh, Vertex};
use crate::contracts::Snapshot;
use particles::Particles;
use std::time::Duration;

pub struct Scene {
    mesh: Mesh,
    hud: Mesh,
    particles: Particles,
    cadence_history: history::CadenceHistory,
    quality: usize,
    fast_frames: usize,
    hud_start: usize,
}

impl Scene {
    pub fn new() -> Self {
        Self {
            mesh: Mesh::new(),
            hud: Mesh::new(),
            particles: Particles::new(),
            cadence_history: history::CadenceHistory::new(),
            quality: 4096,
            fast_frames: 0,
            hud_start: 0,
        }
    }

    #[cfg(test)]
    pub fn build(&mut self, state: &Snapshot) -> &[Vertex] {
        self.build_frame(
            state,
            1920,
            1080,
            &crate::native_input::Status {
                menu_open: false,
                octave: 4,
                instrument: 0,
                focused: true,
                pending: 0,
                error: None,
            },
        )
    }

    #[cfg(test)]
    pub fn build_frame(
        &mut self,
        state: &Snapshot,
        width: u32,
        height: u32,
        input: &crate::native_input::Status<'_>,
    ) -> &[Vertex] {
        let mut navigation = crate::native_input::timeline::Timeline::default();
        navigation.sync(state);
        self.build_navigation(state, width, height, input, &navigation)
    }

    #[cfg(feature = "native")]
    pub fn geometry(&self) -> super::nova_ffi::Geometry<'_> {
        super::nova_ffi::Geometry {
            vertices: &self.mesh.vertices,
            strokes: &self.mesh.strokes,
            surface: &self.mesh.surface,
            hud_start: self.hud_start,
        }
    }

    pub fn build_navigation(
        &mut self,
        state: &Snapshot,
        width: u32,
        height: u32,
        input: &crate::native_input::Status<'_>,
        navigation: &crate::native_input::timeline::Timeline,
    ) -> &[Vertex] {
        self.mesh.clear();
        self.hud.clear();
        labels::world(&mut self.mesh, state);
        if let Some(frame) = &state.analysis {
            field::matrix(&mut self.mesh, state, frame);
            if state.view.history_offset == 0.0 {
                traces::spectrum(&mut self.mesh, state, frame);
            }
            waterfall::draw(&mut self.mesh, state, frame);
            let budget = if state.view.immersive {
                self.quality * 4
            } else {
                self.quality
            };
            labels::analysis(&mut self.mesh, state, frame);
            self.particles.draw(&mut self.mesh, state, frame, budget);
        }
        song::draw(&mut self.mesh, state, navigation);
        hud::draw(
            &mut self.hud,
            state,
            input,
            [width, height],
            &mut self.cadence_history,
            navigation,
        );
        self.finish(state, width, height)
    }

    fn finish(&mut self, state: &Snapshot, width: u32, height: u32) -> &[Vertex] {
        if self.mesh.overflow
            || self.mesh.surface.overflow
            || self.mesh.vertices.len() + self.hud.vertices.len() > super::mesh::CAPACITY
        {
            self.mesh.overflow = true;
            self.quality = (self.quality / 2).max(128);
            hud::budget_warning(&mut self.hud, [width, height]);
        }
        let available = super::mesh::CAPACITY.saturating_sub(self.hud.vertices.len()) / 3 * 3;
        self.mesh.vertices.truncate(available);
        let transform = super::camera::Camera.matrix(&state.view, width, height);
        self.mesh.sort_world(transform);
        self.mesh.sort_strokes(transform);
        self.mesh.surface.sort(transform);
        self.hud_start = self.mesh.vertices.len();
        self.mesh.vertices.extend_from_slice(&self.hud.vertices);
        &self.mesh.vertices
    }

    pub fn adjust_quality(&mut self, elapsed: Duration) {
        if elapsed.as_micros() > 16_700 {
            self.quality = (self.quality / 2).max(128);
            self.fast_frames = 0;
        } else {
            self.fast_frames += 1;
        }
        if self.fast_frames > 300 {
            self.quality = (self.quality * 2).min(4096);
            self.fast_frames = 0;
        }
    }
}

pub fn pitch(hz: f32) -> Option<(usize, usize)> {
    if !hz.is_finite() || hz <= 0.0 {
        return None;
    }
    let midi = (69.0 + 12.0 * (hz / 440.0).log2()).round();
    if !(0.0..144.0).contains(&midi) {
        return None;
    }
    Some((midi as usize % 12, midi as usize / 12))
}

pub fn matrix_position(hz: f32, _immersive: bool) -> Option<[f32; 3]> {
    matrix_layout::local_frequency(hz).map(matrix_layout::transform)
}

pub use spatial::spectrum_x;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missed_budget_reduces_decorations_then_recovers() {
        let mut scene = Scene::new();
        scene.adjust_quality(Duration::from_millis(20));
        assert_eq!(scene.quality, 2048);
        for _ in 0..301 {
            scene.adjust_quality(Duration::from_millis(8));
        }
        assert_eq!(scene.quality, 4096);
    }
    #[test]
    fn matrix_mapping_keeps_out_of_range_frequencies_outside() {
        assert_eq!(pitch(440.0), Some((9, 5)));
        assert_eq!(pitch(8.175799), Some((0, 0)));
        assert_eq!(pitch(1.0), None);
        assert_eq!(pitch(40_000.0), None);
        assert_eq!(pitch(f32::NAN), None);
    }
    #[test]
    fn spectrum_coordinates_are_not_pcm_indices() {
        assert!(spectrum_x(440.0, 48000) < spectrum_x(880.0, 48000));
        assert!((spectrum_x(24000.0, 48000) - 7.4).abs() < 0.001);
    }
}

#[cfg(test)]
mod fixtures;

#[cfg(test)]
mod fixture_history;
