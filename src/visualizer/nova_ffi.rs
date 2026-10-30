use super::{
    camera::Camera,
    mesh::{Stroke, Surface, Vertex},
    scene::Scene,
};
use crate::{
    contracts::Snapshot,
    native_input::{Controller, KeyEvent},
};
use std::{
    ffi::{c_char, c_void, CStr},
    marker::PhantomData,
    mem::size_of,
    ptr::NonNull,
    rc::Rc,
};

pub(super) struct Geometry<'a> {
    pub vertices: &'a [Vertex],
    pub strokes: &'a [Stroke],
    pub surface: &'a Surface,
    pub hud_start: usize,
}

#[repr(C)]
struct Upload {
    version: u32,
    size: u32,
    vertices: *const Vertex,
    count: u32,
    stride: u32,
    transform: [f32; 16],
    strokes: *const Stroke,
    stroke_count: u32,
    stroke_stride: u32,
    hud_start: u32,
    surface: *const Vertex,
    indices: *const u32,
    surface_count: u32,
    index_count: u32,
}

#[repr(C)]
struct Events {
    version: u32,
    size: u32,
    width: u32,
    height: u32,
    close: u32,
    minimized: u32,
    orbit_x: f32,
    orbit_y: f32,
    zoom: f32,
    focused: u32,
    input_reset: u32,
    key_count: u32,
    keys: [KeyEvent; 128],
    pointer_count: u32,
    pointers: [crate::native_input::timeline::PointerEvent; 128],
}

extern "C" {
    fn nova_create(
        width: u32,
        height: u32,
        output: *mut *mut c_void,
        error: *mut c_char,
        capacity: usize,
    ) -> i32;
    fn nova_poll(
        handle: *mut c_void,
        events: *mut Events,
        error: *mut c_char,
        capacity: usize,
    ) -> i32;
    fn nova_draw(
        handle: *mut c_void,
        upload: *const Upload,
        error: *mut c_char,
        capacity: usize,
    ) -> i32;
    fn nova_destroy(handle: *mut c_void);
    #[cfg(test)]
    fn nova_validate_upload(upload: *const Upload, error: *mut c_char, capacity: usize) -> i32;
}

pub struct Visualizer {
    handle: NonNull<c_void>,
    scene: Scene,
    camera: Camera,
    // SDL window/event/GPU lifetime must stay on the creating main thread.
    _main_thread: PhantomData<Rc<()>>,
}

fn result(code: i32, error: &[c_char; 256]) -> Result<(), String> {
    if code >= 0 {
        return Ok(());
    }
    // Native boundary guarantees NUL termination, and this buffer starts zeroed.
    Err(unsafe { CStr::from_ptr(error.as_ptr()) }
        .to_string_lossy()
        .into_owned())
}

impl Visualizer {
    pub fn new(width: u32, height: u32) -> Result<Self, String> {
        let mut error = [0; 256];
        let mut handle = std::ptr::null_mut();
        let code =
            unsafe { nova_create(width, height, &mut handle, error.as_mut_ptr(), error.len()) };
        result(code, &error)?;
        Ok(Self {
            handle: NonNull::new(handle).ok_or("Nova returned a null handle")?,
            scene: Scene::new(),
            camera: Camera,
            _main_thread: PhantomData,
        })
    }

    pub fn frame(&mut self, snapshot: &Snapshot, input: &mut Controller) -> Result<bool, String> {
        let events = poll(self.handle)?;
        let count = events.key_count.min(128) as usize;
        input.input(
            &events.keys[..count],
            events.focused != 0 && events.minimized == 0,
            events.input_reset != 0 || events.close != 0,
        );
        if events.close != 0 {
            return Ok(false);
        }
        if events.minimized != 0 {
            return Ok(true);
        }
        let captured = input.navigation(
            &events.pointers[..events.pointer_count.min(128) as usize],
            &events.keys[..count],
            snapshot,
            [events.width, events.height],
            events.input_reset != 0,
        );
        if let Some(view) = super::camera::request(
            &snapshot.view,
            if captured { 0.0 } else { events.orbit_x },
            if captured { 0.0 } else { events.orbit_y },
            if captured { 0.0 } else { events.zoom },
        ) {
            input.view(view);
        }
        let transform = self
            .camera
            .matrix(&snapshot.view, events.width, events.height);
        let start = std::time::Instant::now();
        self.scene.build_navigation(
            snapshot,
            events.width,
            events.height,
            &input.status(),
            &input.timeline,
        );
        draw(self.handle, self.scene.geometry(), transform)?;
        self.scene.adjust_quality(start.elapsed());
        Ok(true)
    }
}

