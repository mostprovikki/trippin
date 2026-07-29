<script setup>
import { computed } from 'vue'
import Tag from 'primevue/tag'
import { useTripsStore } from '../../stores/trips.js'
import { useNotify } from '../../composables/useNotify.js'
import SectionHeader from '../../components/SectionHeader.vue'
import DateWindowsEditor from '../../components/DateWindowsEditor.vue'

const trips = useTripsStore()
const notify = useNotify()

// Same predicate the sidebar checkmark uses (readiness `dates_confirmed`), so
// the nav state and this page can never contradict each other.
const confirmed = computed(() => {
  const t = trips.current
  return t?.date_mode === 'confirmed' && t?.start_date && t?.end_date
    ? { start: t.start_date, end: t.end_date }
    : null
})

async function onSave(windows) {
  try {
    await trips.saveWindows(trips.current.id, windows)
    notify.success('Dates saved')
  } catch (e) { notify.error(e.message) }
}
</script>

<template>
  <div>
    <SectionHeader
      title="Dates"
      :description="confirmed
        ? 'Trip dates are locked. Propose new windows below if plans change.'
        : 'Propose date windows, then confirm one to lock the trip dates.'"
    />
    <div v-if="confirmed" class="card dates-confirmed">
      <Tag severity="success" value="confirmed" />
      <strong>{{ confirmed.start }} &ndash; {{ confirmed.end }}</strong>
    </div>
    <div class="card">
      <DateWindowsEditor :windows="trips.current?.windows || []" @save="onSave" />
    </div>
  </div>
</template>

<style scoped>
.dates-confirmed {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
</style>
