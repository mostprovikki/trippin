<script setup>
// tripper.md §2 "Since you last looked · ⟨date⟩, where each change links to
// what it affects" — the collecting-mode return visit (§3). Data from
// POST /api/trips/:id/seen (participant-originated changes only, owner D6).
import { computed } from 'vue'
import { formatDayDate, utcStampToLocalIso } from '../../utils/dates.js'

const props = defineProps({
  since: { type: String, default: null },
  events: { type: Array, default: () => [] }
})
const TARGET_ROUTE = { people: 'trip-people', checklists: 'trip-checklists' }
const day = (ts) => formatDayDate(utcStampToLocalIso(ts))
const sinceDay = computed(() => (props.since ? day(props.since) : ''))
</script>

<template>
  <section class="card overview-card since-card" aria-labelledby="since-h">
    <h2 id="since-h" class="overview-card-title">Since you last looked{{ since ? ` · ${sinceDay}` : '' }}</h2>
    <p v-if="!since" class="overview-empty">Changes from participants will show here.</p>
    <p v-else-if="!events.length" class="overview-empty">Nothing new since {{ sinceDay }}.</p>
    <ul v-else class="overview-rows">
      <li v-for="e in events" :key="e.id" class="overview-row">
        <span class="since-date">{{ day(e.created_at) }}</span>
        <RouterLink :to="{ name: TARGET_ROUTE[e.target] || 'trip-people' }" class="since-summary">{{ e.summary }}</RouterLink>
      </li>
    </ul>
  </section>
</template>
