<script setup>
// The "quiet global search" the vision asks for: out of the way until ⌘K / Ctrl+K
// summons it, keyboard-first once it is open (type, arrow, Enter), and gone on
// Escape. Mounted once in App.vue so the shortcut works from any authenticated
// screen rather than only where a search box happens to be visible.
import { computed, nextTick, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSearchStore, MIN_QUERY } from '../stores/search.js'
import { isPaletteOpen, closePalette, togglePalette } from '../composables/useSearchPalette.js'

const router = useRouter()
const store = useSearchStore()

// Open state lives in the shared controller so the nav button (which is outside
// this component's tree) can raise the palette too.
const open = isPaletteOpen
const active = ref(0)
const inputEl = ref(null)
const listEl = ref(null)

const items = computed(() => store.items)

// Group headers are rendered inline, so the list needs to know where each group
// starts without splitting the flat array that keyboard navigation indexes into.
const rows = computed(() => {
  const out = []
  let lastGroup = null
  items.value.forEach((item, index) => {
    if (item.groupLabel !== lastGroup) {
      out.push({ header: item.groupLabel, key: `h-${item.groupLabel}` })
      lastGroup = item.groupLabel
    }
    out.push({ item, index, key: item.kind + item.id })
  })
  return out
})

function isEditable(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function onKeydown(e) {
  // ⌘K on macOS, Ctrl+K elsewhere. Chosen over "/" because "/" would hijack the
  // slash key inside every text field in the app.
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (open.value) close()
    else togglePalette()
    return
  }
  if (!open.value) return
  if (e.key === 'Escape') { e.preventDefault(); close(); return }
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return }
  if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return }
  if (e.key === 'Enter') {
    e.preventDefault()
    // Enter with nothing highlighted (or on a non-navigable row) still needs to
    // do something useful, so it falls through to the full results page.
    const chosen = items.value[active.value]
    if (chosen?.to) go(chosen)
    else if (store.query.trim().length >= MIN_QUERY) seeAll()
    return
  }
  // Any other keystroke while the overlay is open belongs to the search box,
  // even if focus drifted — but never steal keys from another real input.
  if (!isEditable(document.activeElement) && e.key.length === 1) inputEl.value?.focus()
}

function move(delta) {
  if (!items.value.length) return
  const n = items.value.length
  // Wrap, because a palette list is short and running off the end silently is
  // worse than cycling.
  active.value = (active.value + delta + n) % n
  scrollActiveIntoView()
}

async function scrollActiveIntoView() {
  await nextTick()
  const el = listEl.value?.querySelector('[data-active="true"]')
  el?.scrollIntoView({ block: 'nearest' })
}

function close() {
  closePalette()
  store.reset()
}

// Focus has to wait for the panel to exist, so react to it opening rather than
// focusing inside the click handler that requested it.
watch(open, async (isOpen) => {
  if (!isOpen) return
  active.value = 0
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.select()
})

function go(item) {
  if (!item?.to) return
  close()
  router.push(item.to)
}

function seeAll() {
  const q = store.query.trim()
  close()
  router.push({ path: '/search', query: { q } })
}

function onInput(e) {
  store.setQuery(e.target.value)
}

