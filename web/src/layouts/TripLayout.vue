<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import Tag from 'primevue/tag'
import Skeleton from 'primevue/skeleton'
import { useTripsStore } from '../stores/trips.js'
import { useReadinessStore } from '../stores/readiness.js'
import { TRIP_TABS, TRIP_DETAILS, sectionHints } from '../utils/tripNav.js'

const route = useRoute()
const trips = useTripsStore()
const readiness = useReadinessStore()

const loading = ref(true)
const notFound = ref(false)
const tripId = computed(() => route.params.id)

// An archived trip is finished: no People/Checklists counts to chase (ux-review M2).
const hints = computed(() => {
  const h = sectionHints(readiness.data)
  if (trips.current?.status === 'archived') { delete h['trip-people']; delete h['trip-checklists'] }
  return h
})

// Details ▾ (Dates, Destination, Settings). When one of those pages is open the
// toggle carries its name and the active state, so the bar always says where you are.
const activeDetail = computed(() => TRIP_DETAILS.find((s) => s.name === route.name) || null)
const detailsNeedAttention = computed(() => TRIP_DETAILS.some((s) => hints.value[s.name]?.ok === false))
const detailsOpen = ref(false)
const tabbar = ref(null)
const detailsToggle = ref(null)
const menuLeft = ref(0)

