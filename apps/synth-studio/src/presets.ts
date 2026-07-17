import type { Preset } from './state'

export const presets: ReadonlyArray<Preset> = [
  {
    num: '001', name: 'Hollow Saw',
    state: {
      osc: { engine: 'wavetable', wave: 'saw', tune: 0, fine: 0, level: 0.78, detune: 0.2 },
      flt: { engine: 'ladder', mode: 'lp', cutoff: 2400, res: 0.38, drive: 0.18, key: 0.6 },
      env: { engine: 'adsr', atk: 0.012, dec: 0.36, sus: 0.58, rel: 0.42 },
      lfo: { engine: 'sine', rate: 1.2, depth: 0.4, phase: 0 },
    },
  },
  {
    num: '002', name: 'Glass Plate',
    state: {
      osc: { engine: 'wavetable', wave: 'sine', tune: 12, fine: 0, level: 0.7, detune: 0.05 },
      flt: { engine: 'ladder', mode: 'lp', cutoff: 5400, res: 0.18, drive: 0.04, key: 0.4 },
      env: { engine: 'adsr', atk: 0.008, dec: 0.6, sus: 0.4, rel: 0.8 },
      lfo: { engine: 'sine', rate: 4.5, depth: 0.18, phase: 0 },
    },
  },
  {
    num: '003', name: 'Sub Drone',
    state: {
      osc: { engine: 'wavetable', wave: 'triangle', tune: -12, fine: 0, level: 0.9, detune: 0.05 },
      flt: { engine: 'ladder', mode: 'lp', cutoff: 360, res: 0.22, drive: 0.08, key: 0.2 },
      env: { engine: 'adsr', atk: 0.4, dec: 1.2, sus: 0.9, rel: 1.8 },
      lfo: { engine: 'sine', rate: 0.3, depth: 0.6, phase: 0 },
    },
  },
  {
    num: '004', name: 'Acid Line',
    state: {
      osc: { engine: 'acid', wave: 'saw', tune: -12, fine: 0, level: 0.92, detune: 0 },
      flt: { engine: 'ladder', mode: 'lp', cutoff: 1100, res: 0.74, drive: 0.46, key: 0.7 },
      env: { engine: 'ar', atk: 0.003, dec: 0.15, sus: 0, rel: 0.18 },
      lfo: { engine: 'sine', rate: 1, depth: 0.32, phase: 0 },
    },
  },
  {
    num: '005', name: 'FM Bell',
    state: {
      osc: { engine: 'fm', wave: 'sine', tune: 0, fine: 0, level: 0.72, detune: 0.5 },
      flt: { engine: 'ladder', mode: 'lp', cutoff: 7200, res: 0.1, drive: 0.04, key: 0.3 },
      env: { engine: 'adsr', atk: 0.004, dec: 0.5, sus: 0.18, rel: 1.2 },
      lfo: { engine: 'tri', rate: 2.8, depth: 0.18, phase: 0 },
    },
  },
  {
    num: '006', name: 'Paper Strings',
    state: {
      osc: { engine: 'poly', wave: 'saw', tune: 0, fine: 0, level: 0.62, detune: 0.4 },
      flt: { engine: 'ladder', mode: 'lp', cutoff: 2200, res: 0.22, drive: 0.04, key: 0.4 },
      env: { engine: 'adsr', atk: 0.18, dec: 0.4, sus: 0.7, rel: 1.6 },
      lfo: { engine: 'sine', rate: 0.6, depth: 0.4, phase: 0 },
    },
  },
  {
    num: '007', name: 'DX7 Piano',
    state: {
      osc: { engine: 'epiano', wave: 'sine', tune: 0, fine: 0, level: 0.72, detune: 0.55 },
      flt: { engine: 'ladder', mode: 'lp', cutoff: 5200, res: 0.08, drive: 0.05, key: 0.5 },
      env: { engine: 'adsr', atk: 0.002, dec: 0.55, sus: 0.18, rel: 1.1 },
      lfo: { engine: 'tri', rate: 0.4, depth: 0.05, phase: 0 },
    },
  },
  {
    num: '008', name: 'Justice Genesis',
    state: {
      osc: { engine: 'poly', wave: 'saw', tune: -12, fine: 0, level: 0.85, detune: 0.55 },
      flt: { engine: 'ladder', mode: 'lp', cutoff: 1800, res: 0.32, drive: 0.55, key: 0.5 },
      env: { engine: 'adsr', atk: 0.004, dec: 0.22, sus: 0.78, rel: 0.18 },
      lfo: { engine: 'sine', rate: 0.2, depth: 0.08, phase: 0 },
      fx: [
        { kind: 'saturator', enabled: true, params: { drive: 0.72, asymmetry: 0.18, tone: 0.58, mix: 1, output: 1 } },
        { kind: 'ensembleChorus', enabled: true, params: { rate: 0.3, depth: 6, mix: 0.45, width: 1, tone: 0.82, noise: 0 } },
        { kind: 'compressor', enabled: true, params: { threshold: -28, ratio: 8, attack: 3, release: 90, knee: 6 } },
        { kind: 'tiltEq', enabled: true, params: { freq: 1000, gain: 3, mix: 1 } },
      ],
    },
  },
  {
    num: '009', name: 'Bicep Atlas',
    state: {
      osc: { engine: 'wavetable', wave: 'saw', tune: 0, fine: 0, level: 0.7, detune: 0.32 },
      // envAmt drives the per-note filter sweep — bump it toward 0.8 for harder pluck, drop to 0.25 for pad
      flt: { engine: 'ladder', mode: 'lp', cutoff: 700, res: 0.42, drive: 0.12, key: 0.6, envAmt: 0.55 },
      env: { engine: 'adsr', atk: 0.002, dec: 0.18, sus: 0, rel: 0.22 },
      lfo: { engine: 'sine', rate: 0.18, depth: 0.06, phase: 0 },
      arp: { enabled: true, latch: true, mode: 'up', rate: '1/16', bpm: 124, octaves: 2, gate: 0.42, swing: 0, velocity: 0.85, seed: 0x5a17 },
      fx: [
        { kind: 'tapeDelay', enabled: true, params: { time: 363, fbk: 0.42, mix: 0.28, wow: 0.18, flutter: 0.08, age: 0.3, drive: 0.1, tone: 0.72 } },
        { kind: 'plateReverb', enabled: true, params: { predelay: 18, decay: 0.78, damping: 0.42, diffusion: 0.78, modulation: 0.22, mix: 0.45 } },
        { kind: 'stereoSpread', enabled: true, params: { width: 1.2, delay: 11, mix: 1 } },
        { kind: 'tiltEq', enabled: true, params: { freq: 1500, gain: 2, mix: 1 } },
      ],
    },
  },
]