// New results invalidate the old highlight position.
watch(() => store.items.length, () => { active.value = 0 })

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="sp-mask"
      data-test="search-palette"
      @click.self="close"
    >
      <div class="sp-panel" role="dialog" aria-modal="true" aria-label="Search Tripper">
        <div class="sp-input-row">
          <i class="pi pi-search sp-input-icon" aria-hidden="true" />
          <input
            ref="inputEl"
            class="sp-input"
            type="text"
            :value="store.query"
            placeholder="Search trips, people, documents, itinerary…"
            aria-label="Search"
            autocomplete="off"
            spellcheck="false"
            data-test="search-palette-input"
            @input="onInput"
          />
          <kbd class="sp-kbd">esc</kbd>
        </div>

        <div ref="listEl" class="sp-results" role="listbox" aria-label="Search results">
          <p v-if="store.tooShort" class="sp-hint">Keep typing — at least {{ MIN_QUERY }} characters.</p>
          <p v-else-if="!store.query.trim()" class="sp-hint">
            Search across trips, people, documents, itinerary items, templates and the archive.
          </p>
          <p v-else-if="store.loading && !items.length" class="sp-hint">Searching…</p>
          <p v-else-if="store.error" class="sp-hint sp-error">{{ store.error }}</p>
          <p v-else-if="store.isEmpty" class="sp-hint" data-test="search-palette-empty">
            Nothing matches “{{ store.query.trim() }}”.
          </p>

          <template v-for="row in rows" :key="row.key">
            <p v-if="row.header" class="sp-group">{{ row.header }}</p>
            <button
              v-else
              type="button"
              class="sp-row"
              role="option"
              :class="{ 'sp-row-active': row.index === active, 'sp-row-flat': !row.item.to }"
              :data-active="row.index === active"
              :aria-selected="row.index === active"
              :disabled="!row.item.to"
              @mousemove="active = row.index"
              @click="go(row.item)"
            >
              <i :class="row.item.icon" class="sp-row-icon" aria-hidden="true" />
              <span class="sp-row-text">
                <span class="sp-row-title">{{ row.item.title }}</span>
                <span class="sp-row-sub">{{ row.item.subtitle }}</span>
              </span>
              <span v-if="row.item.badge" class="sp-row-badge">{{ row.item.badge }}</span>
            </button>
          </template>
        </div>

        <div class="sp-footer">
          <span><kbd class="sp-kbd">↑</kbd><kbd class="sp-kbd">↓</kbd> navigate</span>
          <span><kbd class="sp-kbd">↵</kbd> open</span>
          <button
            v-if="store.total"
            type="button"
            class="sp-seeall"
            data-test="search-see-all"
            @click="seeAll"
          >See all {{ store.total }} results</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sp-mask {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: var(--app-scrim);
  backdrop-filter: blur(2px);
  display: flex;
  justify-content: center;
  /* flex-start, not the default `stretch`: this is a flex ROW, so the cross axis
     is vertical and stretch made the panel fill the whole 70vh even with one
     result in it — a small list sat above ~480px of empty panel. */
  align-items: flex-start;
  /* Sits high rather than centred: the list grows downward, so a centred panel
     would jump the input around as results arrive. */
  padding: 10vh 1rem 1rem;
}
.sp-panel {
  width: 100%;
  max-width: 40rem;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  box-shadow: var(--app-shadow-md);
  overflow: hidden;
}
.sp-input-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid var(--app-border);
}
/* .sp-input drops its own border and outline so the row reads as one field, so
   the row has to carry the focus indicator or there is none at all — and this
   is the palette's only input. Mirrors SearchView's .search-box:focus-within. */
.sp-input-row:focus-within {
  border-color: var(--app-primary);
  box-shadow: 0 0 0 3px var(--app-focus-ring);
}
.sp-input-icon { color: var(--app-text-muted); }
.sp-input {
  flex: 1;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--app-text);
  font-family: inherit;
  font-size: 1rem;
}
.sp-input::placeholder { color: var(--app-text-subtle); }
.sp-kbd {
  font-family: inherit;
  font-size: 0.6875rem;
  /* See AppNav's .app-search-kbd — a muted key cap fails AA on one scheme or the
     other, and a key cap is content. */
  color: var(--app-text);
  background: var(--app-surface-alt);
  border: 1px solid var(--app-border);
  border-radius: 4px;
  padding: 0.0625rem 0.3125rem;
}
.sp-results { overflow-y: auto; padding: 0.375rem; }
.sp-hint {
  margin: 0;
  padding: 1.25rem 0.75rem;
  color: var(--app-text-muted);
  font-size: 0.875rem;
  text-align: center;
}
.sp-error { color: var(--app-danger); }
.sp-group {
  margin: 0.5rem 0 0.25rem;
  padding: 0 0.625rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}
.sp-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.5rem 0.625rem;
  border: 0;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-text);
  font-family: inherit;
  font-size: 0.9375rem;
  text-align: left;
  cursor: pointer;
}
.sp-row-active { background: var(--app-primary-soft); }
.sp-row-flat { cursor: default; opacity: 0.85; }
.sp-row-icon { color: var(--app-text-muted); width: 1rem; text-align: center; }
.sp-row-active .sp-row-icon { color: var(--app-primary); }
.sp-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.sp-row-title {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-row-sub {
  font-size: 0.8125rem;
  color: var(--app-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-row-badge {
  flex-shrink: 0;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--app-text-muted);
  background: var(--app-surface-alt);
  border-radius: 999px;
  padding: 0.125rem 0.5rem;
}
.sp-footer {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--app-border);
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
.sp-footer .sp-kbd { margin-right: 0.1875rem; }
.sp-seeall {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--app-primary);
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

@media (max-width: 40rem) {
  .sp-mask { padding: 1rem; }
  .sp-panel { max-height: 85vh; }
}
</style>
