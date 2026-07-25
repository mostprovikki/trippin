<script setup>
// The full-page half of Global Search. The palette is for "find it and go"; this
// is for "show me everything", is deep-linkable (/search?q=…), and raises the
// per-kind cap so a broad query is not silently truncated to five.
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSearchStore, MIN_QUERY } from '../stores/search.js'
import { decorate } from '../utils/searchResults.js'
import EmptyState from '../components/EmptyState.vue'

const PAGE_LIMIT = 25

const route = useRoute()
const router = useRouter()
const store = useSearchStore()

const decorated = computed(() =>
  store.groups.map((g) => ({ ...g, results: g.results.map((r) => decorate(g.kind, r)) }))
)

function load(q) {
  // immediate: the query came from the URL, so there is nothing to debounce.
  store.setQuery(q || '', { immediate: true }).then(() => {
    if ((q || '').trim().length >= MIN_QUERY) store.run(PAGE_LIMIT)
  })
}

function onInput(e) {
  const q = e.target.value
  store.setQuery(q)
  // Keep the URL in step so the result is shareable and Back works, without
  // stacking a history entry per keystroke.
  router.replace({ path: '/search', query: q ? { q } : {} })
}

onMounted(() => load(route.query.q))
watch(() => route.query.q, (q) => {
  if ((q || '') !== store.query) load(q)
})
</script>

<template>
  <div class="page">
    <h1>Search</h1>

    <div class="search-box">
      <i class="pi pi-search search-box-icon" aria-hidden="true" />
      <input
        class="search-box-input"
        type="text"
        :value="store.query"
        placeholder="Search trips, people, documents, itinerary…"
        aria-label="Search"
        autocomplete="off"
        data-test="search-view-input"
        @input="onInput"
      />
    </div>

    <p v-if="store.tooShort" class="search-note">Keep typing — at least {{ MIN_QUERY }} characters.</p>
    <p v-else-if="store.loading" class="search-note">Searching…</p>
    <p v-else-if="store.error" class="search-note search-error">{{ store.error }}</p>
    <p v-else-if="store.query.trim().length >= MIN_QUERY" class="search-note" data-test="search-view-count">
      {{ store.total }} result{{ store.total === 1 ? '' : 's' }} for “{{ store.query.trim() }}”
    </p>

    <EmptyState
      v-if="store.isEmpty"
      icon="pi pi-search"
      title="Nothing found"
      :message="`No trips, people, documents, itinerary items, templates or archived notes match “${store.query.trim()}”.`"
      data-test="search-view-empty"
    />

    <section v-for="group in decorated" :key="group.kind" class="card search-group">
      <h2>{{ group.label }}</h2>
      <ul class="search-list">
        <li v-for="item in group.results" :key="item.id">
          <component
            :is="item.to ? 'RouterLink' : 'div'"
            v-bind="item.to ? { to: item.to } : {}"
            class="search-item"
            :class="{ 'search-item-flat': !item.to }"
          >
            <i :class="item.icon" class="search-item-icon" aria-hidden="true" />
            <span class="search-item-text">
              <span class="search-item-title">{{ item.title }}</span>
              <span class="search-item-sub">{{ item.subtitle }}</span>
            </span>
            <span v-if="item.badge" class="search-item-badge">{{ item.badge }}</span>
          </component>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.search-box {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  padding: 0.625rem 0.875rem;
  margin-bottom: 0.75rem;
}
.search-box:focus-within {
  border-color: var(--app-primary);
  box-shadow: 0 0 0 3px var(--app-focus-ring);
}
.search-box-icon { color: var(--app-text-muted); }
.search-box-input {
  flex: 1;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--app-text);
  font-family: inherit;
  font-size: 1rem;
}
.search-box-input::placeholder { color: var(--app-text-subtle); }
.search-note { margin: 0 0 1rem; color: var(--app-text-muted); font-size: 0.875rem; }
.search-error { color: var(--p-red-500, #ef4444); }
.search-group h2 { margin-bottom: 0.5rem; }
.search-list { list-style: none; margin: 0; padding: 0; }
.search-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.5rem;
  border-radius: var(--app-radius-sm);
  color: var(--app-text);
  text-decoration: none;
}
.search-item:hover { background: var(--app-hover); }
.search-item-flat { cursor: default; }
.search-item-flat:hover { background: transparent; }
.search-item-icon { color: var(--app-text-muted); width: 1rem; text-align: center; }
.search-item-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.search-item-title { font-weight: 500; }
.search-item-sub {
  font-size: 0.8125rem;
  color: var(--app-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
}
.search-item-badge {
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
</style>
