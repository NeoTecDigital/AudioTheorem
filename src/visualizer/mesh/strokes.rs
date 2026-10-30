use super::{Color, Mesh};
pub const STROKE_CAPACITY: usize = 100_000;
/// Generic instanced capsule, width in physical pixels. b.w<0 means clip-space.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct Stroke {
    pub a: [f32; 4],
    pub b: [f32; 4],
    pub color: Color,
}
impl Mesh {
    pub fn stroke(&mut self, a: [f32; 3], b: [f32; 3], width: f32, color: Color) {
        if self.strokes.len() == STROKE_CAPACITY {
            self.overflow = true;
            return;
        }
        self.strokes.push(Stroke {
            a: [a[0], a[1], a[2], width.clamp(0.1, 32.0)],
            b: [b[0], b[1], b[2], 1.0],
            color,
        });
    }
    pub fn sort_strokes(&mut self, transform: [f32; 16]) {
        let depth = |s: &Stroke| {
            (0..3)
                .map(|i| transform[i * 4 + 3] * (s.a[i] + s.b[i]))
                .sum::<f32>()
        };
        self.strokes
            .sort_unstable_by(|a, b| depth(b).total_cmp(&depth(a)));
    }
}
