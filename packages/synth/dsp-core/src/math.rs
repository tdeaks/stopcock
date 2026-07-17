pub const TAU: f64 = std::f64::consts::PI * 2.0;
pub const DEFAULT_BLOCK_SIZE: usize = 128;

#[inline]
pub fn clamp(x: f64, lo: f64, hi: f64) -> f64 {
    x.min(hi).max(lo)
}

#[inline]
pub fn safe_finite(value: f64, fallback: f64) -> f64 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}
