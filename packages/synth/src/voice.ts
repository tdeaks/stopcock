import type { Note, Node, VoiceFactory, WebAudioHandle, WebAudioPlayOptions } from './types'
import { cloneForTrigger } from './internal/graph'
import { play } from './render/web'

type Mode = 'mono' | 'poly' | 'trigger'

function factory(template: Node, mode: Mode, max = 1): VoiceFactory {
  return {
    template,
    play(ctx: AudioContext, opts: WebAudioPlayOptions = {}): WebAudioHandle {
      const active: WebAudioHandle[] = []
      let underruns = 0

      const stopOldest = () => {
        const old = active.shift()
        old?.stop()
      }

      const removeActive = (handle: WebAudioHandle) => {
        const index = active.indexOf(handle)
        if (index >= 0) active.splice(index, 1)
      }

      return {
        trigger(note: Note) {
          if (mode === 'mono' && active.length > 0) stopOldest()
          if (mode === 'poly' && active.length >= max) stopOldest()
          const handle = play(ctx, cloneForTrigger(template, { ...note, atSec: note.atSec ?? ctx.currentTime }), opts)
          active.push(handle)
          if (note.gateMs !== undefined || mode === 'trigger') {
            const timeout = setTimeout(() => {
              handle.release(note)
              if (mode === 'trigger') {
                const stopTimeout = setTimeout(() => {
                  handle.stop()
                  removeActive(handle)
                }, 1200)
                if (typeof stopTimeout === 'object' && 'unref' in stopTimeout) stopTimeout.unref()
              }
            }, note.gateMs ?? 1000)
            if (typeof timeout === 'object' && 'unref' in timeout) timeout.unref()
          }
        },
        release(note?: Note) {
          for (const handle of active) handle.release(note)
        },
        stop() {
          for (const handle of active.splice(0)) handle.stop()
        },
        connectInput(channel: number, source: AudioNode) {
          for (const handle of active) handle.connectInput(channel, source)
        },
        get underruns() {
          return underruns + active.reduce((sum, handle) => sum + handle.underruns, 0)
        },
      }
    },
  }
}

export const voice = {
  mono: (template: Node): VoiceFactory => factory(template, 'mono', 1),
  poly: (template: Node, opts: { max: number }): VoiceFactory => factory(template, 'poly', Math.max(1, Math.floor(opts.max))),
  trigger: (template: Node): VoiceFactory => factory(template, 'trigger', Number.POSITIVE_INFINITY),
} as const
