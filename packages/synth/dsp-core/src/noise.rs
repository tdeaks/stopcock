pub struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    pub fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    pub fn next_f64(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6D2B79F5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f64) / 4294967296.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mulberry32_is_deterministic() {
        let mut a = Mulberry32::new(1234);
        let mut b = Mulberry32::new(1234);
        for _ in 0..16 {
            assert_eq!(a.next_f64(), b.next_f64());
        }
    }

    #[test]
    fn mulberry32_values_are_unit_interval() {
        let mut rng = Mulberry32::new(0);
        for _ in 0..128 {
            let value = rng.next_f64();
            assert!((0.0..1.0).contains(&value));
        }
    }
}
