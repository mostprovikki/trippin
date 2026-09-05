<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useItineraryStore } from '../../stores/itinerary.js'
import { useTripsStore } from '../../stores/trips.js'
import { formatDayDate, formatLongDate } from '../../utils/dates.js'
import { formatMoney } from '../../utils/format.js'
import { categoryIcon } from '../../utils/itinerary.js'

const route = useRoute()
const tripId = computed(() => route.params.id)
const itinerary = useItineraryStore()
const trips = useTripsStore()

const loading = ref(true)

onMounted(async () => {
  // Both actions already record their failure on their own store (trips.error /
  // itinerary.error, read below) and then rethrow — Promise.all with no catch
  // here would turn that rethrow into an unhandled rejection on top of a blank
  // sheet. Swallow it: the template renders whichever store's `.error` is set.
  try {
    await Promise.all([trips.fetchTrip(tripId.value), itinerary.fetchItinerary(tripId.value)])
  } catch {
    // handled via trips.error / itinerary.error in the template
  } finally {
    loading.value = false
  }
})

function print() { window.print() }
</script>

<template>
  <div class="print-page">
    <div class="print-toolbar no-print">
      <router-link class="back-link no-print p-button p-button-outlined p-component" :to="{ name: 'trip-itinerary', params: { id: tripId } }">← Back to itinerary</router-link>
      <button type="button" class="print-trigger" @click="print">Print</button>
    </div>

    <div v-if="trips.error || itinerary.error" class="card no-print state-banner state-error">
      <strong>Error:</strong> {{ trips.error || itinerary.error }}
    </div>

    <div v-else-if="loading" class="card no-print state-banner">Loading…</div>

    <template v-else>
      <header class="print-header">
        <h1>{{ trips.current?.name }}</h1>
        <p v-if="trips.current?.start_date">{{ formatDayDate(trips.current.start_date) }} – {{ formatDayDate(trips.current.end_date) }}</p>
      </header>

      <p v-if="!itinerary.days.length" class="state-banner no-print">No itinerary days yet.</p>

      <section v-for="day in itinerary.days" :key="day.id" class="print-day">
        <h2>{{ formatLongDate(day.day_date) }}</h2>
        <table>
          <thead><tr><th>Time</th><th>Title</th><th>Location</th><th>Notes</th><th>Cost</th></tr></thead>
          <tbody>
            <tr v-for="item in day.items" :key="item.id">
              <td>{{ item.time_range || '—' }}</td>
              <td>{{ categoryIcon(item.category) }} {{ item.title }}</td>
              <td>{{ item.location || '' }}</td>
              <td>{{ item.notes || '' }}</td>
              <td><span v-if="item.est_cost != null">{{ formatMoney(item.est_cost, trips.current?.currency) }}</span></td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* Print always renders light, regardless of the app's dark-mode setting —
   this page's only audience is a printer or a PDF, and dark ink-heavy pages
   waste toner and read badly on paper. min-height keeps the light card
   filling the whole screen-preview viewport too, so a short itinerary
   doesn't leave the app's dark --app-bg showing as a frame below it. */
.print-page { color-scheme: light; background: #fff; color: #111; padding: 1.5rem; font-family: system-ui, sans-serif; min-height: 100vh; }
.print-header { margin-bottom: 1.5rem; }
.print-day { margin-bottom: 1.5rem; page-break-inside: avoid; break-inside: avoid; }
.state-banner { color: #111; }
.state-error { color: #b91c1c; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 0.375rem 0.5rem; border-bottom: 1px solid #ddd; font-size: 0.875rem; }
.print-toolbar { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
/* Screen-preview only (.no-print) — this page is otherwise print output, so it
   never inherits the app's dark-mode tokens. Without literal colors here the
   PrimeVue-styled back-link and the raw <button> both pick up whatever the
   surrounding (possibly dark) theme supplies — measured #2dd4bf-on-#fff at
   1.86:1 in dark mode. Pin both controls to the same light literals as the
   rest of this file (#111 text, #ddd borders, white bg). */
.back-link.no-print,
.print-trigger {
  color: #111;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-family: inherit;
  cursor: pointer;
}
.back-link.no-print:hover,
.print-trigger:hover {
  background: #f5f5f5;
}
@media print {
  .no-print { display: none; }
  .print-page { padding: 0; }
}
</style>

<style>
/* Unscoped on purpose: scoped styles can't reach <html>/<body>, and this
   component's only job when printing is to make sure the OUTER page (not
   just its own .print-page div) is a plain white sheet. Without this, a
   browser printing with "Background graphics" on carries the app's dark-mode
   --app-bg (near-black) onto the printed page as a border/full canvas around
   the light content. */
@media print {
  :root, body { background: #fff; color: #111; }
}
</style>
