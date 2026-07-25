import { computed, reactive, ref, unref, watch, onBeforeUnmount, getCurrentInstance } from 'vue'

const PREFIX = 'tripper:draft:'

function bulkSnapshot(obj, urlFields) {
  const out = {}
  for (const k of Object.keys(obj)) if (!urlFields.includes(k)) out[k] = obj[k]
  return out
}

// `key` may be a plain string, a ref, or a getter. Views mounted under a layout
// that is reused across :id changes are never re-created, so a key baked in at
// setup time would keep pointing at the trip the user has already left; a getter
// lets the draft follow the route instead.
export function useDraft(key, factory, { urlFields = [], router = null, route = null, debounceMs = 400 } = {}) {
  const storageKey = computed(() => PREFIX + (typeof key === 'function' ? key() : unref(key)))

  const draft = reactive({})
  const baseline = ref('')
  const isDirty = ref(false)

  // The key the current draft contents belong to. Every read/write goes through
  // this rather than storageKey.value, so a write scheduled before a key change
  // can never land in the new key's slot no matter which watcher flushes first.
  let activeKey = storageKey.value

  function hydrate() {
    activeKey = storageKey.value
    const base = factory()
    let stored = null
    try { stored = JSON.parse(localStorage.getItem(activeKey) ?? 'null') } catch { stored = null }

    const initial = { ...base, ...(stored || {}) }
    if (route) {
      for (const f of urlFields) {
        if (route.query[f] !== undefined) {
          initial[f] = typeof base[f] === 'number' ? Number(route.query[f]) : route.query[f]
        }
      }
    }

    // mutate the same reactive object instead of replacing it, so v-model
    // bindings and `const x = draft.thing` aliases survive a re-key
    for (const k of Object.keys(draft)) if (!(k in initial)) delete draft[k]
    Object.assign(draft, initial)
    // baseline = pristine factory output, so a restored stored draft counts as dirty
    baseline.value = JSON.stringify(bulkSnapshot(base, urlFields))
    isDirty.value = JSON.stringify(bulkSnapshot(initial, urlFields)) !== baseline.value
  }
  hydrate()

  let timer = null
  function persistNow() {
    try { localStorage.setItem(activeKey, JSON.stringify(bulkSnapshot(draft, urlFields))) } catch { /* quota/private mode: draft persistence is best-effort */ }
  }

  const stopDraftWatch = watch(draft, () => {
    isDirty.value = JSON.stringify(bulkSnapshot(draft, urlFields)) !== baseline.value
    if (isDirty.value) {
      clearTimeout(timer)
      timer = setTimeout(persistNow, debounceMs)
    } else {
      clearTimeout(timer)
      timer = null
      try { localStorage.removeItem(activeKey) } catch { /* ignore */ }
    }
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

  const stopKeyWatch = watch(storageKey, () => {
    // Flush rather than discard: the pending write holds edits the user made to
    // the entity we are leaving, and they can navigate straight back to it —
    // silently dropping them would be the same data loss the unmount teardown
    // already promises not to cause. persistNow() still targets the *old*
    // activeKey, so the flush cannot contaminate the incoming key.
    clearTimeout(timer)
    timer = null
    // recompute from draft/baseline instead of trusting isDirty.value: if the
    // key and the draft changed in the same tick, this watcher may run before
    // the deep watcher has updated the ref or even scheduled a timer
    if (JSON.stringify(bulkSnapshot(draft, urlFields)) !== baseline.value) persistNow()
    // re-reads storage under the new key and resets baseline/isDirty, so the
    // incoming entity never inherits the outgoing one's values or dirty flag
    hydrate()
  })

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
    // useDraft can be called outside a component (tests, plain modules), where
    // there is no scope to auto-stop these for us
    stopDraftWatch()
    stopKeyWatch()
  }
  if (getCurrentInstance()) onBeforeUnmount(teardown)

  function clear() {
    clearTimeout(timer)
    timer = null
    try { localStorage.removeItem(activeKey) } catch { /* ignore */ }
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
