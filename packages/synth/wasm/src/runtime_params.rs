use crate::dsp::safe_finite;
use crate::model::NodeDef;
use crate::runtime_state::NodeBuffer;

mod ids;

pub(crate) use ids::*;

const RUNTIME_CONTROL_BLOCK: usize = 128;

pub(crate) struct ParamAccess {
    slot_by_param: Box<[Option<usize>; PARAM_BUCKETS]>,
    mod_spans_by_param: Box<[Option<ModSpan>; PARAM_BUCKETS]>,
    mod_edges: Vec<CompiledModEdge>,
}

impl Default for ParamAccess {
    fn default() -> Self {
        Self {
            slot_by_param: empty_param_slots(),
            mod_spans_by_param: empty_mod_spans(),
            mod_edges: Vec::new(),
        }
    }
}

#[derive(Clone, Copy)]
struct ModSpan {
    start: usize,
    len: usize,
}

#[derive(Clone, Copy)]
struct CompiledModEdge {
    source: usize,
    depth: f64,
    control: bool,
}

struct PendingModEdge {
    param: ParamId,
    edge: CompiledModEdge,
}

fn empty_mod_spans() -> Box<[Option<ModSpan>; PARAM_BUCKETS]> {
    Box::new([None; PARAM_BUCKETS])
}

fn empty_param_slots() -> Box<[Option<usize>; PARAM_BUCKETS]> {
    Box::new([None; PARAM_BUCKETS])
}

impl ParamAccess {
    pub(crate) fn for_node(node: &NodeDef) -> Option<Self> {
        let mut slot_by_param = empty_param_slots();
        for slot in &node.param_slots {
            let param = slot.param_id.or_else(|| param_id(&slot.param))?;
            slot_by_param[param as usize] = Some(slot.slot);
        }

        let mut pending_edges = Vec::with_capacity(node.mods.len());
        for edge in &node.mods {
            let param = edge.param_id.or_else(|| param_id(&edge.param))?;
            pending_edges.push(PendingModEdge {
                param,
                edge: CompiledModEdge {
                    source: edge.source,
                    depth: edge.depth,
                    control: edge.control_rate.unwrap_or(edge.rate == "control"),
                },
            });
        }
        let (mod_spans_by_param, mod_edges) = group_mod_edges(pending_edges);

        Some(Self {
            slot_by_param,
            mod_spans_by_param,
            mod_edges,
        })
    }

    #[cfg(test)]
    pub(crate) fn for_test(slots: impl IntoIterator<Item = (ParamId, usize)>) -> Self {
        let mut slot_by_param = empty_param_slots();
        for (param, slot) in slots {
            if let Some(target) = slot_by_param.get_mut(param as usize) {
                *target = Some(slot);
            }
        }
        Self {
            slot_by_param,
            mod_spans_by_param: empty_mod_spans(),
            mod_edges: Vec::new(),
        }
    }

    pub(crate) fn static_param(&self, params: &[&[f32]], param: ParamId, base: f64) -> Option<f64> {
        if !self.param_is_static(params, param) {
            return None;
        }
        Some(safe_finite(
            slot_param_at(self, params, param, base, 0),
            base,
        ))
    }

    fn param_is_static(&self, params: &[&[f32]], param: ParamId) -> bool {
        if self
            .mod_spans_by_param
            .get(param as usize)
            .and_then(|span| *span)
            .is_some()
        {
            return false;
        }
        let Some(slot) = self
            .slot_by_param
            .get(param as usize)
            .and_then(|slot| *slot)
        else {
            return true;
        };
        match params.get(slot) {
            Some(values) => values.len() <= 1,
            None => true,
        }
    }
}

