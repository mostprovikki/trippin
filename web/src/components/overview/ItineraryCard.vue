<script setup>
// tripper.md §2 Itinerary card: `N of M days planned`, only the empty days
// listed; links into the Workbench, carries none of its controls.
import { computed } from 'vue'
import { emptyDays } from '../../utils/overview.js'
import { formatDayDate } from '../../utils/dates.js'

const props = defineProps({ trip: { type: Object, required: true }, days: { type: Array, default: () => [] } })
const CAP = 5
const view = computed(() => emptyDays(props.trip, props.days))
const shown = computed(() => view.value.empty.slice(0, CAP))
const more = computed(() => Math.max(0, view.value.empty.length - CAP))
</script>

<template>
  <section class="card overview-card itinerary-card" aria-labelledby="itin-h">
    <h2 id="itin-h" class="overview-card-title">Itinerary{{ view.total ? ` · ${view.planned} of ${view.total} days planned` : '' }}</h2>
    <p v-if="!view.total" class="overview-empty">
      Days come from the trip dates — <RouterLink :to="{ name: 'trip-dates', params: { id: trip.id } }">Set the dates</RouterLink>
    </p>
    <p v-else-if="!view.empty.length" class="overview-empty">Every day has a plan.</p>
    <ul v-else class="overview-rows">
      <li v-for="iso in shown" :key="iso" class="overview-row overview-row-plain">{{ formatDayDate(iso) }} — nothing planned</li>
    </ul>
    <p v-if="more" class="overview-card-foot">and {{ more }} more</p>
    <p v-if="view.total" class="overview-card-foot">
      <RouterLink :to="{ name: 'trip-itinerary', params: { id: trip.id } }">Open itinerary</RouterLink>
    </p>
  </section>
</template>
