<script setup>
import { computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Tag from 'primevue/tag'
import { useTripsStore } from '../../stores/trips.js'
import { useReadinessStore } from '../../stores/readiness.js'
import { useBudgetStore } from '../../stores/budget.js'
import { nextActions, readinessPercent } from '../../utils/tripNav.js'

const STATUSES = ['idea', 'planning', 'confirmed', 'active']

const route = useRoute()
const trips = useTripsStore()
const readiness = useReadinessStore()
const budget = useBudgetStore()

const tripId = computed(() => route.params.id)
const trip = computed(() => trips.current)
const actions = computed(() => nextActions(readiness.data))
const percent = computed(() => readinessPercent(readiness.data))
const checklists = computed(() => readiness.data?.checklists)
const participants = computed(() => readiness.data?.participants || [])
const confirmedCount = computed(() => participants.value.filter((p) => p.profile_confirmed).length)
const dateRange = computed(() =>
  trip.value?.start_date && trip.value?.end_date ? `${trip.value.start_date} – ${trip.value.end_date}` : null
)
const statusIndex = computed(() => STATUSES.indexOf(trip.value?.status))

async function load() {
  // both stores are shared across trips, so without clearing them the stat cards
  // quote the previous trip's total and readiness under the new trip's name.
  budget.$reset()
  if (readiness.lastTripId !== tripId.value) readiness.data = null
  try { await budget.fetchBudget(tripId.value) } catch { /* stat shows — */ }
  if (readiness.lastTripId !== tripId.value) {
    try { await readiness.fetch(tripId.value) } catch { /* layout badge already reported */ }
  }
}

onMounted(load)
// TripLayout is reused when only :id changes, so this view is never remounted
// between trips and has to refetch for the new :id itself.
watch(tripId, load)
</script>

<template>
  <div v-if="trip">
    <section class="card hero">
      <div class="hero-main">
        <h1>{{ trip.name }}</h1>
        <p class="hero-sub">
          <i class="pi pi-map-marker" /> {{ trip.destination || 'Destination TBD' }}
          <span class="hero-sep" aria-hidden="true">·</span>
          <i class="pi pi-calendar" /> {{ dateRange || 'Dates TBD' }}
        </p>
        <div v-if="(trip.vibe_tags || []).length" class="hero-tags">
          <Tag v-for="tag in trip.vibe_tags" :key="tag" :value="tag" severity="secondary" />
        </div>
      </div>
      <ol v-if="trip.status !== 'archived'" class="status-stepper" aria-label="Trip status">
        <li
          v-for="(s, i) in STATUSES"
          :key="s"
          class="status-step"
          :class="{ 'status-step-done': i < statusIndex, 'status-step-current': i === statusIndex }"
        >{{ s }}</li>
      </ol>
      <Tag v-else value="archived" severity="secondary" />
    </section>

    <div class="stat-grid">
      <RouterLink class="card stat-card" :to="{ name: 'trip-budget', params: { id: trip.id } }">
        <span class="stat-label">Budget</span>
        <span class="stat-value">{{ budget.total || '—' }}</span>
      </RouterLink>
      <RouterLink class="card stat-card" :to="{ name: 'trip-readiness', params: { id: trip.id } }">
        <span class="stat-label">Readiness</span>
        <span class="stat-value">{{ percent }}%</span>
      </RouterLink>
      <RouterLink class="card stat-card" :to="{ name: 'trip-checklists', params: { id: trip.id } }">
        <span class="stat-label">Checklist</span>
        <span class="stat-value">{{ checklists ? `${checklists.done_items}/${checklists.total_items}` : '—' }}</span>
      </RouterLink>
      <RouterLink class="card stat-card" :to="{ name: 'trip-people', params: { id: trip.id } }">
        <span class="stat-label">Profiles confirmed</span>
        <span class="stat-value">{{ participants.length ? `${confirmedCount}/${participants.length}` : '—' }}</span>
      </RouterLink>
    </div>

    <section class="card">
      <h2>Next actions</h2>
      <p v-if="!actions.length" class="all-set"><i class="pi pi-check-circle" /> All set — nothing pending. 🎉</p>
      <ul v-else class="actions-list">
        <li v-for="a in actions" :key="a.to + a.label">
          <RouterLink :to="{ name: a.to, params: { id: trip.id } }" class="action-link">
            <i class="pi pi-arrow-right" /> {{ a.label }}
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.hero { display: flex; justify-content: space-between; gap: 1.5rem; align-items: flex-start; flex-wrap: wrap; }
.hero h1 { margin-bottom: 0.375rem; }
.hero-sub { margin: 0; color: var(--app-text-muted); display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; }
/* --app-border is a BORDER colour; as text it renders at ~1.1:1 on white and
   1.7:1 on the dark surface, i.e. all but invisible. Separators are decorative
   but they still have to be seen. */
.hero-sep { color: var(--app-text-subtle); }
.hero-tags { display: flex; gap: 0.375rem; flex-wrap: wrap; margin-top: 0.625rem; }

.status-stepper { list-style: none; display: flex; gap: 0.25rem; padding: 0; margin: 0; }
.status-step {
  font-size: 0.75rem; font-weight: 600; text-transform: capitalize;
  padding: 0.25rem 0.75rem; border-radius: 999px;
  background: var(--app-surface-alt); color: var(--app-text-muted);
}
.status-step-done { background: var(--app-primary-soft); color: var(--app-primary); }
.status-step-current { background: var(--app-primary); color: var(--app-primary-contrast); }

.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 1rem; margin-bottom: 1rem; }
.stat-card { display: flex; flex-direction: column; gap: 0.25rem; text-decoration: none; color: inherit; margin-bottom: 0; transition: box-shadow 0.15s ease, transform 0.15s ease; }
.stat-card:hover { box-shadow: var(--app-shadow-md); transform: translateY(-1px); }
.stat-label { font-size: 0.8125rem; font-weight: 600; color: var(--app-text-muted); }
.stat-value { font-size: 1.375rem; font-weight: 650; letter-spacing: -0.01em; }

.actions-list { list-style: none; padding: 0; margin: 0; }
.actions-list li { padding: 0.25rem 0; }
.action-link { display: inline-flex; align-items: center; gap: 0.5rem; text-decoration: none; font-weight: 500; }
.action-link:hover { text-decoration: underline; }
.all-set { color: var(--app-primary); font-weight: 500; display: flex; align-items: center; gap: 0.5rem; margin: 0; }
</style>
