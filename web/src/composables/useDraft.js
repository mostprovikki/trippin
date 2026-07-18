import { reactive, ref, watch, onBeforeUnmount, getCurrentInstance } from 'vue'

const PREFIX = 'tripper:draft:'

function bulkSnapshot(obj, urlFields) {
  const out = {}
  for (const k of Object.keys(obj)) if (!urlFields.includes(k)) out[k] = obj[k]
  return out
}

export function useDraft(key, factory, { urlFields = [], router = null, route = null, debounceMs = 400 } = {}) {
  const storageKey = PREFIX + key
  const base = factory()

  let stored = null
  try { stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') } catch { stored = null }

  const initial = { ...base, ...(stored || {}) }
  if (route) {
    for (const f of urlFields) {
      if (route.query[f] !== undefined) {
        initial[f] = typeof base[f] === 'number' ? Number(route.query[f]) : route.query[f]
      }
    }
  }

  const draft = reactive(initial)
  // baseline = pristine factory output, so a restored stored draft counts as dirty
  const baseline = ref(JSON.stringify(bulkSnapshot(base, urlFields)))
  const isDirty = ref(JSON.stringify(bulkSnapshot(initial, urlFields)) !== baseline.value)

  let timer = null
  function persistNow() {
    try { localStorage.setItem(storageKey, JSON.stringify(bulkSnapshot(draft, urlFields))) } catch { /* quota/private mode: draft persistence is best-effort */ }
  }

  watch(draft, () => {
    isDirty.value = JSON.stringify(bulkSnapshot(draft, urlFields)) !== baseline.value
    clearTimeout(timer)
    timer = setTimeout(persistNow, debounceMs)
    if (router && route && urlFields.length) {
      const q = { ...route.query }
      let changed = false
      for (const f of urlFields) {
        const v = String(draft[f])
        if (q[f] !== v) { q[f] = v; changed = true }
      }
      if (changed) router.replace({ query: q })
    }
  }, { deep: true })

  function onBeforeUnload(e) {
    if (!isDirty.value) return
    clearTimeout(timer)
    persistNow()
    e.preventDefault()
    e.returnValue = ''
  }
  window.addEventListener('beforeunload', onBeforeUnload)

  function teardown() {
    window.removeEventListener('beforeunload', onBeforeUnload)
    const hadPendingWrite = timer !== null
    clearTimeout(timer)
    timer = null
    if (hadPendingWrite) persistNow()
  }
  if (getCurrentInstance()) onBeforeUnmount(teardown)

  function clear() {
    clearTimeout(timer)
    timer = null
    try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
    if (router && route && urlFields.length) {
      const q = { ...route.query }
      for (const f of urlFields) delete q[f]
      router.replace({ query: q })
    }
    baseline.value = JSON.stringify(bulkSnapshot(draft, urlFields))
    isDirty.value = false
  }

  function load(values) {
    // Compute dirtiness directly from draft/baseline rather than trusting
    // isDirty.value: Vue's watch flush is async, so the ref can be stale
    // if load() runs synchronously after a draft mutation.
    const wasDirty = JSON.stringify(bulkSnapshot(draft, urlFields)) !== baseline.value
    const baseObj = JSON.parse(baseline.value)
    baseline.value = JSON.stringify(bulkSnapshot({ ...baseObj, ...values }, urlFields))
    if (!wasDirty) Object.assign(draft, values)
    isDirty.value = JSON.stringify(bulkSnapshot(draft, urlFields)) !== baseline.value
  }

  return { draft, isDirty, clear, load, teardown }
}

// Promise<boolean> confirm for onBeforeRouteLeave guards.
// `confirm` is PrimeVue's useConfirm() instance, passed in for testability.
export function confirmDiscard(confirm, message = 'You have unsaved changes. Discard them?') {
  return new Promise((resolve) => {
    let settled = false
    const done = (v) => { if (!settled) { settled = true; resolve(v) } }
    confirm.require({
      message,
      header: 'Unsaved changes',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Discard',
      rejectLabel: 'Keep editing',
      acceptClass: 'p-button-danger',
      accept: () => done(true),
      reject: () => done(false),
      onHide: () => done(false)
    })
  })
}
