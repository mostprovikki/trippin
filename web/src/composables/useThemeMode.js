// Light/dark/system colour scheme, shared app-wide.
//
// Three modes rather than a boolean: "system" is the honest default (follow the
// OS, and keep following it when the OS flips at sunset), while an explicit
// light/dark is a deliberate override that must survive a reload.
//
// The resolved scheme is expressed as a single class on <html>:
//   .app-dark  ->  PrimeVue's darkModeSelector (see main.js) AND the --app-*
//                  token block in assets/main.css
// One switch drives both the component library and the app's own tokens, so the
// two can never disagree about which scheme is showing.
import { computed, ref } from 'vue'

export const STORAGE_KEY = 'tripper:theme'
export const DARK_CLASS = 'app-dark'
export const MODES = ['light', 'dark', 'system']

// localStorage throws in Safari private mode, and Node >=22 exposes a
// globalThis.localStorage getter that returns undefined unless a store file was
// passed — so every access is guarded rather than assumed.
function readStored() {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY)
    return MODES.includes(v) ? v : null
  } catch {
    return null
  }
}
function writeStored(value) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value)
  } catch {
    /* nothing we can do; the mode still applies for this session */
  }
}

function darkMediaQuery() {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)') ?? null
}

export function systemPrefersDark() {
  return darkMediaQuery()?.matches === true
}

// Module-level so every consumer shares one source of truth; the class on <html>
// is global state, so a per-component copy would only let them drift.
const mode = ref(readStored() || 'system')

// Bumped by the media-query listener. `resolvedScheme` reads it purely so Vue
// registers a dependency — matchMedia().matches is not reactive on its own, so
// without this the computed would cache the OS preference from first evaluation
// and a sunset flip would not reach the UI until a reload.
const systemTick = ref(0)

export const themeMode = computed(() => mode.value)
export const resolvedScheme = computed(() => {
  if (mode.value !== 'system') return mode.value
  systemTick.value // eslint-disable-line no-unused-expressions -- dependency only
  return systemPrefersDark() ? 'dark' : 'light'
})
export const isDark = computed(() => resolvedScheme.value === 'dark')

export function applyScheme() {
  const root = globalThis.document?.documentElement
  if (!root) return
  const dark = resolvedScheme.value === 'dark'
  root.classList.toggle(DARK_CLASS, dark)
  // Tells the browser to render native widgets — scrollbars, spinners, the
  // form-control chrome we do not style — in the matching scheme. Without it a
  // dark page keeps light scrollbars.
  root.style.colorScheme = dark ? 'dark' : 'light'
}

export function setThemeMode(next) {
  if (!MODES.includes(next)) return
  mode.value = next
  writeStored(next)
  applyScheme()
}

// The control in the nav is a single button, so it cycles rather than opening a
// menu for a three-value setting: whatever you are looking at now, one press
// gives you the other one, explicitly.
export function toggleThemeMode() {
  setThemeMode(isDark.value ? 'light' : 'dark')
}

let mediaListener = null

export function initThemeMode() {
  applyScheme()
  const mq = darkMediaQuery()
  if (mq && !mediaListener) {
    mediaListener = () => {
      systemTick.value++
      // Only a "system" mode follows the OS; an explicit choice must not be
      // silently overridden when the OS flips.
      if (mode.value === 'system') applyScheme()
    }
    // addEventListener is the modern form; addListener is kept for older Safari.
    if (mq.addEventListener) mq.addEventListener('change', mediaListener)
    else if (mq.addListener) mq.addListener(mediaListener)
  }
}

// Test seam: reset module state between cases.
export function _resetThemeMode(next = 'system') {
  mode.value = next
  const mq = darkMediaQuery()
  if (mq && mediaListener) {
    if (mq.removeEventListener) mq.removeEventListener('change', mediaListener)
    else if (mq.removeListener) mq.removeListener(mediaListener)
  }
  mediaListener = null
}
