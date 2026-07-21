import { describe, expect, it } from 'vite-plus/test'
import { effects, filter, input } from '../nodes'
import { BinaryWriter, kindCode } from '../render/wasm-binary-writer'
import { spaceEchoHeads, writeBinaryNode } from '../render/wasm-binary-node'

describe('WASM binary node serialization', () => {
  it('keeps Space Echo head modes mapped to stable booleans', () => {
    expect(spaceEchoHeads('head-1')).toEqual([true, false, false])
    expect(spaceEchoHeads('head-2')).toEqual([false, true, false])
    expect(spaceEchoHeads('head-3')).toEqual([false, false, true])
    expect(spaceEchoHeads('heads-1-2')).toEqual([true, true, false])
    expect(spaceEchoHeads('heads-1-3')).toEqual([true, false, true])
    expect(spaceEchoHeads('heads-2-3')).toEqual([false, true, true])
    expect(spaceEchoHeads('heads-1-2-3')).toEqual([true, true, true])
  })

  it('serializes packed worklet input slots instead of authored channel ids', () => {
    const mic = input(7)
    const indexes = new WeakMap([[mic, 0]])
    const inputSlots = new WeakMap([[mic, 0]])
    const writer = new BinaryWriter()

    writeBinaryNode(writer, mic, indexes, undefined, inputSlots)

    const bytes = writer.finish()
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint8(0)).toBe(kindCode('input'))
    expect(view.getUint8(1)).toBe(1)
    expect(view.getUint32(2, true)).toBe(0)
    expect(view.getUint32(6, true)).toBe(0)
    expect(view.getUint32(10, true)).toBe(0)
    expect(bytes.length).toBe(14)
  })

  it('serializes tilt EQ fields after its input edge', () => {
    const mic = input(0)
    const tilt = effects.tiltEq({ freq: 900, gainDb: 6, mix: 0.75 })(mic)
    const indexes = new WeakMap([
      [mic, 0],
      [tilt, 1],
    ])
    const writer = new BinaryWriter()

    writeBinaryNode(writer, tilt, indexes)

    const bytes = writer.finish()
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint8(0)).toBe(kindCode('tiltEq'))
    expect(view.getUint8(1)).toBe(1)
    expect(view.getUint32(2, true)).toBe(1)
    expect(view.getUint32(6, true)).toBe(0)
    expect(view.getUint32(10, true)).toBe(0)
    expect(view.getFloat64(14, true)).toBe(900)
    expect(view.getFloat64(22, true)).toBe(6)
    expect(view.getFloat64(30, true)).toBe(0.75)
  })

  it('serializes stereo spread fields after its input edge', () => {
    const mic = input(0)
    const spread = effects.stereoSpread({ width: 0.8, delayMs: 11, mix: 0.5 })(mic)
    const indexes = new WeakMap([
      [mic, 0],
      [spread, 1],
    ])
    const writer = new BinaryWriter()

    writeBinaryNode(writer, spread, indexes)

    const bytes = writer.finish()
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint8(0)).toBe(kindCode('stereoSpread'))
    expect(view.getUint8(1)).toBe(2)
    expect(view.getUint32(2, true)).toBe(1)
    expect(view.getUint32(6, true)).toBe(0)
    expect(view.getUint32(10, true)).toBe(0)
    expect(view.getFloat64(14, true)).toBe(0.8)
    expect(view.getFloat64(22, true)).toBe(11)
    expect(view.getFloat64(30, true)).toBe(0.5)
  })

  it('serializes frequency shifter fields after its input edge', () => {
    const mic = input(0)
    const shifter = effects.frequencyShifter({ shiftHz: 110, mix: 0.75 })(mic)
    const indexes = new WeakMap([
      [mic, 0],
      [shifter, 1],
    ])
    const writer = new BinaryWriter()

    writeBinaryNode(writer, shifter, indexes)

    const bytes = writer.finish()
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint8(0)).toBe(kindCode('frequencyShifter'))
    expect(view.getUint8(1)).toBe(1)
    expect(view.getUint32(2, true)).toBe(1)
    expect(view.getUint32(6, true)).toBe(0)
    expect(view.getUint32(10, true)).toBe(0)
    expect(view.getFloat64(14, true)).toBe(110)
    expect(view.getFloat64(22, true)).toBe(0.75)
  })

  it('serializes rotary speaker fields after its input edge', () => {
    const mic = input(0)
    const rotary = effects.rotarySpeaker({
      rate: 6,
      depth: 0.8,
      mix: 0.6,
      drive: 0.2,
      width: 1,
      crossoverHz: 900,
    })(mic)
    const indexes = new WeakMap([
      [mic, 0],
      [rotary, 1],
    ])
    const writer = new BinaryWriter()

    writeBinaryNode(writer, rotary, indexes)

    const bytes = writer.finish()
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint8(0)).toBe(kindCode('rotarySpeaker'))
    expect(view.getUint8(1)).toBe(2)
    expect(view.getUint32(2, true)).toBe(1)
    expect(view.getUint32(6, true)).toBe(0)
    expect(view.getUint32(10, true)).toBe(0)
    expect(view.getFloat64(14, true)).toBe(6)
    expect(view.getFloat64(22, true)).toBe(0.8)
    expect(view.getFloat64(30, true)).toBe(0.6)
    expect(view.getFloat64(38, true)).toBe(0.2)
    expect(view.getFloat64(46, true)).toBe(1)
    expect(view.getFloat64(54, true)).toBe(900)
  })

  it('serializes state variable filter fields after its input edge', () => {
    const mic = input(0)
    const svf = filter.stateVariable('bandpass', 1_200, {
      resonance: 0.7,
      drive: 0.2,
      mix: 0.8,
    })(mic)
    const indexes = new WeakMap([
      [mic, 0],
      [svf, 1],
    ])
    const writer = new BinaryWriter()

    writeBinaryNode(writer, svf, indexes)

    const bytes = writer.finish()
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint8(0)).toBe(kindCode('stateVariableFilter'))
    expect(view.getUint8(1)).toBe(1)
    expect(view.getUint32(2, true)).toBe(1)
    expect(view.getUint32(6, true)).toBe(0)
    expect(view.getUint32(10, true)).toBe(0)
    expect(view.getUint8(14)).toBe(2)
    expect(view.getFloat64(15, true)).toBe(1_200)
    expect(view.getFloat64(23, true)).toBe(0.7)
    expect(view.getFloat64(31, true)).toBe(0.2)
    expect(view.getFloat64(39, true)).toBe(0.8)
  })

  it('serializes wavefolder fields after its input edge', () => {
    const mic = input(0)
    const folded = effects.wavefolder({
      drive: 0.7,
      depth: 0.8,
      asymmetry: 0.15,
      tone: 0.9,
      mix: 0.65,
      output: 0.85,
    })(mic)
    const indexes = new WeakMap([
      [mic, 0],
      [folded, 1],
    ])
    const writer = new BinaryWriter()

    writeBinaryNode(writer, folded, indexes)

    const bytes = writer.finish()
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint8(0)).toBe(kindCode('wavefolder'))
    expect(view.getUint8(1)).toBe(1)
    expect(view.getUint32(2, true)).toBe(1)
    expect(view.getUint32(6, true)).toBe(0)
    expect(view.getUint32(10, true)).toBe(0)
    expect(view.getFloat64(14, true)).toBe(0.7)
    expect(view.getFloat64(22, true)).toBe(0.8)
    expect(view.getFloat64(30, true)).toBe(0.15)
    expect(view.getFloat64(38, true)).toBe(0.9)
    expect(view.getFloat64(46, true)).toBe(0.65)
    expect(view.getFloat64(54, true)).toBe(0.85)
  })
})
