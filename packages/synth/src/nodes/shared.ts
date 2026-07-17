import type { Channels, Common } from '../types'

export const common = (out: Channels = 1): Common => ({ out, mods: [] })