fn group_mod_edges(
    pending_edges: Vec<PendingModEdge>,
) -> (Box<[Option<ModSpan>; PARAM_BUCKETS]>, Vec<CompiledModEdge>) {
    let mut spans = empty_mod_spans();
    let mut edges = Vec::with_capacity(pending_edges.len());

    for param in 0..PARAM_BUCKETS {
        let start = edges.len();
        for pending in &pending_edges {
            if pending.param as usize == param {
                edges.push(pending.edge);
            }
        }
        let len = edges.len() - start;
        if len > 0 {
            spans[param] = Some(ModSpan { start, len });
        }
    }

    (spans, edges)
}

pub(crate) fn param_at(
    access: &ParamAccess,
    prior: &[NodeBuffer],
    params: &[&[f32]],
    param: ParamId,
    base: f64,
    sample: usize,
    frames: usize,
) -> f64 {
    let index = sample.min(frames.saturating_sub(1));
    let mut value = slot_param_at(access, params, param, base, index);
    let Some(span) = access
        .mod_spans_by_param
        .get(param as usize)
        .and_then(|span| *span)
    else {
        return safe_finite(value, base);
    };
    let edge_end = span
        .start
        .saturating_add(span.len)
        .min(access.mod_edges.len());
    for edge in &access.mod_edges[span.start..edge_end] {
        let edge_index = if edge.control {
            ((sample / RUNTIME_CONTROL_BLOCK) * RUNTIME_CONTROL_BLOCK).min(frames.saturating_sub(1))
        } else {
            index
        };
        if let Some(source) = prior.get(edge.source) {
            value += source.mono_sample(edge_index) as f64 * edge.depth;
        }
    }
    safe_finite(value, base)
}

