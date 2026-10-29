//! Bounded content decoding on the coordinator, never in the callback.
use std::io::Cursor;

pub const MAX_BYTES: usize = 256 * 1024 * 1024;
pub struct Asset {
    pub id: u64,
    pub frames: Vec<[f32; 2]>,
    pub rate: u32,
}

pub fn decode(id: u64, bytes: Vec<u8>, rate: u32) -> Result<Asset, String> {
    if bytes.len() > MAX_BYTES {
        return Err("import exceeds 256 MiB".into());
    }
    let frames = match bytes.get(..4) {
        Some(b"RIFF") => wav(bytes, rate)?,
        Some(b"fLaC") => flac(bytes, rate)?,
        _ => return Err("only uploaded WAV/FLAC content is supported".into()),
    };
    if frames.is_empty() {
        return Err("empty audio file".into());
    }
    Ok(Asset { id, frames, rate })
}

fn format(rate: u32, channels: u32, frames: u64) -> Result<(), String> {
    if !(8000..=192000).contains(&rate) || !(1..=2).contains(&channels) {
        return Err("file must be mono/stereo, 8..192 kHz".into());
    }
    if frames > rate as u64 * 600 {
        return Err("file exceeds ten minutes".into());
    }
    Ok(())
}

fn wav(bytes: Vec<u8>, rate: u32) -> Result<Vec<[f32; 2]>, String> {
    let mut reader = hound::WavReader::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let spec = reader.spec();
    format(spec.sample_rate, spec.channels as u32, 0)?;
    format(
        spec.sample_rate,
        spec.channels as u32,
        reader.duration() as u64,
    )?;
    let mut resampler = Resampler::new(spec.sample_rate, rate);
    let channels = spec.channels as usize;
    if spec.sample_format == hound::SampleFormat::Float {
        collect(
            reader
                .samples::<f32>()
                .map(|r| r.map_err(|e| e.to_string())),
            channels,
            &mut resampler,
        )?;
    } else {
        if spec.bits_per_sample == 0 || spec.bits_per_sample > 32 {
            return Err("invalid PCM bit depth".into());
        }
        let scale = 2.0_f32.powi(spec.bits_per_sample as i32 - 1);
        collect(
            reader
                .samples::<i32>()
                .map(|r| r.map(|s| s as f32 / scale).map_err(|e| e.to_string())),
            channels,
            &mut resampler,
        )?;
    }
    Ok(resampler.finish())
}

fn flac(bytes: Vec<u8>, rate: u32) -> Result<Vec<[f32; 2]>, String> {
    let mut reader = claxon::FlacReader::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let info = reader.streaminfo();
    format(info.sample_rate, info.channels, info.samples.unwrap_or(0))?;
    if info.bits_per_sample == 0 || info.bits_per_sample > 32 {
        return Err("invalid FLAC bit depth".into());
    }
    let scale = 2.0_f32.powi(info.bits_per_sample as i32 - 1);
    let mut resampler = Resampler::new(info.sample_rate, rate);
    collect(
        reader
            .samples()
            .map(|r| r.map(|s| s as f32 / scale).map_err(|e| e.to_string())),
        info.channels as usize,
        &mut resampler,
    )?;
    Ok(resampler.finish())
}

fn collect(
    samples: impl Iterator<Item = Result<f32, String>>,
    channels: usize,
    out: &mut Resampler,
) -> Result<(), String> {
    let mut frame = [0.0; 2];
    let mut index = 0;
    for sample in samples {
        let sample = sample?;
        if !sample.is_finite() {
            return Err("non-finite PCM".into());
        }
        frame[index] = sample.clamp(-1.0, 1.0);
        index += 1;
        if index != channels {
            continue;
        }
        if channels == 1 {
            frame[1] = frame[0];
        }
        out.push(frame)?;
        index = 0;
    }
    if index != 0 {
        return Err("truncated stereo frame".into());
    }
    Ok(())
}

struct Resampler {
    filter: Option<super::resample::LowPass>,
    input_rate: u32,
    output_rate: u32,
    input: u64,
    next: f64,
    previous: [f32; 2],
    frames: Vec<[f32; 2]>,
}

impl Resampler {
    fn new(input_rate: u32, output_rate: u32) -> Self {
        Self {
            filter: (input_rate > output_rate).then(|| {
                super::resample::LowPass::new(0.45 * output_rate as f32 / input_rate as f32)
            }),
            input_rate,
            output_rate,
            input: 0,
            next: 0.0,
            previous: [0.0; 2],
            frames: Vec::new(),
        }
    }
    fn push(&mut self, frame: [f32; 2]) -> Result<(), String> {
        let frame = self
            .filter
            .as_mut()
            .map_or(frame, |filter| filter.push(frame));
        if self.input >= self.input_rate as u64 * 600 {
            return Err("decoded file exceeds ten minutes".into());
        }
        if self.input == 0 {
            self.previous = frame;
        }
        while self.next <= self.input as f64 {
            let f = (self.next - self.input.saturating_sub(1) as f64).clamp(0.0, 1.0) as f32;
            self.frames.push(std::array::from_fn(|i| {
                self.previous[i] + (frame[i] - self.previous[i]) * f
            }));
            self.next += self.input_rate as f64 / self.output_rate as f64;
        }
        self.previous = frame;
        self.input += 1;
        Ok(())
    }
    fn finish(self) -> Vec<[f32; 2]> {
        self.frames
    }
}
