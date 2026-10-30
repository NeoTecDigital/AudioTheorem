mod font;
mod strokes;
mod surface;
pub use strokes::{Stroke, STROKE_CAPACITY};
pub use surface::Surface;

pub const CAPACITY: usize = 262144;
pub type Color = [f32; 4];
pub const INK: Color = [0.73, 0.83, 0.84, 1.0];
pub const MUTED: Color = [0.32, 0.47, 0.50, 1.0];
pub const CYAN: Color = [0.17, 0.90, 0.97, 1.0];
pub const PROJECTED: Color = [0.65, 0.62, 0.84, 0.38];

#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct Vertex {
    pub position: [f32; 4],
    pub color: Color,
}

pub struct Mesh {
    pub vertices: Vec<Vertex>,
    pub strokes: Vec<Stroke>,
    pub surface: Surface,
    pub overflow: bool,
}

impl Mesh {
    pub fn new() -> Self {
        Self {
            vertices: Vec::with_capacity(CAPACITY),
            strokes: Vec::with_capacity(STROKE_CAPACITY),
            surface: Surface::default(),
            overflow: false,
        }
    }
    pub fn clear(&mut self) {
        self.vertices.clear();
        self.strokes.clear();
        self.surface.clear();
        self.overflow = false;
    }

    pub fn quad(&mut self, points: [[f32; 3]; 4], color: Color) {
        if self.vertices.len() + 6 > CAPACITY {
            self.overflow = true;
            return;
        }
        for index in [0, 1, 2, 0, 2, 3] {
            let [x, y, z] = points[index];
            self.vertices.push(Vertex {
                position: [x, y, z, 1.0],
                color,
            });
        }
    }

    pub fn sort_world(&mut self, transform: [f32; 16]) {
        // Transparent world geometry is composited far-to-near; HUD is appended afterwards.
        let depth = |triangle: &[Vertex; 3]| {
            triangle
                .iter()
                .map(|v| {
                    transform[3] * v.position[0]
                        + transform[7] * v.position[1]
                        + transform[11] * v.position[2]
                })
                .sum::<f32>()
        };
        self.vertices
            .as_chunks_mut::<3>()
            .0
            .sort_unstable_by(|a, b| depth(b).total_cmp(&depth(a)));
    }

    pub fn map_since(&mut self, first: usize, map: impl Fn([f32; 3]) -> [f32; 3]) {
        for vertex in &mut self.vertices[first..] {
            let [x, y, z, w] = vertex.position;
            let [x, y, z] = map([x, y, z]);
            vertex.position = [x, y, z, w];
        }
    }

    pub fn rect(&mut self, x: f32, y: f32, w: f32, h: f32, z: f32, color: Color) {
        self.quad(
            [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]],
            color,
        );
    }

    pub fn line(&mut self, a: [f32; 3], b: [f32; 3], thickness: f32, color: Color) {
        let dx = b[0] - a[0];
        let dy = b[1] - a[1];
        let len = (dx * dx + dy * dy).sqrt().max(0.001);
        let ox = if dx.abs() + dy.abs() < 0.0001 {
            thickness * 0.5
        } else {
            -dy / len * thickness * 0.5
        };
        let oy = dx / len * thickness * 0.5;
        self.quad(
            [
                [a[0] - ox, a[1] - oy, a[2]],
                [b[0] - ox, b[1] - oy, b[2]],
                [b[0] + ox, b[1] + oy, b[2]],
                [a[0] + ox, a[1] + oy, a[2]],
            ],
            color,
        );
    }

    pub fn outline(&mut self, x: f32, y: f32, w: f32, h: f32, thickness: f32, color: Color) {
        self.rect(x, y, w, thickness, 0.0, color);
        self.rect(x, y + h - thickness, w, thickness, 0.0, color);
        self.rect(x, y, thickness, h, 0.0, color);
        self.rect(x + w - thickness, y, thickness, h, 0.0, color);
    }

    pub fn border(&mut self, x: f32, y: f32, w: f32, h: f32, z: f32, color: Color) {
        self.rect(x, y, w, 0.018, z, color);
        self.rect(x, y + h - 0.018, w, 0.018, z, color);
        self.rect(x, y, 0.018, h, z, color);
        self.rect(x + w - 0.018, y, 0.018, h, z, color);
    }

    pub fn ring(&mut self, x: f32, y: f32, r: f32, z: f32, color: Color) {
        for i in 0..32 {
            let a = i as f32 * std::f32::consts::TAU / 32.0;
            let b = (i + 1) as f32 * std::f32::consts::TAU / 32.0;
            self.line(
                [x + r * a.cos(), y + r * a.sin(), z],
                [x + r * b.cos(), y + r * b.sin(), z],
                0.018,
                color,
            );
        }
    }

    pub fn diamond(&mut self, x: f32, y: f32, r: f32, z: f32, color: Color) {
        self.quad(
            [[x - r, y, z], [x, y + r, z], [x + r, y, z], [x, y - r, z]],
            color,
        );
    }

    pub fn text(&mut self, text: &str, x: f32, y: f32, scale: f32, color: Color) {
        for (index, character) in text.chars().take(90).enumerate() {
            self.glyph(
                character.to_ascii_uppercase(),
                x + index as f32 * scale * 6.0,
                y,
                scale,
                color,
            );
        }
    }

    fn glyph(&mut self, character: char, x: f32, y: f32, scale: f32, color: Color) {
        let rows = font::glyph(character);
        for (row, bits) in rows.into_iter().enumerate() {
            self.glyph_row(bits, x, y - row as f32 * scale, scale, color);
        }
    }

    fn glyph_row(&mut self, bits: u8, x: f32, y: f32, scale: f32, color: Color) {
        for col in 0..5 {
            if bits & (1 << (4 - col)) != 0 {
                self.rect(x + col as f32 * scale, y, scale, scale, 0.1, color);
            }
        }
    }
}

pub fn lerp(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    std::array::from_fn(|i| a[i] + (b[i] - a[i]) * t)
}

pub fn compatibility(value: f32, confidence: f32) -> Color {
    let emerald = [0.12, 0.79, 0.48, 1.0];
    let amber = [0.94, 0.63, 0.18, 1.0];
    let burgundy = [0.57, 0.10, 0.22, 1.0];
    let value = value.clamp(0.0, 1.0);
    let (a, b, t) = if value < 0.5 {
        (burgundy, amber, value * 2.0)
    } else {
        (amber, emerald, (value - 0.5) * 2.0)
    };
    let confidence = (confidence * 3.0).clamp(0.0, 1.0);
    std::array::from_fn(|i| MUTED[i] + (a[i] + (b[i] - a[i]) * t - MUTED[i]) * confidence)
}

pub fn intensity(mut color: Color, energy: f32) -> Color {
    let bright = energy.clamp(0.0, 1.0);
    for value in &mut color[..3] {
        *value *= bright;
    }
    color
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn neutral_evidence_has_no_false_compatibility_color() {
        assert_eq!(compatibility(0.0, 0.0), MUTED);
        assert_eq!(compatibility(1.0, 0.0), MUTED);
        assert_eq!(compatibility(7.0 / 12.0, 0.0), MUTED);
    }
    #[test]
    fn mesh_capacity_never_overruns_gpu_upload() {
        let mut mesh = Mesh::new();
        for _ in 0..CAPACITY / 6 + 10 {
            mesh.rect(0.0, 0.0, 1.0, 1.0, 0.0, INK);
        }
        assert!(mesh.vertices.len() <= CAPACITY);
        assert_eq!(mesh.vertices.len() % 3, 0);
    }
}
