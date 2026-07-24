<script setup>
import { useTripsStore } from '../../stores/trips.js'
import { useNotify } from '../../composables/useNotify.js'
import SectionHeader from '../../components/SectionHeader.vue'
import DateWindowsEditor from '../../components/DateWindowsEditor.vue'

const trips = useTripsStore()
const notify = useNotify()

async function onSave(windows) {
  try {
    await trips.saveWindows(trips.current.id, windows)
    notify.success('Dates saved')
  } catch (e) { notify.error(e.message) }
}
</script>

<template>
  <div>
    <SectionHeader title="Dates" description="Propose date windows, then confirm one to lock the trip dates." />
    <div class="card">
      <DateWindowsEditor :windows="trips.current?.windows || []" @save="onSave" />
    </div>
  </div>
</template>
