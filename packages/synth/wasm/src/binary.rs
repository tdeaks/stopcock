mod codes;
mod fields;
mod reader;

use codes::{node_kind, param_code, rate_is_control};
use fields::decode_fields;
use reader::Reader;

use crate::model::{ModDef, NodeDef, ParamSlot, RenderRequest};

const MAGIC: &[u8; 4] = b"SYN1";
const FLAG_GATE_SEC: u8 = 1;
const FLAG_VELOCITY: u8 = 2;
const FLAG_PARAM_SLOTS: u8 = 4;
const FLAG_TRIGGER_FREQ: u8 = 8;

pub(crate) fn decode_render_request(bytes: &[u8]) -> Option<RenderRequest> {
    let mut reader = Reader::new(bytes);
    reader.expect_magic(MAGIC)?;
    let sample_rate = reader.f64()?;
    let length = reader.usize()?;
    let root = reader.usize()?;
    let flags = reader.u8()?;
    let gate_sec = if flags & FLAG_GATE_SEC != 0 {
        Some(reader.f64()?)
    } else {
        None
    };
    let velocity = if flags & FLAG_VELOCITY != 0 {
        Some(reader.f64()?)
    } else {
        None
    };
    let trigger_freq = if flags & FLAG_TRIGGER_FREQ != 0 {
        Some(reader.f64()?)
    } else {
        None
    };
    let has_param_slots = flags & FLAG_PARAM_SLOTS != 0;
    let inputs = reader.vec(|r| r.f32_vec())?;
    let nodes = reader.vec(|r| decode_node(r, has_param_slots))?;
    if !reader.is_done() {
        return None;
    }
    Some(RenderRequest {
        sample_rate,
        length,
        root,
        gate_sec,
        velocity,
        trigger_freq,
        nodes,
        inputs,
    })
}

fn decode_node(reader: &mut Reader, has_param_slots: bool) -> Option<NodeDef> {
    let kind_code = reader.u8()?;
    let kind_id = node_kind(kind_code)?;
    let out = reader.u8()?;
    let inputs = reader.vec(|r| r.usize())?;
    let mods = reader.vec(|r| {
        let param_id = param_code(r.u16()?)?;
        let source = r.usize()?;
        let depth = r.f64()?;
        let control_rate = rate_is_control(r.u8()?)?;
        Some(ModDef {
            param: String::new(),
            param_id: Some(param_id),
            source,
            depth,
            rate: String::new(),
            control_rate: Some(control_rate),
        })
    })?;
    let param_slots = if has_param_slots {
        reader.vec(|r| {
            let param_id = param_code(r.u16()?)?;
            Some(ParamSlot {
                param: String::new(),
                param_id: Some(param_id),
                slot: r.usize()?,
            })
        })?
    } else {
        Vec::new()
    };
    let fields = decode_fields(kind_code, reader)?;
    Some(NodeDef {
        kind: String::new(),
        kind_id: Some(kind_id),
        out,
        inputs,
        mods,
        param_slots,
        fields,
    })
}
