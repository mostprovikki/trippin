<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import { useTripsStore } from '../stores/trips.js'
import { useReadinessStore } from '../stores/readiness.js'
import { useNotify } from '../composables/useNotify.js'
import { TRIP_SECTIONS, sectionHints } from '../utils/tripNav.js'

const route = useRoute()
const trips = useTripsStore()
const readiness = useReadinessStore()
const notify = useNotify()

const loading = ref(true)
const notFound = ref(false)
const tripId = computed(() => route.params.id)

const NEXT_STATUS = {
  idea: { label: 'Start planning', target: 'planning' },
  planning: { label: 'Confirm trip', target: 'confirmed' },
  confirmed: { label: 'Activate', target: 'active' }
}
const nextTransition = computed(() => (trips.current ? NEXT_STATUS[trips.current.status] : null))
const hints = computed(() => sectionHints(readiness.data))

// Consecutive sections sharing a group label render under one group heading.
const groups = computed(() => {
  const out = []
  for (const s of TRIP_SECTIONS) {
    const label = s.group || ''
    const last = out[out.length - 1]
    if (!last || last.label !== label) out.push({ label, items: [s] })
    else last.items.push(s)
  }
  return out
})

async function refreshReadiness() {
  try { await readiness.fetch(tripId.value) } catch { /* hint badges are non-critical */ }
}

