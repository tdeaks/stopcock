use crate::binary::decode_render_request;
use crate::model::RenderRequest;
use crate::runtime::Runtime;
use std::mem;
use std::ptr;
use std::slice;

mod runtime_io;
#[cfg(test)]
mod tests;

use runtime_io::{with_input_refs, with_mixed_param_refs, with_strided_param_refs};

const ERR_INVALID_JSON: i32 = -1;
const ERR_INVALID_BINARY: i32 = -3;
const ERR_RENDER_FAILED: i32 = -2;
const STATUS_OK: i32 = 0;
#[cfg(test)]
const CHANNELS_MONO: i32 = 1;

#[no_mangle]
pub extern "C" fn stopcock_synth_alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let ptr = buffer.as_mut_ptr();
    mem::forget(buffer);
    ptr
}

/// # Safety
///
/// `ptr` must have been returned by `stopcock_synth_alloc` with the same `len`,
/// and it must not be used after this call.
#[no_mangle]
pub unsafe extern "C" fn stopcock_synth_dealloc(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        let _ = Vec::from_raw_parts(ptr, 0, len);
    }
}

/// # Safety
///
/// `request_ptr` must point to `request_len` readable bytes. `left_ptr` and
/// `right_ptr` must each point to writable buffers with at least the requested
/// render length in `f32` samples.
#[no_mangle]
pub unsafe extern "C" fn stopcock_synth_render(
    request_ptr: *const u8,
    request_len: usize,
    left_ptr: *mut f32,
    right_ptr: *mut f32,
) -> i32 {
    let request_bytes = slice::from_raw_parts(request_ptr, request_len);
    let request = match decode_request(request_bytes) {
        Ok(request) => request,
        Err(error) => return error.status_code(),
    };
    let length = request.length();
    let Some((left, right)) = output_slices(length, left_ptr, right_ptr) else {
        return ERR_RENDER_FAILED;
    };
    render_request_into(request, left, right).unwrap_or(ERR_RENDER_FAILED)
}

#[cfg(test)]
fn render_json_request_into(
    request_bytes: &[u8],
    left: &mut [f32],
    right: &mut [f32],
) -> Result<i32, RenderError> {
    let request = decode_request(request_bytes)?;
    let length = request.length();
    if left.len() < length || right.len() < length {
        return Err(RenderError::RenderFailed);
    }
    render_request_into(request, left, right).ok_or(RenderError::RenderFailed)
}

/// # Safety
///
/// `request_ptr` must point to `request_len` readable bytes in the synth binary
/// graph format. `left_ptr` and `right_ptr` must each point to writable buffers
/// with at least the requested render length in `f32` samples.
#[no_mangle]
pub unsafe extern "C" fn stopcock_synth_render_binary(
    request_ptr: *const u8,
    request_len: usize,
    left_ptr: *mut f32,
    right_ptr: *mut f32,
) -> i32 {
    let request_bytes = slice::from_raw_parts(request_ptr, request_len);
    let Some(request) = decode_render_request(request_bytes) else {
        return ERR_INVALID_BINARY;
    };
    let length = request.length();
    let Some((left, right)) = output_slices(length, left_ptr, right_ptr) else {
        return ERR_RENDER_FAILED;
    };
    render_request_into(request, left, right).unwrap_or(ERR_RENDER_FAILED)
}

/// # Safety
///
/// `request_ptr` must point to `request_len` readable bytes in the synth binary
/// runtime graph format. The returned pointer must be released exactly once with
/// `stopcock_synth_runtime_free`.
#[no_mangle]
pub unsafe extern "C" fn stopcock_synth_runtime_new(
    request_ptr: *const u8,
    request_len: usize,
) -> *mut Runtime {
    let request_bytes = slice::from_raw_parts(request_ptr, request_len);
    let Some(request) = decode_render_request(request_bytes) else {
        return ptr::null_mut();
    };
    let Some(runtime) = Runtime::new(request) else {
        return ptr::null_mut();
    };
    Box::into_raw(Box::new(runtime))
}

/// # Safety
///
/// `runtime_ptr` must either be null or a pointer returned by
/// `stopcock_synth_runtime_new` that has not already been freed.
#[no_mangle]
pub unsafe extern "C" fn stopcock_synth_runtime_free(runtime_ptr: *mut Runtime) {
    if !runtime_ptr.is_null() {
        let _ = Box::from_raw(runtime_ptr);
    }
}

