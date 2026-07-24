<script setup>
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTripsStore } from '../../stores/trips.js'
import { useNotify } from '../../composables/useNotify.js'
import SectionHeader from '../../components/SectionHeader.vue'
import DestinationPanel from '../../components/DestinationPanel.vue'

const route = useRoute()
const trips = useTripsStore()
const notify = useNotify()

onMounted(async () => {
  try { await trips.fetchCandidates(route.params.id) } catch (e) { notify.error(e.message) }
})
</script>

<template>
  <div>
    <SectionHeader title="Destination" description="Collect candidates, compare, and decide." />
    <div class="card">
      <DestinationPanel :trip-id="route.params.id" :candidates="trips.candidates" />
    </div>
  </div>
</template>
