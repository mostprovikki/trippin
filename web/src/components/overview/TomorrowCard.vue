<script setup>
// tripper.md §2 Tomorrow: first departures and cut-off times.
import { computed } from 'vue'
import { todayTimeline } from '../../utils/overview.js'
import { formatDayDate } from '../../utils/dates.js'

const props = defineProps({
  dayIso: { type: String, default: null },
  items: { type: Array, default: () => [] },
  isLastDay: { type: Boolean, default: false }
})
// nowMinutes -1: nothing tomorrow has happened yet, so every timed item is "later"
const first = computed(() => todayTimeline(props.items, -1).rows.slice(0, 3))
</script>

<template>
  <section class="card overview-card tomorrow-card" aria-labelledby="tmr-h">
    <h2 id="tmr-h" class="overview-card-title">Tomorrow{{ dayIso ? ` · ${formatDayDate(dayIso)}` : '' }}</h2>
    <p v-if="isLastDay" class="overview-empty">Last day — no plan for tomorrow.</p>
    <p v-else-if="!items.length" class="overview-empty">Nothing planned for tomorrow yet.</p>
    <ul v-else class="overview-rows">
      <li v-for="r in first" :key="r.id" class="overview-row today-row">
        <span class="today-time">{{ r.time_range || '—' }}</span>
        <div class="overview-row-main">
          <strong>{{ r.title }}</strong>
          <p v-if="r.booking_ref" class="overview-row-reason booking-ref">ref {{ r.booking_ref }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>