async function load() {
  loading.value = true
  notFound.value = false
  try {
    await trips.fetchTrip(tripId.value)
    await refreshReadiness()
  } catch {
    notFound.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(tripId, load)
// Cheap refresh when moving between sections so badges reflect recent edits.
watch(() => route.name, () => { if (!loading.value && !notFound.value) refreshReadiness() })

async function advanceStatus() {
  if (!nextTransition.value) return
  try {
    await trips.setStatus(tripId.value, nextTransition.value.target)
    refreshReadiness()
  } catch (e) { notify.error(e.message) }
}
</script>

<template>
  <div v-if="notFound" class="page">
    <div class="card not-found">
      <i class="pi pi-compass" aria-hidden="true" />
      <h1>Trip not found</h1>
      <p>It may have been deleted, or the link is wrong.</p>
      <RouterLink to="/">Back to trips</RouterLink>
    </div>
  </div>

  <div v-else class="trip-shell">
    <aside class="trip-sidebar">
      <div class="trip-sidebar-head">
        <template v-if="trips.current">
          <span class="trip-sidebar-name">{{ trips.current.name }}</span>
          <div class="trip-sidebar-status">
            <Tag class="status-tag" :value="trips.current.status" :severity="trips.current.status === 'archived' ? 'secondary' : 'info'" />
            <Button v-if="nextTransition" :label="nextTransition.label" size="small" outlined @click="advanceStatus" />
          </div>
        </template>
        <Skeleton v-else height="3.5rem" />
      </div>

      <nav class="trip-sidebar-nav" aria-label="Trip sections">
        <template v-for="group in groups" :key="group.label + group.items[0].name">
          <span v-if="group.label" class="trip-nav-group">{{ group.label }}</span>
          <RouterLink
            v-for="s in group.items"
            :key="s.name"
            :to="{ name: s.name, params: { id: tripId } }"
            class="trip-nav-item"
            :class="{ 'trip-nav-active': route.name === s.name }"
          >
            <i :class="s.icon" aria-hidden="true" />
            <span class="trip-nav-label">{{ s.label }}</span>
            <template v-if="hints[s.name]">
              <span v-if="hints[s.name].count" class="trip-nav-badge">{{ hints[s.name].count }}</span>
              <span v-else-if="hints[s.name].text" class="trip-nav-hint">{{ hints[s.name].text }}</span>
              <i v-else-if="hints[s.name].ok === false" class="pi pi-circle-fill trip-nav-dot" aria-label="needs attention" />
              <i v-else-if="hints[s.name].ok === true" class="pi pi-check trip-nav-ok" aria-label="done" />
            </template>
          </RouterLink>
        </template>
      </nav>
    </aside>

    <div class="trip-main">
      <div v-if="loading && !trips.current" class="card">
        <Skeleton v-for="i in 4" :key="i" class="skeleton-row" />
      </div>
      <RouterView v-else />
    </div>
  </div>
</template>

<style scoped>
.trip-shell {
  display: grid;
  grid-template-columns: 15rem 1fr;
  gap: 1.5rem;
  max-width: 80rem;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
  align-items: start;
}

.trip-sidebar {
  position: sticky;
  top: 4.5rem;
}
.trip-sidebar-head { margin-bottom: 1rem; }
/* 1rem, not the 1.0625rem this used to carry: 17px was a step that existed
   nowhere else in the app. The 650 weight is what makes it read as the sidebar's
   title, not the extra pixel. */
.trip-sidebar-name { display: block; font-weight: 650; font-size: 1rem; letter-spacing: -0.01em; margin-bottom: 0.375rem; overflow-wrap: anywhere; }
.trip-sidebar-status { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }

.trip-sidebar-nav { display: flex; flex-direction: column; gap: 0.125rem; }
.trip-nav-group {
  margin: 0.875rem 0 0.25rem;
  padding: 0 0.625rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}
.trip-nav-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.4375rem 0.625rem;
  border-radius: var(--app-radius-sm);
  color: var(--app-text);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.875rem;
  transition: background 0.15s ease;
}
.trip-nav-item i:first-child { color: var(--app-text-muted); font-size: 0.875rem; width: 1rem; text-align: center; }
.trip-nav-item:hover { background: var(--app-hover); }
.trip-nav-active { background: var(--app-primary-soft); color: var(--app-primary); }
.trip-nav-active i:first-child { color: var(--app-primary); }
.trip-nav-label { flex: 1; }
.trip-nav-badge {
  /* -strong, not -accent: this is 11px text on the accent, so it needs the
     darkened amber to clear AA (3.19:1 → 5.02:1). */
  background: var(--app-accent-strong);
  color: var(--app-accent-contrast);
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 700;
  min-width: 1.125rem;
  height: 1.125rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.3125rem;
}
.trip-nav-hint { font-size: 0.75rem; font-weight: 600; color: var(--app-text-muted); }
.trip-nav-dot { font-size: 0.4375rem; color: var(--app-accent); }
.trip-nav-ok { font-size: 0.75rem; color: var(--app-primary); }

.trip-main { min-width: 0; }

.not-found { text-align: center; padding: 3rem 1.5rem; }
.not-found i { font-size: 2rem; color: var(--app-text-muted); }

/* Mobile: sidebar becomes a sticky horizontal section rail. */
@media (max-width: 767px) {
  .trip-shell { display: block; padding: 1rem 1rem 3rem; }
  .trip-sidebar { position: sticky; top: 3.25rem; z-index: 10; background: var(--app-bg); margin: 0 -1rem 1rem; padding: 0.5rem 1rem; border-bottom: 1px solid var(--app-border); }
  .trip-sidebar-head { margin-bottom: 0.5rem; }
  .trip-sidebar-nav {
    flex-direction: row;
    overflow-x: auto;
    gap: 0.25rem;
    scrollbar-width: none;
    /* Right-edge fade hints at horizontal scrollability */
    -webkit-mask-image: linear-gradient(to right, black 92%, transparent);
    mask-image: linear-gradient(to right, black 92%, transparent);
  }
  .trip-sidebar-nav::-webkit-scrollbar { display: none; }
  .trip-nav-group { display: none; }
  /* On desktop these are sidebar rows a mouse points at, and ~35px is fine.
     Here the same rule IS the primary section navigation and is only ever
     tapped, so it has to clear the 44px touch minimum the app already holds
     itself to (see ParticipantDocs.vue). 2.75rem is 44px at the default root
     size; the base rule's align-items: center keeps the label centred in the
     extra height. */
  .trip-nav-item {
    white-space: nowrap;
    flex: 0 0 auto;
    min-height: 2.75rem;
  }
}
</style>
