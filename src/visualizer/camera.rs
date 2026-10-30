use crate::contracts::View;

#[derive(Default)]
pub struct Camera;

pub fn request(view: &View, dx: f32, dy: f32, wheel: f32) -> Option<View> {
    if dx == 0.0 && dy == 0.0 && wheel == 0.0 {
        return None;
    }
    let mut requested = *view;
    requested.yaw = (view.yaw + dx * 0.004).clamp(-1.2, 1.2);
    requested.pitch = (view.pitch + dy * 0.004).clamp(-0.6, 1.0);
    requested.distance = (view.distance - wheel * 0.7).clamp(9.0, 50.0);
    Some(requested)
}

impl Camera {
    pub fn matrix(&self, view: &View, width: u32, height: u32) -> [f32; 16] {
        let aspect = width.max(1) as f32 / height.max(1) as f32;
        let distance = view.distance.clamp(9.0, 50.0) * (1.4 / aspect).max(1.0);
        // Both modes are spatial. Neutral controls frame the wall and forward stream field.
        let mut model = rotation(view.yaw - 0.65, view.pitch * 0.7);
        model[13] = 0.8;
        model[14] = -distance * if view.immersive { 1.40 } else { 1.50 } - 2.0;
        multiply(projection(aspect, view.immersive), model)
    }
}

fn rotation(yaw: f32, pitch: f32) -> [f32; 16] {
    let (sy, cy) = yaw.sin_cos();
    let (sx, cx) = pitch.sin_cos();
    [
        cy,
        sx * sy,
        -cx * sy,
        0.0,
        0.0,
        cx,
        sx,
        0.0,
        sy,
        -sx * cy,
        cx * cy,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
    ]
}

fn projection(aspect: f32, immersive: bool) -> [f32; 16] {
    let fov = if immersive { 0.85_f32 } else { 0.75_f32 };
    let f = 1.0 / (fov * 0.5).tan();
    let mut matrix = [0.0; 16];
    matrix[0] = f / aspect;
    matrix[5] = -f;
    matrix[10] = -1.001;
    matrix[11] = -1.0;
    matrix[14] = -0.1001;
    matrix
}

fn multiply(a: [f32; 16], b: [f32; 16]) -> [f32; 16] {
    std::array::from_fn(|index| {
        let row = index % 4;
        let column = index / 4;
        (0..4).map(|k| a[k * 4 + row] * b[column * 4 + k]).sum()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finite_projection_for_minimized_and_extreme_camera() {
        let camera = Camera;
        let mut view = View::default();
        for immersive in [false, true] {
            view.immersive = immersive;
            view = request(&view, 1e6, -1e6, 1e6).unwrap();
            assert!(camera.matrix(&view, 0, 0).iter().all(|x| x.is_finite()));
        }
    }
}

#[cfg(test)]
mod acknowledgement_tests {
    use super::*;
    #[test]
    fn requested_camera_does_not_mutate_acknowledged_view() {
        let acknowledged = View::default();
        let initial = Camera.matrix(&acknowledged, 1920, 1080);
        let pending = request(&acknowledged, 100.0, 20.0, 1.0).unwrap();
        assert_ne!(pending.yaw, acknowledged.yaw);
        assert_eq!(Camera.matrix(&acknowledged, 1920, 1080), initial);
        assert_ne!(Camera.matrix(&pending, 1920, 1080), initial);
    }
}
