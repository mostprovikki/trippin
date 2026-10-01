<script setup>
// tripper.md §2 during the trip: Today — the next item gets an info rail,
// "Next · in N min", booking ref, Map link; done items dimmed. §1 job 5 at
// zero clicks.
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { todayTimeline, mapsUrl } from '../../utils/overview.js'
import { formatDayDate } from '../../utils/dates.js'

const props = defineProps({
  dayIso: { type: String, required: true },
  items: { type: Array, default: () => [] },
  nowMinutes: { type: Number, required: true }
})
const route = useRoute()
const view = computed(() => todayTimeline(props.items, props.nowMinutes))
const inText = computed(() => {
  const m = view.value.minutesToNext
  if (m == null) return ''
  if (m === 0) return 'now'
  return m >= 60 ? `in ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `in ${m} min`
})
</script>

<template>
  <section class="card overview-card today-card" aria-labelledby="today-h">
    <h2 id="today-h" class="overview-card-title">Today · {{ formatDayDate(dayIso) }}</h2>
    <p v-if="!items.length" class="overview-empty">Nothing planned today — open the itinerary to add something</p>
    <ul v-else class="overview-rows">
      <li
        v-for="r in view.rows"
        :key="r.id"
        :class="['overview-row', 'today-row', { 'is-done': r.state === 'done', 'is-next': r.state === 'next' }]"
      >
        <span class="today-time">{{ r.time_range || '—' }}</span>
        <div class="overview-row-main">
          <div class="overview-row-head">
            <strong>{{ r.title }}</strong>
            <span v-if="r.state === 'done'" class="today-done">Done</span>
          </div>
          <p v-if="r.state === 'next'" class="today-next">
            Next · {{ inText }}<template v-if="r.booking_ref"> · <span class="booking-ref">ref {{ r.booking_ref }}</span></template>
          </p>
          <p v-if="r.location" class="overview-row-reason">
            {{ r.location }}
            <a v-if="mapsUrl(r.location)" class="map-link" :href="mapsUrl(r.location)" target="_blank" rel="noopener">Map</a>
          </p>
        </div>
      </li>
    </ul>
    <p class="overview-card-foot">
      <RouterLink :to="{ name: 'trip-itinerary', params: { id: route.params.id } }">Open itinerary</RouterLink>
    </p>
  </section>
</template>
