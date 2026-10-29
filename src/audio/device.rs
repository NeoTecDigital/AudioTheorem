use super::render::{Render, Signals};
use crate::contracts::DeviceStatus;
use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    SampleFormat, SampleRate, StreamConfig,
};
use std::sync::{atomic::Ordering, Arc};

pub struct Device {
    device: cpal::Device,
    config: StreamConfig,
    format: SampleFormat,
    pub status: DeviceStatus,
}

impl Device {
    pub fn prepare() -> Result<Self, String> {
        let device = cpal::default_host()
            .default_output_device()
            .ok_or("no output device; use explicit --headless for virtual analysis")?;
        let configs: Vec<_> = device
            .supported_output_configs()
            .map_err(|e| e.to_string())?
            .collect();
        let supported = choose(&configs).ok_or("no supported stereo/mono output configuration")?;
        let format = supported.sample_format();
        let mut config = supported.config();
        config.buffer_size = match supported.buffer_size() {
            cpal::SupportedBufferSize::Range { min, max } => {
                cpal::BufferSize::Fixed(256u32.clamp(*min, *max))
            }
            cpal::SupportedBufferSize::Unknown => cpal::BufferSize::Default,
        };
        let status = DeviceStatus {
            available: true,
            name: device.name().unwrap_or_else(|_| "Output device".into()),
            sample_rate: config.sample_rate.0,
            channels: config.channels,
            format: format.to_string(),
            requested_buffer: 256,
            ..DeviceStatus::default()
        };
        Ok(Self {
            device,
            config,
            format,
            status,
        })
    }

    pub fn start(self, mut render: Render) -> Result<cpal::Stream, String> {
        render.set_output_channels(self.config.channels);
        let stream = match self.format {
            SampleFormat::F32 => self.stream::<f32>(render),
            SampleFormat::F64 => self.stream::<f64>(render),
            SampleFormat::I8 => self.stream::<i8>(render),
            SampleFormat::I16 => self.stream::<i16>(render),
            SampleFormat::I32 => self.stream::<i32>(render),
            SampleFormat::I64 => self.stream::<i64>(render),
            SampleFormat::U8 => self.stream::<u8>(render),
            SampleFormat::U16 => self.stream::<u16>(render),
            SampleFormat::U32 => self.stream::<u32>(render),
            SampleFormat::U64 => self.stream::<u64>(render),
            _ => return Err("unsupported device sample format".into()),
        }?;
        stream.play().map_err(|e| e.to_string())?;
        Ok(stream)
    }

    fn stream<T>(&self, mut render: Render) -> Result<cpal::Stream, String>
    where
        T: cpal::SizedSample + cpal::FromSample<f32>,
    {
        let signals = render.signals.clone();
        let channels = self.config.channels as usize;
        self.device
            .build_output_stream(
                &self.config,
                move |data: &mut [T], _| {
                    callback(data, channels, &mut render);
                },
                move |_| {
                    signals.errors.fetch_add(1, Ordering::Release);
                    signals.panic.fetch_add(1, Ordering::Release);
                },
                None,
            )
            .map_err(|e| e.to_string())
    }
}

fn choose(configs: &[cpal::SupportedStreamConfigRange]) -> Option<cpal::SupportedStreamConfig> {
    for rate in [48000, 44100] {
        let selected = configs
            .iter()
            .filter(|c| c.channels() <= 2 && c.channels() > 0)
            .filter(|c| c.min_sample_rate().0 <= rate && c.max_sample_rate().0 >= rate)
            .max_by_key(|c| (c.channels(), c.sample_format() == SampleFormat::F32));
        if let Some(c) = selected {
            return Some((*c).with_sample_rate(SampleRate(rate)));
        }
    }
    configs
        .iter()
        .find(|c| (1..=2).contains(&c.channels()))
        .map(|c| (*c).with_max_sample_rate())
}

fn callback<T>(data: &mut [T], channels: usize, render: &mut Render)
where
    T: cpal::SizedSample + cpal::FromSample<f32>,
{
    let start = std::time::Instant::now();
    render.begin();
    let stopped = render.signals.stop.load(Ordering::Relaxed);
    for out in data.chunks_mut(channels) {
        let frame = if stopped { [0.0; 2] } else { render.frame() };
        write_frame(out, frame);
    }
    record_metrics(&render.signals, data.len() / channels, start);
}

fn write_frame<T>(out: &mut [T], frame: [f32; 2])
where
    T: cpal::Sample + cpal::FromSample<f32>,
{
    if out.len() == 1 {
        out[0] = T::from_sample((frame[0] + frame[1]) * 0.5);
        return;
    }
    for (i, value) in out.iter_mut().enumerate() {
        *value = T::from_sample(frame[i.min(1)]);
    }
}

fn record_metrics(signals: &Arc<Signals>, frames: usize, start: std::time::Instant) {
    signals.buffer.store(frames as u64, Ordering::Relaxed);
    signals
        .max_us
        .fetch_max(start.elapsed().as_micros() as u64, Ordering::Relaxed);
}
