#[derive(Clone)]
pub(crate) struct NodeBuffer {
    pub(crate) left: Vec<f32>,
    pub(crate) right: Vec<f32>,
    pub(crate) channels: u8,
}

impl NodeBuffer {
    pub(crate) fn new(channels: u8, len: usize) -> Self {
        Self {
            left: vec![0.0; len],
            right: vec![0.0; len],
            channels,
        }
    }

    pub(crate) fn clear(&mut self, len: usize) {
        self.left[..len].fill(0.0);
        self.right[..len].fill(0.0);
    }

    pub(crate) fn mono_sample(&self, sample: usize) -> f32 {
        if self.channels == 2 {
            (self.left[sample] + self.right[sample]) * 0.5
        } else {
            self.left[sample]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_buffer_mixes_stereo_to_mono() {
        let mut buffer = NodeBuffer::new(2, 2);
        buffer.left.copy_from_slice(&[1.0, 0.25]);
        buffer.right.copy_from_slice(&[-0.5, 0.75]);

        assert_eq!(buffer.mono_sample(0), 0.25);
        assert_eq!(buffer.mono_sample(1), 0.5);
    }
}
