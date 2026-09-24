// AI availability, shared app-wide. Fetched once from /api/ai/status and
// cached at module scope (same shape as useThemeMode's module-level `mode`):
// every AI action button asks the same question, so one fetch answers all of
// them instead of each button probing the server on its own mount.
import { ref, computed, reactive } from 'vue'
import { api } from '../api/client.js'

const raw = ref({ enabled: false, provider: 'none' })
let started = false

function ensureFetched() {
  if (started) return
  started = true
  // redirectOn401: false — this is a capability probe, not an authenticated
  // read; a signed-out visitor should just see AI as off, not get bounced to
  // /login (mirrors auth store's fetchAi/fetchMe probes).
  api.get('/api/ai/status', { redirectOn401: false })
    .then((data) => { raw.value = { enabled: !!data?.enabled, provider: data?.provider || 'none' } })
    .catch(() => { raw.value = { enabled: false, provider: 'none' } })
}

const enabled = computed(() => raw.value.enabled)
const provider = computed(() => raw.value.provider)
const isMock = computed(() => raw.value.provider === 'mock')

// reactive(), not a plain object: a plain `{ enabled, provider, isMock }` would
// hand callers the Ref instances themselves — fine in <script setup> (which
// auto-unwraps top-level bindings) but NOT for a nested property access like
// `aiStatus.enabled` in a template or in another composable's script, which
// reads the RefImpl object itself (always truthy) rather than its .value.
// reactive() unwraps refs on property access, so `aiStatus.enabled` is always
// the plain boolean.
export function useAiStatus() {
  ensureFetched()
  return reactive({ enabled, provider, isMock })
}

// Test seam: reset the module-level cache between cases, same pattern as
// useThemeMode's _resetThemeMode.
export function _resetAiStatus() {
  started = false
  raw.value = { enabled: false, provider: 'none' }
}
