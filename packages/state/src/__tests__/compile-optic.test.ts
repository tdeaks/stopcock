import { describe, expect, it } from 'vite-plus/test'
import { set, view } from '@stopcock/fp/optic'
import { clearCache, compile } from '../compile'

describe('compiled optic integration', () => {
  it('exposes a functional lens backed by the state path descriptor', () => {
    const source = {
      users: [
        { name: 'Ada', active: true },
        { name: 'Grace', active: false },
      ],
    }
    const compiled = compile<typeof source, string>((state) => state.users[1].name)

    expect(compiled.path).toEqual(['users', 1, 'name'])
    expect(view(compiled.lens, source)).toBe('Grace')

    const updated = set(compiled.lens, source, 'Hopper')
    expect(updated).toEqual({
      users: [
        { name: 'Ada', active: true },
        { name: 'Hopper', active: false },
      ],
    })
    expect(source.users[1].name).toBe('Grace')
  })

  it('keeps direct get/set and the optic adapter semantically aligned', () => {
    const source = { settings: { retries: 2 } }
    const compiled = compile<typeof source, number>((state) => state.settings.retries)

    expect(view(compiled.lens, source)).toBe(compiled.get(source))
    expect(set(compiled.lens, source, 4)).toEqual(compiled.set(source, 4))
    clearCache()
  })
})
