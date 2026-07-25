// Open/close state for the global search palette.
//
// The palette is mounted once in App.vue so the keyboard shortcut works from
// anywhere, which puts it outside AppNav's component tree — so the nav button
// cannot call a method on it. This is the shared handle both sides talk to,
// following the same module-level-ref pattern as useThemeMode.
import { computed, ref } from 'vue'

const open = ref(false)

export const isPaletteOpen = computed(() => open.value)

export function openPalette() { open.value = true }
export function closePalette() { open.value = false }
export function togglePalette() { open.value = !open.value }

// ⌘K on Apple hardware, Ctrl+K everywhere else. userAgentData.platform is the
// modern signal; userAgent is the fallback since navigator.platform is
// deprecated and absent in some environments.
export function isApplePlatform() {
  const nav = globalThis.navigator
  if (!nav) return false
  const platform = nav.userAgentData?.platform || nav.platform || ''
  if (/mac|iphone|ipad|ipod/i.test(platform)) return true
  return /mac os x|iphone|ipad/i.test(nav.userAgent || '')
}

export function shortcutLabel() {
  return isApplePlatform() ? '⌘K' : 'Ctrl K'
}
