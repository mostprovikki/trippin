<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useTripsStore } from '../stores/trips.js'
import { useNotify } from '../composables/useNotify.js'
import EmptyState from '../components/EmptyState.vue'

const store = useTripsStore()
const router = useRouter()
const notify = useNotify()
const loading = ref(true)

const STATUS_ORDER = ['idea', 'planning', 'confirmed', 'active', 'archived']

const grouped = computed(() => {
  const groups = {}
  for (const trip of store.trips) {
    if (!groups[trip.status]) groups[trip.status] = []
    groups[trip.status].push(trip)
  }
  return STATUS_ORDER.filter((s) => groups[s]?.length).map((s) => ({ status: s, trips: groups[s] }))
})

onMounted(async () => {
  try { await store.fetchTrips() } catch (e) { notify.error(e.message) } finally { loading.value = false }
})
</script>

<template>
  <main class="page">
    <h1>Trips</h1>
    <Button label="New trip" icon="pi pi-plus" @click="router.push('/trips/new')" />

    <div v-if="loading" class="card" style="margin-top: 1rem">
      <Skeleton v-for="i in 3" :key="i" height="2rem" style="margin-bottom: 0.5rem" />
    </div>

    <EmptyState v-else-if="!store.trips.length" icon="pi pi-map" message="No trips yet — plan your first one." cta-label="New trip" @cta="router.push('/trips/new')" />

    <section v-for="group in grouped" :key="group.status" class="trips-group">
      <h2><Tag :value="group.status" severity="secondary" /></h2>
      <RouterLink v-for="trip in group.trips" :key="trip.id" :to="{ name: 'trip-overview', params: { id: trip.id } }" class="card trip-card">
        <h3>{{ trip.name }}</h3>
        <p v-if="trip.destination">{{ trip.destination }}</p>
        <p v-if="trip.start_date || trip.end_date">{{ trip.start_date }} – {{ trip.end_date }}</p>
        <p>{{ trip.participant_count }} participant(s)</p>
      </RouterLink>
    </section>
  </main>
</template>

<style scoped>
.trips-group { margin-top: 1.5rem; }
.trip-card {
  display: block;
  text-decoration: none;
  color: inherit;
}
</style>
