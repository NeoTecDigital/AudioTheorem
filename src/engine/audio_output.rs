//! Audio Output Driver
//!
//! Streams real-time audio samples to system sound device via Rodio/ALSA/Pipewire.
//! Uses a decoupled real-time render thread so audio processing, FFT spectrum analysis,
//! and harmonic visualization ALWAYS run smoothly regardless of OS audio device state.
//! Includes clean shutdown via AtomicBool.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use rodio::{OutputStream, Sink, Source};

pub struct RingAudioSource {
    sample_rate: u32,
    ring_buffer: Arc<Mutex<VecDeque<f32>>>,
    running: Arc<AtomicBool>,
}

impl Iterator for RingAudioSource {
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<f32> {
        if !self.running.load(Ordering::Relaxed) {
            return None;
        }

        let sample = if let Ok(mut rb) = self.ring_buffer.lock() {
            rb.pop_front().unwrap_or(0.0)
        } else {
            0.0
        };

        Some(if sample.is_nan() || sample.is_infinite() { 0.0 } else { sample })
    }
}

impl Source for RingAudioSource {
    #[inline]
    fn current_frame_len(&self) -> Option<usize> {
        if let Ok(rb) = self.ring_buffer.lock() {
            Some(rb.len())
        } else {
            Some(0)
        }
    }

    #[inline]
    fn channels(&self) -> u16 {
        1 // Mono signal
    }

    #[inline]
    fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    #[inline]
    fn total_duration(&self) -> Option<Duration> {
        None
    }
}

pub struct AudioOutputHandle {
    running: Arc<AtomicBool>,
    _stream: Option<OutputStream>,
    _sink: Option<Sink>,
    _render_thread: Option<std::thread::JoinHandle<()>>,
}

impl AudioOutputHandle {
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(sink) = &self._sink {
            sink.stop();
        }
    }
}

impl Drop for AudioOutputHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

pub fn start_audio_output<F>(sample_rate: u32, render_fn: F) -> AudioOutputHandle
where
    F: FnMut(&mut [f32]) + Send + 'static,
{
    let running = Arc::new(AtomicBool::new(true));
    let cb = Arc::new(Mutex::new(Box::new(render_fn) as Box<dyn FnMut(&mut [f32]) + Send + 'static>));
    let ring_buffer = Arc::new(Mutex::new(VecDeque::with_capacity(8192)));

    // 1. Dedicated real-time audio render thread (Always runs at 44.1 kHz)
    let cb_clone = cb.clone();
    let ring_clone = ring_buffer.clone();
    let r_flag = running.clone();

    let render_thread = std::thread::spawn(move || {
        let chunk_size = 512;
        let mut buffer = vec![0.0f32; chunk_size];
        let chunk_duration = Duration::from_secs_f64(chunk_size as f64 / sample_rate as f64);

        while r_flag.load(Ordering::Relaxed) {
            let start = Instant::now();

            if let Ok(mut render) = cb_clone.lock() {
                render(&mut buffer);
            }

            if let Ok(mut rb) = ring_clone.lock() {
                // Keep max 4096 samples to prevent latency buildup
                while rb.len() + buffer.len() > 4096 {
                    rb.pop_front();
                }
                rb.extend(buffer.iter().copied());
            }

            let elapsed = start.elapsed();
            if elapsed < chunk_duration {
                std::thread::sleep(chunk_duration - elapsed);
            }
        }
    });

    // 2. Attempt system audio output device (Rodio / ALSA / PipeWire)
    let mut out_stream = None;
    let mut out_sink = None;

    match OutputStream::try_default() {
        Ok((stream, stream_handle)) => {
            match Sink::try_new(&stream_handle) {
                Ok(sink) => {
                    let source = RingAudioSource {
                        sample_rate,
                        ring_buffer: ring_buffer.clone(),
                        running: running.clone(),
                    };
                    sink.append(source);
                    sink.play();
                    eprintln!("Audio output initialized successfully on system audio device (44.1kHz).");
                    out_stream = Some(stream);
                    out_sink = Some(sink);
                }
                Err(e) => {
                    eprintln!("Warning: Failed to create audio sink: {}. Audio processing active via engine thread.", e);
                }
            }
        }
        Err(e) => {
            eprintln!("Info: System audio hardware not accessible ({}). Engine processing active in real-time.", e);
        }
    }

    AudioOutputHandle {
        running,
        _stream: out_stream,
        _sink: out_sink,
        _render_thread: Some(render_thread),
    }
}
