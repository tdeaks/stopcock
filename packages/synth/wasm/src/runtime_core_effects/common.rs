use crate::runtime_state::NodeBuffer;

#[inline]
pub(super) fn stereo_input(input: &NodeBuffer, sample: usize) -> (f32, f32) {
    let left = input.left[sample];
    let right = if input.channels == 2 {
        input.right[sample]
    } else {
        left
    };
    (left, right)
}
