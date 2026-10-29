//! Bounded FIR anti-aliasing for off-thread file resampling and sample mipmaps.
pub struct LowPass {
    history: [[f32; 2]; 63],
    taps: [f32; 63],
    cursor: usize,
}
impl LowPass {
    pub fn new(cutoff: f32) -> Self {
        let mut taps = [0.0; 63];
        for (i, tap) in taps.iter_mut().enumerate() {
            let x = i as f32 - 31.0;
            let sinc = if x == 0.0 {
                2.0 * cutoff
            } else {
                (std::f32::consts::TAU * cutoff * x).sin() / (std::f32::consts::PI * x)
            };
            let window = 0.42 - 0.5 * (std::f32::consts::TAU * i as f32 / 62.0).cos()
                + 0.08 * (2.0 * std::f32::consts::TAU * i as f32 / 62.0).cos();
            *tap = sinc * window;
        }
        let sum: f32 = taps.iter().sum();
        for tap in &mut taps {
            *tap /= sum;
        }
        Self {
            history: [[0.0; 2]; 63],
            taps,
            cursor: 0,
        }
    }
    pub fn push(&mut self, frame: [f32; 2]) -> [f32; 2] {
        self.history[self.cursor] = frame;
        self.cursor = (self.cursor + 1) % 63;
        let mut out = [0.0; 2];
        for (i, tap) in self.taps.iter().enumerate() {
            let value = self.history[(self.cursor + i) % 63];
            out[0] += tap * value[0];
            out[1] += tap * value[1];
        }
        out
    }
}

pub fn mipmaps(pcm: Vec<f32>) -> Vec<Vec<f32>> {
    let mut levels = vec![pcm];
    while levels.last().unwrap().len() > 64 {
        let previous = levels.last().unwrap();
        let mut filter = LowPass::new(0.20);
        let mut next = Vec::with_capacity(previous.len() / 2);
        for (i, sample) in previous.iter().enumerate() {
            let value = filter.push([*sample, *sample]);
            if i % 2 == 0 {
                next.push(value[0]);
            }
        }
        levels.push(next);
    }
    levels
}
