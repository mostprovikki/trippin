<script setup>
import { computed } from 'vue'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import RadioButton from 'primevue/radiobutton'
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

const savedWindows = computed(() => trips.current?.windows || [])

// Mirrors TripWizard.vue step 2's radio group/idiom, but here it patches the
// live trip (there's no draft to submit later) instead of a wizard draft.
const dateMode = computed({
  get: () => trips.current?.date_mode || 'broad',
  set: (mode) => onDateModeChange(mode)
})

async function onDateModeChange(mode) {
  try {
    await trips.updateTrip(trips.current.id, { date_mode: mode })
  } catch (e) { notify.error(e.message) }
}

// The actual fix for trip-planner-3zb: promote one saved window straight to
// the trip's final dates, in one call, rather than requiring the organizer to
// separately flip date_mode and retype the dates it already has.
async function useAsFinal(w) {
  try {
    await trips.updateTrip(trips.current.id, { date_mode: 'confirmed', start_date: w.start_date, end_date: w.end_date })
    notify.success('Dates confirmed')
  } catch (e) { notify.error(e.message) }
}

// Reverts to 'slight' rather than clearing date_mode outright ('broad' would
// also drop the flex-days/anchor idiom this trip may still want) - windows
// themselves are left untouched, only date_mode changes.
async function onUnconfirm() {
  try {
    await trips.updateTrip(trips.current.id, { date_mode: 'slight' })
    notify.success('Dates unconfirmed')
  } catch (e) { notify.error(e.message) }
}

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
        : 'Propose date windows below, then use \'Use as final dates\' on one to lock the trip dates.'"
    />
    <div v-if="confirmed" class="card dates-confirmed">
      <Tag severity="success" value="confirmed" />
      <strong>{{ confirmed.start }} &ndash; {{ confirmed.end }}</strong>
      <Button type="button" label="Unconfirm" severity="secondary" outlined size="small" @click="onUnconfirm" />
    </div>
    <div v-else class="card date-mode-card">
      <div class="field">
        <label>Date mode</label>
        <div class="radio-row"><RadioButton v-model="dateMode" input-id="tdm-confirmed" value="confirmed" /><label for="tdm-confirmed">Confirmed</label></div>
        <div class="radio-row"><RadioButton v-model="dateMode" input-id="tdm-slight" value="slight" /><label for="tdm-slight">Slight flex</label></div>
        <div class="radio-row"><RadioButton v-model="dateMode" input-id="tdm-broad" value="broad" /><label for="tdm-broad">Broad</label></div>
      </div>
    </div>
    <div v-if="!confirmed && savedWindows.length" class="card">
      <ul class="dates-window-list">
        <li v-for="(w, idx) in savedWindows" :key="idx" class="dates-window-row">
          <span class="dates-window-range">{{ w.start_date }} &ndash; {{ w.end_date }}</span>
          <span v-if="w.note" class="dates-window-note">{{ w.note }}</span>
          <Button type="button" label="Use as final dates" size="small" @click="useAsFinal(w)" />
        </li>
      </ul>
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
.radio-row { display: flex; align-items: center; gap: 0.5rem; margin: 0.25rem 0; }
.dates-window-list { list-style: none; padding: 0; margin: 0; }
.dates-window-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--app-border);
}
.dates-window-row:last-child { border-bottom: none; }
.dates-window-note { color: var(--app-text-muted); font-size: 0.875rem; }
</style>
