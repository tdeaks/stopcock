pub(crate) fn trigger_velocity(base_velocity: f64, request_velocity: f64) -> f64 {
    if base_velocity.is_finite() {
        base_velocity
    } else {
        request_velocity
    }
}
