<script setup>
// tripper.md §2 tripline: where, when, who, how long — no buttons (§5). A
// missing destination or dates links to where it's decided (two clicks, §4);
// that replaces the old "Next actions" list. Status lives in the trip header.
import { computed } from 'vue'
import { formatDayDate, tripCountdown } from '../../utils/dates.js'

const props = defineProps({ trip: { type: Object, required: true } })
const dates = computed(() => {
  const { start_date: s, end_date: e } = props.trip
  return s && e ? `${formatDayDate(s)} – ${formatDayDate(e)}` : null
})
const people = computed(() => {
  const n = (props.trip.participants || []).length
  return `${n} ${n === 1 ? 'person' : 'people'}`
})
const countdown = computed(() => tripCountdown(props.trip)?.label || null)
</script>

<template>
  <p class="trip-line">
    <span v-if="trip.destination">{{ trip.destination }}</span>
    <RouterLink v-else :to="{ name: 'trip-destination', params: { id: trip.id } }">Destination TBD</RouterLink>
    <span class="trip-line-sep" aria-hidden="true">·</span>
    <span v-if="dates">{{ dates }}</span>
    <RouterLink v-else :to="{ name: 'trip-dates', params: { id: trip.id } }">Dates TBD</RouterLink>
    <span class="trip-line-sep" aria-hidden="true">·</span>
    <span>{{ people }}</span>
    <template v-if="countdown">
      <span class="trip-line-sep" aria-hidden="true">·</span>
      <strong class="trip-line-countdown">{{ countdown }}</strong>
    </template>
  </p>
</template>