fn poll(handle: NonNull<c_void>) -> Result<Events, String> {
    let mut error = [0; 256];
    let mut events = Events {
        version: 4,
        size: size_of::<Events>() as u32,
        // All fields are plain numeric C values; zero is valid.
        ..unsafe { std::mem::zeroed() }
    };
    let code = unsafe {
        nova_poll(
            handle.as_ptr(),
            &mut events,
            error.as_mut_ptr(),
            error.len(),
        )
    };
    result(code, &error)?;
    Ok(events)
}

fn draw(
    handle: NonNull<c_void>,
    geometry: Geometry<'_>,
    transform: [f32; 16],
) -> Result<(), String> {
    let mut error = [0; 256];
    let upload = Upload {
        version: 4,
        size: size_of::<Upload>() as u32,
        vertices: geometry.vertices.as_ptr(),
        count: geometry.vertices.len() as u32,
        stride: size_of::<Vertex>() as u32,
        transform,
        strokes: geometry.strokes.as_ptr(),
        stroke_count: geometry.strokes.len() as u32,
        stroke_stride: size_of::<Stroke>() as u32,
        hud_start: geometry.hud_start as u32,
        surface: geometry.surface.vertices.as_ptr(),
        indices: geometry.surface.indices.as_ptr(),
        surface_count: geometry.surface.vertices.len() as u32,
        index_count: geometry.surface.indices.len() as u32,
    };
    let code = unsafe { nova_draw(handle.as_ptr(), &upload, error.as_mut_ptr(), error.len()) };
    result(code, &error)?;
    Ok(())
}

impl Drop for Visualizer {
    fn drop(&mut self) {
        unsafe { nova_destroy(self.handle.as_ptr()) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn abi_layout_is_versioned() {
        assert_eq!(size_of::<Vertex>(), 32);
        assert_eq!(size_of::<Events>(), 3636);
        assert_eq!(size_of::<Upload>(), 136);
        assert_eq!(std::mem::offset_of!(Upload, transform), 24);
        assert_eq!(std::mem::offset_of!(Upload, surface), 112);
        assert_eq!(std::mem::offset_of!(Upload, indices), 120);
        assert_eq!(std::mem::offset_of!(Upload, surface_count), 128);
    }

    #[test]
    fn abi_rejects_null_overflow_and_nonfinite() {
        let mut error = [0; 256];
        let validate = |frame, error: &mut [c_char; 256]| unsafe {
            nova_validate_upload(frame, error.as_mut_ptr(), error.len())
        };
        assert!(validate(std::ptr::null(), &mut error) < 0);
        let mut frame = Upload {
            version: 4,
            size: 136,
            vertices: std::ptr::null(),
            count: 262145,
            stride: 32,
            transform: [0.0; 16],
            strokes: std::ptr::null(),
            stroke_count: 0,
            stroke_stride: 48,
            hud_start: 0,
            surface: std::ptr::null(),
            indices: std::ptr::null(),
            surface_count: 0,
            index_count: 0,
        };
        assert!(validate(&frame, &mut error) < 0);
        frame.count = 0;
        frame.transform[0] = f32::NAN;
        assert!(validate(&frame, &mut error) < 0);
        frame.transform[0] = 1.0;
        assert_eq!(validate(&frame, &mut error), 0);
    }

    #[test]
    fn failed_create_clears_handle_and_safe_destroy_null() {
        let mut error = [0; 256];
        let mut handle = std::ptr::dangling_mut::<c_void>();
        let result = unsafe { nova_create(0, 0, &mut handle, error.as_mut_ptr(), error.len()) };
        assert!(result < 0);
        assert!(handle.is_null());
        unsafe { nova_destroy(handle) };
    }
}
