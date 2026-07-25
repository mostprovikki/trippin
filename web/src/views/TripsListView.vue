<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useTripsStore } from '../stores/trips.js'
import { useNotify } from '../composables/useNotify.js'
import EmptyState from '../components/EmptyState.vue'

const store = useTripsStore()
const router = useRouter()
const notify = useNotify()
const loading = ref(true)
const loadError = ref(null)

const STATUS_ORDER = ['idea', 'planning', 'confirmed', 'active', 'archived']

const grouped = computed(() => {
  const groups = {}
  for (const trip of store.trips) {
    if (!groups[trip.status]) groups[trip.status] = []
    groups[trip.status].push(trip)
  }
  return STATUS_ORDER.filter((s) => groups[s]?.length).map((s) => ({ status: s, trips: groups[s] }))
})

async function load() {
  loading.value = true
  loadError.value = null
  try {
    await store.fetchTrips()
  } catch (e) {
    // Kept on the page as well as in a toast. Once the toast faded, a failed
    // fetch left an empty store behind the friendly "No trips yet" empty state —
    // a 500 read as "you have no trips" and invited the user to create one.
    loadError.value = e.message
    notify.error(e.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <main class="page page-wide">
    <div class="list-head">
      <h1>Trips</h1>
      <Button label="New trip" icon="pi pi-plus" @click="router.push('/trips/new')" />
    </div>

    <div v-if="loading" class="card">
      <Skeleton v-for="i in 3" :key="i" class="skeleton-row" />
    </div>

    <div v-else-if="loadError" class="trips-error">
      <Message severity="error" :closable="false">{{ loadError }}</Message>
      <Button label="Try again" icon="pi pi-refresh" outlined @click="load" />
    </div>

    <EmptyState v-else-if="!store.trips.length" icon="pi pi-map" message="No trips yet — plan your first one." cta-label="New trip" @cta="router.push('/trips/new')" />

    <section v-for="group in grouped" :key="group.status" class="trips-group">
      <h2 class="group-title">{{ group.status }}</h2>
      <div class="trip-grid">
        <RouterLink
          v-for="trip in group.trips"
          :key="trip.id"
          :to="{ name: 'trip-overview', params: { id: trip.id } }"
          class="card trip-card"
          :class="`trip-card-${trip.status}`"
        >
          <h3>{{ trip.name }}</h3>
          <p class="trip-meta"><i class="pi pi-map-marker" /> {{ trip.destination || 'Destination TBD' }}</p>
          <p class="trip-meta"><i class="pi pi-calendar" /> {{ trip.start_date && trip.end_date ? `${trip.start_date} – ${trip.end_date}` : 'Dates TBD' }}</p>
          <p class="trip-meta"><i class="pi pi-users" /> {{ trip.participant_count }} participant{{ trip.participant_count === 1 ? '' : 's' }}</p>
        </RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.page-wide { max-width: 80rem; }
.trips-error { margin-top: 0.5rem; }
.trips-error :deep(.p-message) { margin-bottom: 0.75rem; }
.trips-group { margin-top: 1.5rem; }
.group-title { color: var(--app-text-muted); font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
.trip-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(17.5rem, 1fr)); gap: 1rem; }
.trip-card {
  display: block;
  text-decoration: none;
  color: inherit;
  margin-bottom: 0;
  border-left: 3px solid var(--app-border);
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}
.trip-card:hover { box-shadow: var(--app-shadow-md); transform: translateY(-1px); }
.trip-card h3 { margin-bottom: 0.5rem; }
.trip-card-idea { border-left-color: var(--app-text-muted); }
.trip-card-planning { border-left-color: var(--app-accent); }
.trip-card-confirmed { border-left-color: var(--app-primary); }
.trip-card-active { border-left-color: var(--app-success); }
.trip-card-archived { border-left-color: var(--app-border); opacity: 0.75; }
.trip-meta { margin: 0.125rem 0; color: var(--app-text-muted); font-size: 0.8438rem; display: flex; align-items: center; gap: 0.375rem; }
</style>