// The menu sits outside the scrolling tab strip (an overflow-x container would
// clip it), so it is placed under the toggle by measurement, kept inside the bar,
// and re-placed if the strip scrolls while it is open.
function placeMenu() {
  const bar = tabbar.value?.getBoundingClientRect()
  const btn = detailsToggle.value?.getBoundingClientRect()
  if (bar && btn) menuLeft.value = Math.max(0, Math.min(btn.left - bar.left, bar.width - 192))
}
function openDetails() {
  detailsToggle.value?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  placeMenu()
  detailsOpen.value = true
}
function closeDetails({ focus = false } = {}) {
  detailsOpen.value = false
  if (focus) detailsToggle.value?.focus()
}
function toggleDetails() { detailsOpen.value ? closeDetails() : openDetails() }
function onDocPointer(e) {
  if (detailsOpen.value && tabbar.value && !tabbar.value.contains(e.target)) closeDetails()
}
onMounted(() => document.addEventListener('pointerdown', onDocPointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer))
// Opening Details can scroll the strip; after any navigation put it back so the
// five tabs are all in view again (docs/design/tripper.md §4).
const tabStrip = ref(null)
watch(() => route.fullPath, () => {
  closeDetails()
  if (tabStrip.value) tabStrip.value.scrollLeft = 0
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
    <header class="trip-head">
      <template v-if="trips.current">
        <span class="trip-head-name">{{ trips.current.name }}</span>
        <div class="trip-head-status">
          <Tag class="status-tag" :value="trips.current.status" :severity="trips.current.status === 'archived' ? 'secondary' : 'info'" title="Trip status" :aria-label="`Trip status: ${trips.current.status}`" />
          <!-- chip only: the next-status action lives in Details ▾ Settings (tripper.md §5, D9) -->
        </div>
      </template>
      <Skeleton v-else height="2rem" />
    </header>
    <p v-if="trips.current?.status === 'archived'" class="trip-readonly-note" data-test="trip-readonly-note">
      Archived — read-only. Unarchive from Settings.
    </p>

    <div ref="tabbar" class="trip-tabbar" @keydown.esc="closeDetails({ focus: true })">
      <nav ref="tabStrip" class="trip-tabs" aria-label="Trip sections" @scroll="detailsOpen && placeMenu()">
        <RouterLink
          v-for="s in TRIP_TABS"
          :key="s.name"
          :to="{ name: s.name, params: { id: tripId } }"
          class="trip-nav-item"
          :class="{ 'trip-nav-active': route.name === s.name }"
        >
          <i :class="s.icon" aria-hidden="true" />
          <span class="trip-nav-label">{{ s.label }}</span>
          <span
            v-if="hints[s.name]?.count"
            class="trip-nav-badge"
            :title="hints[s.name].label"
            :aria-label="hints[s.name].label"
          >{{ hints[s.name].count }}</span>
        </RouterLink>
        <button
          ref="detailsToggle"
          type="button"
          class="trip-details-toggle"
          :class="{ 'trip-nav-active': activeDetail }"
          aria-haspopup="true"
          aria-controls="trip-details-menu"
          :aria-expanded="String(detailsOpen)"
          @click="toggleDetails"
        >
          <span class="trip-nav-label">{{ activeDetail ? activeDetail.label : 'Details' }}</span>
          <i v-if="detailsNeedAttention" class="pi pi-circle-fill trip-nav-dot" aria-label="needs attention" />
          <i class="pi pi-chevron-down trip-details-chevron" aria-hidden="true" />
        </button>
      </nav>

      <div
        v-if="detailsOpen"
        id="trip-details-menu"
        class="trip-details-menu"
        :style="{ left: `${menuLeft}px` }"
      >
        <RouterLink
          v-for="s in TRIP_DETAILS"
          :key="s.name"
          :to="{ name: s.name, params: { id: tripId } }"
          class="trip-details-item"
          :class="{ 'trip-details-current': route.name === s.name }"
          :aria-current="route.name === s.name ? 'page' : undefined"
        >
          <i :class="s.icon" aria-hidden="true" />
          <span class="trip-nav-label">{{ s.label }}</span>
          <i v-if="hints[s.name]?.ok === false" class="pi pi-circle-fill trip-nav-dot" aria-label="needs attention" />
          <i v-else-if="hints[s.name]?.ok === true" class="pi pi-check trip-nav-ok" aria-label="done" />
        </RouterLink>
      </div>
    </div>

    <div class="trip-main">
      <div v-if="loading && !trips.current" class="card">
        <Skeleton v-for="i in 4" :key="i" class="skeleton-row" />
      </div>
      <RouterView v-else />
    </div>
  </div>
</template>

<style scoped>
/* One tab bar on every width (owner decision 2026-09-26: no sidebar). On a
   390px phone the five tabs must be fully visible without scrolling; only
   Details ▾ may overflow (docs/design/tripper.md §4). */
.trip-shell {
  max-width: 80rem;
  margin: 0 auto;
  padding: 1.25rem 1.25rem 3rem;
}

.trip-head { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.trip-head-name { font-weight: 650; font-size: 1rem; letter-spacing: -0.01em; overflow-wrap: anywhere; }
.trip-readonly-note { margin: 0 0 0.5rem; font-size: 0.875rem; color: var(--app-text-muted); }
.trip-head-status { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }

.trip-tabbar {
  position: sticky;
  top: 3.25rem;
  z-index: 10;
  background: var(--app-bg);
  border-bottom: 1px solid var(--app-border);
  margin-bottom: 1.25rem;
}
.trip-tabs {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
}
.trip-tabs::-webkit-scrollbar { display: none; }

.trip-nav-item,
.trip-details-toggle {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.375rem;
  /* 44px: this bar is the primary section navigation and is tapped on phones. */
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--app-text);
  font: inherit;
  font-weight: 500;
  font-size: 0.875rem;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s ease;
}
.trip-nav-item i:first-child { color: var(--app-text-muted); font-size: 0.875rem; }
.trip-nav-item:hover,
.trip-details-toggle:hover { background: var(--app-hover); }
.trip-nav-active { color: var(--app-primary); border-bottom-color: var(--app-primary); }
.trip-nav-active i:first-child { color: var(--app-primary); }
.trip-details-chevron { font-size: 0.6875rem; color: var(--app-text-muted); }

.trip-details-menu {
  position: absolute;
  top: 100%;
  width: 12rem;
  margin-top: 0.25rem;
  padding: 0.25rem;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.12);
  display: flex;
  flex-direction: column;
}
.trip-details-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 2.75rem;
  padding: 0 0.625rem;
  border-radius: var(--app-radius-sm);
  color: var(--app-text);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.875rem;
}
.trip-details-item i:first-child { color: var(--app-text-muted); width: 1rem; text-align: center; }
.trip-details-item:hover { background: var(--app-hover); }
.trip-details-current { background: var(--app-primary-soft); color: var(--app-primary); }
.trip-details-item .trip-nav-label { flex: 1; }

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
.trip-nav-dot { font-size: 0.4375rem; color: var(--app-accent); }
.trip-nav-ok { font-size: 0.75rem; color: var(--app-primary); }

.trip-main { min-width: 0; }

.not-found { text-align: center; padding: 3rem 1.5rem; }
.not-found i { font-size: 2rem; color: var(--app-text-muted); }

/* Phone: icons go and padding tightens so all five tabs fit 390px (§4). Since
   2026-10-01 both People and Checklists carry a badge (tripper.md §6), so the
   budget is two two-digit badges: measured People right edge 376px with "8"
   and "4", guarded by e2e/qa-overview.mjs at two digits each. */
@media (max-width: 767px) {
  .trip-shell { padding: 1rem 1rem 3rem; }
  .trip-tabbar { margin: 0 -1rem 1rem; padding: 0 0.25rem; }
  .trip-nav-item i:first-child { display: none; }
  .trip-nav-item, .trip-details-toggle { padding: 0 0.3125rem; gap: 0.25rem; }
  .trip-nav-badge { padding: 0 0.25rem; }
}
</style>
