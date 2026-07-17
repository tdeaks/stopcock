use crate::model::RenderRequest;
use crate::runtime_dispatch::render_node_block;
use crate::runtime_node::RuntimeNode;
use crate::runtime_params::*;
use crate::runtime_state::NodeBuffer;

pub struct Runtime {
    sample_rate: f64,
    root: usize,
    gate_sec: Option<f64>,
    velocity: f64,
    trigger_freq: Option<f64>,
    frame: usize,
    max_block: usize,
    nodes: Vec<RuntimeNode>,
    buffers: Vec<NodeBuffer>,
    param_access: Vec<ParamAccess>,
}

impl Runtime {
    pub(crate) fn new(request: RenderRequest) -> Option<Self> {
        if request.root >= request.nodes.len()
            || request.sample_rate <= 0.0
            || !request.sample_rate.is_finite()
        {
            return None;
        }

        let sample_rate = request.sample_rate;
        let root = request.root;
        let gate_sec = request.gate_sec;
        let velocity = request.velocity.unwrap_or(1.0);
        let trigger_freq = request
            .trigger_freq
            .filter(|freq| freq.is_finite() && *freq > 0.0);
        let max_block = request.length.max(1);
        let mut nodes = Vec::with_capacity(request.nodes.len());
        let mut buffers = Vec::with_capacity(request.nodes.len());
        let mut param_access = Vec::with_capacity(request.nodes.len());

        for node in request.nodes {
            let access = ParamAccess::for_node(&node)?;
            let runtime_node = RuntimeNode::from_node(node, sample_rate)?;
            buffers.push(NodeBuffer::new(runtime_node.out(), max_block));
            param_access.push(access);
            nodes.push(runtime_node);
        }

        Some(Self {
            sample_rate,
            root,
            gate_sec,
            velocity,
            trigger_freq,
            frame: 0,
            max_block,
            nodes,
            buffers,
            param_access,
        })
    }

    pub(crate) fn process(
        &mut self,
        frames: usize,
        inputs: &[&[f32]],
        params: &[&[f32]],
        left: &mut [f32],
        right: &mut [f32],
    ) -> Option<i32> {
        if frames > self.max_block || left.len() < frames || right.len() < frames {
            return None;
        }

        let channels = self.process_in_place(frames, inputs, params)?;
        let root = self.root;
        left[..frames].copy_from_slice(&self.buffers[root].left[..frames]);
        if channels == 2 {
            right[..frames].copy_from_slice(&self.buffers[root].right[..frames]);
        } else {
            right[..frames].fill(0.0);
        }
        Some(channels as i32)
    }

    pub(crate) fn process_in_place(
        &mut self,
        frames: usize,
        inputs: &[&[f32]],
        params: &[&[f32]],
    ) -> Option<u8> {
        if frames > self.max_block {
            return None;
        }

        let sample_rate = self.sample_rate;
        let gate_sec = self.gate_sec;
        let velocity = self.velocity;
        let trigger_freq = self.trigger_freq;
        let frame_start = self.frame;

        for index in 0..self.nodes.len() {
            let node = &mut self.nodes[index];
            let (prior_buffers, current_buffers) = self.buffers.split_at_mut(index);
            let out = &mut current_buffers[0];
            let access = &self.param_access[index];
            out.clear(frames);
            render_node_block(
                node,
                access,
                prior_buffers,
                inputs,
                params,
                out,
                frames,
                sample_rate,
                frame_start,
                gate_sec,
                velocity,
                trigger_freq,
            )?;
        }

        let root = self.root;
        let channels = self.buffers[root].channels;
        self.frame = self.frame.saturating_add(frames);
        Some(channels)
    }

    pub(crate) fn reset_event(
        &mut self,
        gate_sec: Option<f64>,
        velocity: Option<f64>,
        trigger_freq: Option<f64>,
    ) {
        self.gate_sec = gate_sec.filter(|value| value.is_finite() && *value >= 0.0);
        self.velocity = velocity.filter(|value| value.is_finite()).unwrap_or(1.0);
        self.trigger_freq = trigger_freq.filter(|value| value.is_finite() && *value > 0.0);
        self.frame = 0;

        for node in &mut self.nodes {
            node.reset();
        }
    }

    pub(crate) fn root_left_ptr(&self) -> *const f32 {
        self.buffers[self.root].left.as_ptr()
    }

    pub(crate) fn root_right_ptr(&self) -> *const f32 {
        self.buffers[self.root].right.as_ptr()
    }
}

#[cfg(test)]
mod tests;