/// # Safety
///
/// `runtime_ptr` must be a live runtime pointer. NaN values clear optional
/// event fields, while finite values update the next render pass.
#[no_mangle]
pub unsafe extern "C" fn stopcock_synth_runtime_reset_event(
    runtime_ptr: *mut Runtime,
    gate_sec: f64,
    velocity: f64,
    trigger_freq: f64,
) -> i32 {
    let Some(runtime) = runtime_ptr.as_mut() else {
        return ERR_RENDER_FAILED;
    };
    runtime.reset_event(
        finite_non_negative(gate_sec),
        finite_value(velocity),
        finite_positive(trigger_freq),
    );
    STATUS_OK
}

/// # Safety
///
/// `runtime_ptr` must be a live runtime pointer. Input, parameter, and output
/// pointers must reference valid buffers matching their channel, slot, stride,
/// and frame counts for the duration of this call.
#[no_mangle]
pub unsafe extern "C" fn stopcock_synth_runtime_process(
    runtime_ptr: *mut Runtime,
    input_ptr: *const f32,
    input_channels: usize,
    input_stride: usize,
    param_ptr: *const f32,
    param_slots: usize,
    param_stride: usize,
    frames: usize,
    left_ptr: *mut f32,
    right_ptr: *mut f32,
) -> i32 {
    let Some(runtime) = runtime_ptr.as_mut() else {
        return ERR_RENDER_FAILED;
    };
    with_strided_param_refs(param_ptr, param_slots, param_stride, frames, |param_refs| {
        process_runtime_block(
            runtime,
            input_ptr,
            input_channels,
            input_stride,
            param_refs,
            frames,
            left_ptr,
            right_ptr,
        )
    })
    .unwrap_or(ERR_RENDER_FAILED)
}

/// # Safety
///
/// `runtime_ptr` must be a live runtime pointer. Input and parameter pointers
/// must reference valid buffers matching their channel, slot, stride, and frame
/// counts for the duration of this call. Output remains in the runtime root
/// buffers and can be read through `stopcock_synth_runtime_output_*_ptr`.
#[no_mangle]
pub unsafe extern "C" fn stopcock_synth_runtime_process_direct(
    runtime_ptr: *mut Runtime,
    input_ptr: *const f32,
    input_channels: usize,
    input_stride: usize,
    param_ptr: *const f32,
    param_slots: usize,
    param_stride: usize,
    frames: usize,
) -> i32 {
    let Some(runtime) = runtime_ptr.as_mut() else {
        return ERR_RENDER_FAILED;
    };
    with_strided_param_refs(param_ptr, param_slots, param_stride, frames, |param_refs| {
        process_runtime_block_direct(
            runtime,
            input_ptr,
            input_channels,
            input_stride,
            param_refs,
            frames,
        )
    })
    .unwrap_or(ERR_RENDER_FAILED)
}

/// # Safety
///
/// `runtime_ptr` must be a live runtime pointer. Scalar params, block params,
/// flags, inputs, and outputs must reference valid buffers matching their slot,
/// stride, channel, and frame counts for the duration of this call.
#[no_mangle]
pub unsafe extern "C" fn stopcock_synth_runtime_process_mixed(
    runtime_ptr: *mut Runtime,
    input_ptr: *const f32,
    input_channels: usize,
    input_stride: usize,
    param_scalar_ptr: *const f32,
    param_block_ptr: *const f32,
    param_flags_ptr: *const u8,
    param_slots: usize,
    param_block_stride: usize,
    frames: usize,
    left_ptr: *mut f32,
    right_ptr: *mut f32,
) -> i32 {
    let Some(runtime) = runtime_ptr.as_mut() else {
        return ERR_RENDER_FAILED;
    };
    with_mixed_param_refs(
        param_scalar_ptr,
        param_block_ptr,
        param_flags_ptr,
        param_slots,
        param_block_stride,
        frames,
        |param_refs| {
            process_runtime_block(
                runtime,
                input_ptr,
                input_channels,
                input_stride,
                param_refs,
                frames,
                left_ptr,
                right_ptr,
            )
        },
    )
    .unwrap_or(ERR_RENDER_FAILED)
}

/// # Safety
///
/// `runtime_ptr` must be a live runtime pointer. Scalar params, block params,
/// flags, and inputs must reference valid buffers matching their slot, stride,
/// channel, and frame counts for the duration of this call. Output remains in
/// the runtime root buffers and can be read through
/// `stopcock_synth_runtime_output_*_ptr`.
#[no_mangle]
pub unsafe extern "C" fn stopcock_synth_runtime_process_mixed_direct(
    runtime_ptr: *mut Runtime,
    input_ptr: *const f32,
    input_channels: usize,
    input_stride: usize,
    param_scalar_ptr: *const f32,
    param_block_ptr: *const f32,
    param_flags_ptr: *const u8,
    param_slots: usize,
    param_block_stride: usize,
    frames: usize,
) -> i32 {
    let Some(runtime) = runtime_ptr.as_mut() else {
        return ERR_RENDER_FAILED;
    };
    with_mixed_param_refs(
        param_scalar_ptr,
        param_block_ptr,
        param_flags_ptr,
        param_slots,
        param_block_stride,
        frames,
        |param_refs| {
            process_runtime_block_direct(
                runtime,
                input_ptr,
                input_channels,
                input_stride,
                param_refs,
                frames,
            )
        },
    )
    .unwrap_or(ERR_RENDER_FAILED)
}

