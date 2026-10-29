//! Nova is main-thread affine. Rust builds music geometry; Nova owns all GPU state.
#[cfg(any(feature = "native", test))]
mod camera;
#[cfg(any(feature = "native", test))]
mod mesh;
#[cfg(feature = "native")]
mod nova_ffi;
#[cfg(any(feature = "native", test))]
mod scene;

#[cfg(feature = "native")]
pub use nova_ffi::Visualizer;

#[cfg(not(feature = "native"))]
pub struct Visualizer;

#[cfg(not(feature = "native"))]
impl Visualizer {
    pub fn new(_: u32, _: u32) -> Result<Self, String> {
        Err("Native visualization was disabled at build time".into())
    }
    pub fn frame(
        &mut self,
        _: &crate::contracts::Snapshot,
        _: &mut crate::native_input::Controller,
    ) -> Result<bool, String> {
        Err("Native visualization was disabled at build time".into())
    }
}
