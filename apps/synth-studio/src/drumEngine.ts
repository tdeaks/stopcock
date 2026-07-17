import {
  compileWorklet,
  play,
  type Node,
  type WebAudioHandle,
} from '@stopcock/synth'
import { DRUM_KIT, type DrumPieceDef, type DrumPieceId } from './drumKit'

type CompiledPiece = {
  def: DrumPieceDef
  template: Node
  /** Most-recently triggered handle in this piece's choke group, for cutoff. */
  lastHandle: WebAudioHandle | null
  lastHandleAt: number
}

export type DrumEngineHandle = {
  ctx: AudioContext
  /** Trigger a kit piece immediately. */
  trigger(pieceId: DrumPieceId, velocity: number): void
  setLevel(level: number): void
  destroy(): void
}

/**
 * How long after a trigger we keep a handle alive before assuming the
 * one-shot has decayed and we can disconnect it. Worst-case for our kit is the
 * open-hat tail (~0.5s) plus a comfort margin.
 */
const HANDLE_TTL_MS = 1500

/**
 * Build a drum engine that pre-compiles one Rust/WASM worklet per kit piece,
 * then triggers them by cloning the template for each hit. Connects into the
 * provided destination (typically the synth engine's masterBus, so drums show
 * up on the spectrum/scope and respect the same headroom).
 */
export async function createDrumEngine(
  ctx: AudioContext,
  destination: AudioNode,
): Promise<DrumEngineHandle> {
  const drumBus = ctx.createGain()
  drumBus.gain.value = 0.85
  drumBus.connect(destination)

  const compiled = new Map<DrumPieceId, CompiledPiece>()
  for (const def of DRUM_KIT) {
    const template = def.build()
    await compileWorklet(ctx, template)
    compiled.set(def.id, { def, template, lastHandle: null, lastHandleAt: 0 })
  }

  // Choke group enforcement: when a piece in a choke group fires, any other
  // piece in the same group still ringing is stopped. Models a real kit's
  // closed-hat-mutes-open-hat behavior. Tune by adjusting chokeGroup ids in
  // drumKit.ts.
  const chokeIfNeeded = (piece: CompiledPiece): void => {
    if (piece.def.chokeGroup === null) return
    for (const other of compiled.values()) {
      if (other === piece) continue
      if (other.def.chokeGroup !== piece.def.chokeGroup) continue
      if (!other.lastHandle) continue
      try { other.lastHandle.stop() } catch { /* already stopped */ }
      other.lastHandle = null
    }
  }

  const PER_HIT_TRIM = 0.6

  /**
   * Trigger a kit piece immediately. The kernel's envelope starts from
   * frame 0 of the new worklet, so spawning the worklet IS the trigger event.
   * Velocity bakes into a per-hit gain that scales the entire one-shot.
   *
   * We play the template directly (not via cloneForTrigger) because that
   * helper would clobber `freq` with noteToFreq(midi), turning the kick into
   * a 261 Hz bonk and the hat into a low buzz. Each play() call still spawns
   * a fresh AudioWorkletNode with its own DrumVoiceState (frame counter at
   * 0), so concurrent voices don't share state.
   */
  const trigger = (pieceId: DrumPieceId, velocity: number): void => {
    const piece = compiled.get(pieceId)
    if (!piece) return

    chokeIfNeeded(piece)

    const hitGain = ctx.createGain()
    hitGain.gain.value = Math.max(0, Math.min(1, velocity)) * PER_HIT_TRIM
    hitGain.connect(drumBus)

    const handle = play(ctx, piece.template, { destination: hitGain })

    piece.lastHandle = handle
    piece.lastHandleAt = ctx.currentTime

    window.setTimeout(() => {
      if (piece.lastHandle === handle) piece.lastHandle = null
      try { handle.stop() } catch { /* already stopped */ }
      try { hitGain.disconnect() } catch { /* already disconnected */ }
    }, HANDLE_TTL_MS)
  }

  return {
    ctx,
    trigger,
    setLevel: (level) => { drumBus.gain.value = Math.max(0, Math.min(1, level)) },
    destroy: () => {
      for (const piece of compiled.values()) {
        if (piece.lastHandle) {
          try { piece.lastHandle.stop() } catch { /* already stopped */ }
        }
      }
      try { drumBus.disconnect() } catch { /* already disconnected */ }
    },
  }
}
