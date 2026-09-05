<script setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useItineraryStore } from '../../stores/itinerary.js'
import { useTripsStore } from '../../stores/trips.js'
import { formatLongDate } from '../../utils/dates.js'

const route = useRoute()
const tripId = computed(() => route.params.id)
const itinerary = useItineraryStore()
const trips = useTripsStore()

onMounted(async () => {
  await Promise.all([trips.fetchTrip(tripId.value), itinerary.fetchItinerary(tripId.value)])
})

function print() { window.print() }
</script>

<template>
  <div class="print-page">
    <div class="print-toolbar no-print">
      <button type="button" @click="print">Print</button>
    </div>
    <header class="print-header">
      <h1>{{ trips.current?.name }}</h1>
      <p v-if="trips.current?.start_date">{{ trips.current.start_date }} – {{ trips.current.end_date }}</p>
    </header>
    <section v-for="day in itinerary.days" :key="day.id" class="print-day">
      <h2>{{ formatLongDate(day.day_date) }}</h2>
      <table>
        <thead><tr><th>Time</th><th>Title</th><th>Location</th><th>Notes</th></tr></thead>
        <tbody>
          <tr v-for="item in day.items" :key="item.id">
            <td>{{ item.time_range || '—' }}</td>
            <td>{{ item.title }}</td>
            <td>{{ item.location || '' }}</td>
            <td>{{ item.notes || '' }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
/* Print always renders light, regardless of the app's dark-mode setting —
   this page's only audience is a printer or a PDF, and dark ink-heavy pages
   waste toner and read badly on paper. */
.print-page { background: #fff; color: #111; padding: 1.5rem; font-family: system-ui, sans-serif; }
.print-header { margin-bottom: 1.5rem; }
.print-day { margin-bottom: 1.5rem; page-break-inside: avoid; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 0.375rem 0.5rem; border-bottom: 1px solid #ddd; font-size: 0.875rem; }
@media print {
  .no-print { display: none; }
  .print-page { padding: 0; }
}
</style>
