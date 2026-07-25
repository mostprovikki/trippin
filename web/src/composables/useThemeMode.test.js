import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The module keeps `mode` at module scope on purpose (the class on <html> is
// global state), so anything that depends on what was in storage AT IMPORT TIME
// has to be exercised through a fresh import rather than a setter.
async function freshImport() {
  vi.resetModules()
  return import('./useThemeMode.js')
}

// happy-dom does not implement matchMedia, and the module has to work whether or
// not it exists — so install a controllable stub and also test its absence.
function stubMatchMedia(matches) {
  const listeners = new Set()
  const mq = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn),
    _emit(next) {
      mq.matches = next
      for (const fn of listeners) fn({ matches: next })
    },
    _listenerCount: () => listeners.size
  }
  globalThis.matchMedia = vi.fn(() => mq)
  return mq
}

const KEY = 'tripper:theme'

beforeEach(() => {
  globalThis.localStorage?.clear?.()
  document.documentElement.className = ''
  document.documentElement.style.colorScheme = ''
  stubMatchMedia(false)
})

afterEach(() => {
  delete globalThis.matchMedia
})

describe('theme mode defaults', () => {
  it('defaults to system when nothing is stored', async () => {
    const m = await freshImport()
    expect(m.themeMode.value).toBe('system')
  })

  it('restores an explicit stored mode', async () => {
    globalThis.localStorage.setItem(KEY, 'dark')
    const m = await freshImport()
    expect(m.themeMode.value).toBe('dark')
    expect(m.isDark.value).toBe(true)
  })

  it('ignores a junk stored value rather than trusting it', async () => {
    globalThis.localStorage.setItem(KEY, 'aubergine')
    const m = await freshImport()
    expect(m.themeMode.value).toBe('system')
  })
})

describe('resolvedScheme', () => {
  it('follows the OS while in system mode', async () => {
    stubMatchMedia(true)
    const m = await freshImport()
    expect(m.themeMode.value).toBe('system')
    expect(m.resolvedScheme.value).toBe('dark')
  })

  it('ignores the OS once a mode is chosen explicitly', async () => {
    stubMatchMedia(true) // OS says dark
    const m = await freshImport()
    m.setThemeMode('light')
    expect(m.resolvedScheme.value).toBe('light')
    expect(m.isDark.value).toBe(false)
  })

  // Guards the reactivity trap: matchMedia().matches is not reactive, so without
  // the systemTick dependency the computed caches the first read and a sunset
  // flip never reaches the UI.
  it('recomputes when the OS preference changes mid-session', async () => {
    const mq = stubMatchMedia(false)
    const m = await freshImport()
    m.initThemeMode()
    expect(m.resolvedScheme.value).toBe('light')
    mq._emit(true)
    expect(m.resolvedScheme.value).toBe('dark')
    expect(document.documentElement.classList.contains(m.DARK_CLASS)).toBe(true)
  })

  it('does not let an OS change override an explicit choice', async () => {
    const mq = stubMatchMedia(false)
    const m = await freshImport()
    m.initThemeMode()
    m.setThemeMode('light')
    mq._emit(true)
    expect(m.resolvedScheme.value).toBe('light')
    expect(document.documentElement.classList.contains(m.DARK_CLASS)).toBe(false)
  })
})

describe('applyScheme', () => {
  it('adds the class and sets colorScheme for dark', async () => {
    const m = await freshImport()
    m.setThemeMode('dark')
    expect(document.documentElement.classList.contains(m.DARK_CLASS)).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('removes the class and resets colorScheme for light', async () => {
    const m = await freshImport()
    m.setThemeMode('dark')
    m.setThemeMode('light')
    expect(document.documentElement.classList.contains(m.DARK_CLASS)).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')
  })
})

describe('setThemeMode / toggleThemeMode', () => {
  it('persists the choice', async () => {
    const m = await freshImport()
    m.setThemeMode('dark')
    expect(globalThis.localStorage.getItem(KEY)).toBe('dark')
  })

  it('rejects an unknown mode instead of applying it', async () => {
    const m = await freshImport()
    m.setThemeMode('dark')
    m.setThemeMode('chartreuse')
    expect(m.themeMode.value).toBe('dark')
  })

  it('toggles to an explicit opposite of what is showing', async () => {
    const m = await freshImport()
    m.setThemeMode('light')
    m.toggleThemeMode()
    expect(m.themeMode.value).toBe('dark')
    m.toggleThemeMode()
    expect(m.themeMode.value).toBe('light')
  })

  // From "system" the toggle must commit to a real value, not flip to the other
  // system reading and stay implicit.
  it('leaves system mode for an explicit one when toggled', async () => {
    stubMatchMedia(true) // system resolves dark
    const m = await freshImport()
    expect(m.themeMode.value).toBe('system')
    m.toggleThemeMode()
    expect(m.themeMode.value).toBe('light')
    expect(globalThis.localStorage.getItem(KEY)).toBe('light')
  })
})

describe('hostile environments', () => {
  it('survives localStorage that throws on read and write', async () => {
    const real = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('SecurityError: storage disabled') }
    })
    try {
      const m = await freshImport()
      expect(m.themeMode.value).toBe('system')
      expect(() => m.setThemeMode('dark')).not.toThrow()
      // The scheme still applies for this session even though it cannot persist.
      expect(document.documentElement.classList.contains(m.DARK_CLASS)).toBe(true)
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: real, writable: true })
    }
  })

  it('works with no matchMedia at all', async () => {
    delete globalThis.matchMedia
    const m = await freshImport()
    expect(m.systemPrefersDark()).toBe(false)
    expect(m.resolvedScheme.value).toBe('light')
    expect(() => m.initThemeMode()).not.toThrow()
  })

  it('registers the OS listener only once across repeated init calls', async () => {
    const mq = stubMatchMedia(false)
    const m = await freshImport()
    m.initThemeMode()
    m.initThemeMode()
    m.initThemeMode()
    expect(mq._listenerCount()).toBe(1)
  })
})
