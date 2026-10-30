//! Indexed strips keep full frequency detail without duplicating triangle vertices.
use super::Vertex;
use std::ops::Range;
pub const SURFACE_VERTICES: usize = 65_536;
pub const SURFACE_INDICES: usize = 393_216;

#[derive(Default)]
pub struct Surface {
    pub vertices: Vec<Vertex>,
    pub indices: Vec<u32>,
    pub overflow: bool,
    depths: Vec<f32>,
}
impl Surface {
    pub fn clear(&mut self) {
        self.vertices.clear();
        self.indices.clear();
        self.overflow = false;
    }
    pub fn row(&mut self, points: impl ExactSizeIterator<Item = Vertex>) -> Option<Range<usize>> {
        if points.len() < 2 {
            return None;
        }
        let first = self.vertices.len();
        if first + points.len() > SURFACE_VERTICES {
            self.overflow = true;
            return None;
        }
        if self.vertices.capacity() == 0 {
            self.vertices.reserve_exact(SURFACE_VERTICES);
        }
        self.vertices.extend(points);
        Some(first..self.vertices.len())
    }
    /// Zipper triangulation preserves each row's original, irregular frequency coordinates.
    pub fn connect(&mut self, a: Range<usize>, b: Range<usize>) {
        let needed = (a.len() + b.len() - 2) * 3;
        if self.indices.len() + needed > SURFACE_INDICES {
            self.overflow = true;
            return;
        }
        if self.indices.capacity() == 0 {
            self.indices.reserve_exact(SURFACE_INDICES);
        }
        let (mut i, mut j) = (a.start, b.start);
        while i + 1 < a.end || j + 1 < b.end {
            let advance_a = j + 1 == b.end
                || (i + 1 < a.end
                    && self.vertices[i + 1].position[0] <= self.vertices[j + 1].position[0]);
            let next = if advance_a { i + 1 } else { j + 1 };
            self.indices
                .extend_from_slice(&[i as u32, j as u32, next as u32]);
            if advance_a {
                i += 1;
            } else {
                j += 1;
            }
        }
    }
    pub fn sort(&mut self, transform: [f32; 16]) {
        if self.depths.capacity() == 0 {
            self.depths.reserve_exact(SURFACE_VERTICES);
        }
        self.depths.clear();
        self.depths.extend(self.vertices.iter().map(|v| {
            let p = v.position;
            transform[3] * p[0] + transform[7] * p[1] + transform[11] * p[2]
        }));
        let depth = |triangle: &[u32; 3]| {
            triangle
                .iter()
                .map(|&i| self.depths[i as usize])
                .sum::<f32>()
        };
        self.indices
            .as_chunks_mut::<3>()
            .0
            .sort_unstable_by(|a, b| depth(b).total_cmp(&depth(a)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn v(x: f32, z: f32) -> Vertex {
        Vertex {
            position: [x, 1.0, z, 2.0],
            color: [1.0; 4],
        }
    }
    #[test]
    fn ragged_rows_share_vertices_and_keep_exact_peak_positions() {
        let mut mesh = Surface::default();
        let a = mesh
            .row([v(0.0, 0.0), v(0.7, 0.0), v(2.0, 0.0)].into_iter())
            .unwrap();
        let b = mesh
            .row([v(0.0, 1.0), v(1.0, 1.0), v(1.5, 1.0), v(2.0, 1.0)].into_iter())
            .unwrap();
        mesh.connect(a, b);
        assert_eq!(mesh.vertices.len(), 7);
        assert_eq!(mesh.indices.len(), 15);
        assert_eq!(mesh.vertices[1].position[0], 0.7);
        assert!(mesh.indices.iter().all(|&i| i < 7));
    }
    #[test]
    fn capacity_failure_is_explicit_and_cannot_leave_out_of_bounds_indices() {
        let mut mesh = Surface::default();
        assert!(mesh
            .row((0..SURFACE_VERTICES + 1).map(|i| v(i as f32, 0.0)))
            .is_none());
        assert!(mesh.overflow);
        assert!(mesh.vertices.is_empty());
        assert!(mesh.indices.is_empty());
        mesh.clear();
        assert!(!mesh.overflow);
    }
}

#[cfg(test)]
#[test]
fn sorted_surface_keeps_indices_and_orders_triangles_far_to_near() {
    let mut mesh = Surface::default();
    let points = |z| {
        [
            Vertex {
                position: [0.0, 0.0, z, 2.0],
                color: [1.0; 4],
            },
            Vertex {
                position: [1.0, 0.0, z, 2.0],
                color: [1.0; 4],
            },
        ]
    };
    let a = mesh.row(points(0.0).into_iter()).unwrap();
    let b = mesh.row(points(1.0).into_iter()).unwrap();
    let c = mesh.row(points(2.0).into_iter()).unwrap();
    mesh.connect(a, b.clone());
    mesh.connect(b, c);
    let mut transform = [0.0; 16];
    transform[11] = 1.0;
    mesh.sort(transform);
    let depths = mesh
        .indices
        .chunks_exact(3)
        .map(|t| {
            t.iter()
                .map(|&i| mesh.vertices[i as usize].position[2])
                .sum::<f32>()
        })
        .collect::<Vec<_>>();
    assert_eq!(mesh.indices.len(), 12);
    assert!(depths.windows(2).all(|p| p[0] >= p[1]));
    assert!(mesh.depths.capacity() <= SURFACE_VERTICES);
}