/// # Safety
///
/// `runtime_ptr` must either be null or a live runtime pointer. The returned
/// pointer is owned by the runtime and is valid until the runtime is freed or
/// the WebAssembly memory is grown.
#[no_mangle]
pub unsafe extern "C" fn stopcock_synth_runtime_output_left_ptr(
    runtime_ptr: *const Runtime,
) -> *const f32 {
    runtime_ptr
        .as_ref()
        .map_or(ptr::null(), Runtime::root_left_ptr)
}

/// # Safety
///
/// `runtime_ptr` must either be null or a live runtime pointer. The returned
/// pointer is owned by the runtime and is valid until the runtime is freed or
/// the WebAssembly memory is grown.
#[no_mangle]
pub unsafe extern "C" fn stopcock_synth_runtime_output_right_ptr(
    runtime_ptr: *const Runtime,
) -> *const f32 {
    runtime_ptr
        .as_ref()
        .map_or(ptr::null(), Runtime::root_right_ptr)
}

#[allow(clippy::too_many_arguments)]
unsafe fn process_runtime_block(
    runtime: &mut Runtime,
    input_ptr: *const f32,
    input_channels: usize,
    input_stride: usize,
    param_refs: &[&[f32]],
    frames: usize,
    left_ptr: *mut f32,
    right_ptr: *mut f32,
) -> i32 {
    let Some((left, right)) = output_slices(frames, left_ptr, right_ptr) else {
        return ERR_RENDER_FAILED;
    };
    with_input_refs(
        input_ptr,
        input_channels,
        input_stride,
        frames,
        |input_refs| {
            runtime
                .process(frames, input_refs, param_refs, left, right)
                .unwrap_or(ERR_RENDER_FAILED)
        },
    )
    .unwrap_or(ERR_RENDER_FAILED)
}

unsafe fn process_runtime_block_direct(
    runtime: &mut Runtime,
    input_ptr: *const f32,
    input_channels: usize,
    input_stride: usize,
    param_refs: &[&[f32]],
    frames: usize,
) -> i32 {
    with_input_refs(
        input_ptr,
        input_channels,
        input_stride,
        frames,
        |input_refs| {
            runtime
                .process_in_place(frames, input_refs, param_refs)
                .map(i32::from)
                .unwrap_or(ERR_RENDER_FAILED)
        },
    )
    .unwrap_or(ERR_RENDER_FAILED)
}

fn decode_request(request_bytes: &[u8]) -> Result<RenderRequest, RenderError> {
    serde_json::from_slice(request_bytes).map_err(|_| RenderError::InvalidJson)
}

fn render_request_into(
    mut request: RenderRequest,
    left: &mut [f32],
    right: &mut [f32],
) -> Option<i32> {
    let length = request.length();
    if left.len() < length || right.len() < length {
        return None;
    }

    let inputs = mem::take(&mut request.inputs);
    let input_refs: Vec<&[f32]> = inputs.iter().map(Vec::as_slice).collect();
    let mut runtime = Runtime::new(request)?;
    runtime.process(length, &input_refs, &[], left, right)
}

unsafe fn output_slices<'a>(
    length: usize,
    left_ptr: *mut f32,
    right_ptr: *mut f32,
) -> Option<(&'a mut [f32], &'a mut [f32])> {
    if length == 0 {
        return Some((&mut [], &mut []));
    }
    if left_ptr.is_null() || right_ptr.is_null() {
        return None;
    }
    Some((
        slice::from_raw_parts_mut(left_ptr, length),
        slice::from_raw_parts_mut(right_ptr, length),
    ))
}

fn finite_value(value: f64) -> Option<f64> {
    value.is_finite().then_some(value)
}

fn finite_positive(value: f64) -> Option<f64> {
    (value.is_finite() && value > 0.0).then_some(value)
}

fn finite_non_negative(value: f64) -> Option<f64> {
    (value.is_finite() && value >= 0.0).then_some(value)
}

#[derive(Debug, Eq, PartialEq)]
enum RenderError {
    InvalidJson,
    #[cfg(test)]
    RenderFailed,
}

impl RenderError {
    fn status_code(self) -> i32 {
        match self {
            Self::InvalidJson => ERR_INVALID_JSON,
            #[cfg(test)]
            Self::RenderFailed => ERR_RENDER_FAILED,
        }
    }
}
