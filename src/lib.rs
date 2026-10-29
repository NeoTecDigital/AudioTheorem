pub mod analysis;
pub mod audio;
pub mod contracts;
pub mod native_input;
pub mod runtime;
pub mod server;
pub mod visualizer;

// Original twelve regressions retained, but no legacy engine in the application.
#[cfg(test)]
mod dsp;
#[cfg(test)]
mod engine;
#[cfg(test)]
mod theory;
