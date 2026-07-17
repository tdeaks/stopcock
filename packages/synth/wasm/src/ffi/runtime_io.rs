use std::slice;

pub(super) const MAX_INPUT_CHANNELS: usize = 16;
pub(super) const MAX_PARAM_SLOTS: usize = 2048;
pub(super) const PARAM_FLAG_BLOCK: u8 = 1;

pub(super) unsafe fn with_input_refs<R>(
    input_ptr: *const f32,
    input_channels: usize,
    input_stride: usize,
    frames: usize,
    render: impl FnOnce(&[&[f32]]) -> R,
) -> Option<R> {
    if input_channels > 0 && (input_ptr.is_null() || input_stride < frames) {
        return None;
    }
    if input_channels > MAX_INPUT_CHANNELS {
        return None;
    }

    let mut input_refs: [&[f32]; MAX_INPUT_CHANNELS] = [&[]; MAX_INPUT_CHANNELS];
    for (channel, slot) in input_refs.iter_mut().enumerate().take(input_channels) {
        *slot = slice::from_raw_parts(input_ptr.add(channel * input_stride), frames);
    }

    Some(render(&input_refs[..input_channels]))
}

pub(super) unsafe fn with_strided_param_refs<R>(
    param_ptr: *const f32,
    param_slots: usize,
    param_stride: usize,
    frames: usize,
    render: impl FnOnce(&[&[f32]]) -> R,
) -> Option<R> {
    if param_slots > 0 && (param_ptr.is_null() || (param_stride != 1 && param_stride < frames)) {
        return None;
    }
    if param_slots > MAX_PARAM_SLOTS {
        return None;
    }

    let mut param_refs: [&[f32]; MAX_PARAM_SLOTS] = [&[]; MAX_PARAM_SLOTS];
    let param_len = if param_stride == 1 { 1 } else { frames };
    for (slot_index, slot) in param_refs.iter_mut().enumerate().take(param_slots) {
        *slot = slice::from_raw_parts(param_ptr.add(slot_index * param_stride), param_len);
    }

    Some(render(&param_refs[..param_slots]))
}

pub(super) unsafe fn with_mixed_param_refs<R>(
    param_scalar_ptr: *const f32,
    param_block_ptr: *const f32,
    param_flags_ptr: *const u8,
    param_slots: usize,
    param_block_stride: usize,
    frames: usize,
    render: impl FnOnce(&[&[f32]]) -> R,
) -> Option<R> {
    if param_slots > MAX_PARAM_SLOTS {
        return None;
    }
    if param_slots > 0 && (param_scalar_ptr.is_null() || param_flags_ptr.is_null()) {
        return None;
    }

    let flags = if param_slots > 0 {
        slice::from_raw_parts(param_flags_ptr, param_slots)
    } else {
        &[]
    };
    let mut param_refs: [&[f32]; MAX_PARAM_SLOTS] = [&[]; MAX_PARAM_SLOTS];
    for (slot_index, slot) in param_refs.iter_mut().enumerate().take(param_slots) {
        if flags[slot_index] & PARAM_FLAG_BLOCK != 0 {
            if param_block_ptr.is_null() || param_block_stride < frames {
                return None;
            }
            *slot =
                slice::from_raw_parts(param_block_ptr.add(slot_index * param_block_stride), frames);
        } else {
            *slot = slice::from_raw_parts(param_scalar_ptr.add(slot_index), 1);
        }
    }

    Some(render(&param_refs[..param_slots]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strided_param_refs_support_scalar_and_block_slots() {
        let values = [2.0_f32, 0.0, 0.0, 0.0, 0.5, 1.0, 1.5, 2.0];
        let scalar = unsafe {
            with_strided_param_refs(values.as_ptr(), 2, 1, 4, |params| {
                (params[0].to_vec(), params[1].to_vec())
            })
        }
        .expect("scalar params");
        assert_eq!(scalar, (vec![2.0], vec![0.0]));

        let block = unsafe {
            with_strided_param_refs(values.as_ptr(), 2, 4, 4, |params| {
                (params[0].to_vec(), params[1].to_vec())
            })
        }
        .expect("block params");
        assert_eq!(block, (vec![2.0, 0.0, 0.0, 0.0], vec![0.5, 1.0, 1.5, 2.0]));
    }

    #[test]
    fn mixed_param_refs_keep_scalar_and_block_slots_compact() {
        let scalars = [2.0_f32, 3.0];
        let blocks = [0.5_f32, 1.0, 1.5, 2.0, 4.0, 5.0, 6.0, 7.0];
        let flags = [0, PARAM_FLAG_BLOCK];
        let params = unsafe {
            with_mixed_param_refs(
                scalars.as_ptr(),
                blocks.as_ptr(),
                flags.as_ptr(),
                2,
                4,
                4,
                |params| (params[0].to_vec(), params[1].to_vec()),
            )
        }
        .expect("mixed params");

        assert_eq!(params, (vec![2.0], vec![4.0, 5.0, 6.0, 7.0]));
    }

    #[test]
    fn pointer_validation_rejects_invalid_strides_and_missing_buffers() {
        let values = [1.0_f32; 8];
        assert!(
            unsafe { with_input_refs(values.as_ptr(), MAX_INPUT_CHANNELS + 1, 4, 4, |_| ()) }
                .is_none()
        );
        assert!(unsafe { with_strided_param_refs(values.as_ptr(), 1, 3, 4, |_| ()) }.is_none());
        assert!(unsafe {
            with_mixed_param_refs(
                values.as_ptr(),
                std::ptr::null(),
                [PARAM_FLAG_BLOCK].as_ptr(),
                1,
                3,
                4,
                |_| (),
            )
        }
        .is_none());
    }
}