fn slot_param_at(
    access: &ParamAccess,
    params: &[&[f32]],
    param: ParamId,
    base: f64,
    sample: usize,
) -> f64 {
    let Some(slot) = access
        .slot_by_param
        .get(param as usize)
        .and_then(|slot| *slot)
    else {
        return base;
    };
    let Some(values) = params.get(slot) else {
        return base;
    };
    if values.is_empty() {
        return base;
    }
    let value = if values.len() == 1 {
        values[0]
    } else {
        values[sample.min(values.len() - 1)]
    };
    value as f64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Fields, ModDef, ParamSlot};

    #[test]
    fn reads_scalar_and_block_param_slots() {
        let node = node_with_access(
            vec![ParamSlot {
                param: "amount".to_string(),
                param_id: None,
                slot: 0,
            }],
            vec![],
        );
        let access = ParamAccess::for_node(&node).expect("param access");
        let scalar = [0.25_f32];
        let block = [0.25_f32, 0.5, 0.75];

        assert_eq!(
            param_at(&access, &[], &[&scalar], PARAM_AMOUNT, 1.0, 2, 3),
            0.25
        );
        assert_eq!(
            param_at(&access, &[], &[&block], PARAM_AMOUNT, 1.0, 1, 3),
            0.5
        );
    }

    #[test]
    fn applies_audio_and_control_rate_modulation() {
        let audio_node = node_with_access(
            vec![],
            vec![ModDef {
                param: "amount".to_string(),
                param_id: None,
                source: 0,
                depth: 2.0,
                rate: "audio".to_string(),
                control_rate: None,
            }],
        );
        let control_node = node_with_access(
            vec![],
            vec![ModDef {
                param: "amount".to_string(),
                param_id: None,
                source: 0,
                depth: 2.0,
                rate: "control".to_string(),
                control_rate: None,
            }],
        );
        let audio_access = ParamAccess::for_node(&audio_node).expect("audio access");
        let control_access = ParamAccess::for_node(&control_node).expect("control access");
        let mut source = NodeBuffer::new(1, 256);
        for (index, sample) in source.left.iter_mut().enumerate() {
            *sample = index as f32;
        }

        assert_eq!(
            param_at(
                &audio_access,
                &[source.clone()],
                &[],
                PARAM_AMOUNT,
                1.0,
                129,
                256
            ),
            259.0
        );
        assert_eq!(
            param_at(&control_access, &[source], &[], PARAM_AMOUNT, 1.0, 129, 256),
            257.0
        );
    }

    #[test]
    fn groups_sparse_modulation_edges_without_cross_param_bleed() {
        let node = node_with_access(
            vec![],
            vec![
                ModDef {
                    param: "tone".to_string(),
                    param_id: None,
                    source: 0,
                    depth: 4.0,
                    rate: "audio".to_string(),
                    control_rate: None,
                },
                ModDef {
                    param: "amount".to_string(),
                    param_id: None,
                    source: 1,
                    depth: 3.0,
                    rate: "audio".to_string(),
                    control_rate: None,
                },
                ModDef {
                    param: "tone".to_string(),
                    param_id: None,
                    source: 2,
                    depth: 5.0,
                    rate: "audio".to_string(),
                    control_rate: None,
                },
            ],
        );
        let access = ParamAccess::for_node(&node).expect("param access");
        let mut first = NodeBuffer::new(1, 4);
        let mut second = NodeBuffer::new(1, 4);
        let mut third = NodeBuffer::new(1, 4);
        first.left[2] = 0.25;
        second.left[2] = 0.5;
        third.left[2] = 0.75;
        let prior = [first, second, third];

        assert_eq!(param_at(&access, &prior, &[], PARAM_TONE, 1.0, 2, 4), 5.75);
        assert_eq!(param_at(&access, &prior, &[], PARAM_AMOUNT, 1.0, 2, 4), 2.5);
    }

    #[test]
    fn static_param_returns_scalar_slots_and_rejects_dynamic_inputs() {
        let scalar_node = node_with_access(
            vec![ParamSlot {
                param: "amount".to_string(),
                param_id: None,
                slot: 0,
            }],
            vec![],
        );
        let scalar_access = ParamAccess::for_node(&scalar_node).expect("scalar access");
        let scalar = [0.25_f32];
        assert_eq!(
            scalar_access.static_param(&[&scalar], PARAM_AMOUNT, 1.0),
            Some(0.25)
        );
        assert_eq!(
            scalar_access.static_param(&[&scalar], PARAM_TONE, 0.5),
            Some(0.5)
        );

        let block = [0.25_f32, 0.5];
        assert_eq!(
            scalar_access.static_param(&[&block], PARAM_AMOUNT, 1.0),
            None
        );

        let modulated_node = node_with_access(
            vec![],
            vec![ModDef {
                param: "amount".to_string(),
                param_id: None,
                source: 0,
                depth: 1.0,
                rate: "control".to_string(),
                control_rate: None,
            }],
        );
        let modulated_access = ParamAccess::for_node(&modulated_node).expect("mod access");
        assert_eq!(modulated_access.static_param(&[], PARAM_AMOUNT, 1.0), None);
    }

    #[test]
    fn binary_decoded_param_ids_and_rates_bypass_string_lookup() {
        let node = node_with_access(
            vec![ParamSlot {
                param: "unknown".to_string(),
                param_id: Some(PARAM_AMOUNT),
                slot: 0,
            }],
            vec![ModDef {
                param: "unknown".to_string(),
                param_id: Some(PARAM_AMOUNT),
                source: 0,
                depth: 2.0,
                rate: "audio".to_string(),
                control_rate: Some(true),
            }],
        );
        let access = ParamAccess::for_node(&node).expect("param access");
        let params = [0.5_f32];
        let mut source = NodeBuffer::new(1, 256);
        for (index, sample) in source.left.iter_mut().enumerate() {
            *sample = index as f32;
        }

        assert_eq!(
            param_at(&access, &[source], &[&params], PARAM_AMOUNT, 1.0, 129, 256),
            256.5
        );
    }

    fn node_with_access(param_slots: Vec<ParamSlot>, mods: Vec<ModDef>) -> NodeDef {
        NodeDef {
            kind: "gain".to_string(),
            kind_id: None,
            out: 1,
            inputs: vec![0],
            mods,
            param_slots,
            fields: Fields::default(),
        }
    }
}
