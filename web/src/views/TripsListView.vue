<script setup>
import { computed, onMounted } from 'vue'
import { useTripsStore } from '../stores/trips.js'

const store = useTripsStore()

const STATUS_ORDER = ['idea', 'planning', 'confirmed', 'active', 'archived']

const grouped = computed(() => {
  const groups = {}
  for (const trip of store.trips) {
    if (!groups[trip.status]) groups[trip.status] = []
    groups[trip.status].push(trip)
  }
  return STATUS_ORDER.filter((s) => groups[s]?.length).map((s) => ({ status: s, trips: groups[s] }))
})

onMounted(() => { store.fetchTrips() })
</script>

<template>
  <main class="page">
    <h1>Trips</h1>
    <RouterLink to="/trips/new" class="btn btn-primary">New trip</RouterLink>

    <div v-if="store.error" class="card trips-error">{{ store.error }}</div>

    <section v-for="group in grouped" :key="group.status" class="trips-group">
      <h2>{{ group.status }}</h2>
      <RouterLink v-for="trip in group.trips" :key="trip.id" :to="{ name: 'trip', params: { id: trip.id } }" class="card trip-card">
        <h3>{{ trip.name }}</h3>
        <p v-if="trip.destination">{{ trip.destination }}</p>
        <p v-if="trip.start_date || trip.end_date">{{ trip.start_date }} – {{ trip.end_date }}</p>
        <p>{{ trip.participant_count }} participant(s)</p>
      </RouterLink>
    </section>

    <p v-if="!store.trips.length">No trips yet.</p>
  </main>
</template>

<style scoped>
.trips-group { margin-top: 1.5rem; }
.trip-card {
  display: block;
  text-decoration: none;
  color: inherit;
}
.trips-error { border-color: #fca5a5; color: #7f1d1d; }
</style>
