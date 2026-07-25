<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import { useTripsStore } from '../../stores/trips.js'
import { useNotify } from '../../composables/useNotify.js'
import SectionHeader from '../../components/SectionHeader.vue'
import DestinationPanel from '../../components/DestinationPanel.vue'

const route = useRoute()
const trips = useTripsStore()
const notify = useNotify()

const tripId = computed(() => route.params.id)
const loading = ref(true)
const loadError = ref(null)

async function load() {
  loading.value = true
  // trips.candidates is shared store state that nothing else clears: leaving it
  // in place renders the previous trip's candidates under this trip's id, and a
  // stale error banner would outlive the fetch that produced it.
  loadError.value = null
  trips.candidates = []
  try {
    await trips.fetchCandidates(tripId.value)
  } catch (e) {
    // Kept on the page as well as in a toast — a toast fades, and what it left
    // behind was "No destination candidates yet.", which reads as an answer
    // rather than as a failure.
    loadError.value = e.message
    notify.error(e.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)
// TripLayout is reused when only :id changes, so this view is never remounted
// between trips and has to refetch for the new :id itself.
watch(tripId, load)
</script>

<template>
  <div>
    <SectionHeader title="Destination" description="Collect candidates, compare, and decide." />

    <div class="card">
      <ProgressSpinner v-if="loading" style="width: 2.5rem; height: 2.5rem" />

      <div v-else-if="loadError" class="dest-error">
        <Message severity="error" :closable="false">{{ loadError }}</Message>
        <Button label="Try again" icon="pi pi-refresh" outlined @click="load" />
      </div>

      <DestinationPanel v-else :trip-id="tripId" :candidates="trips.candidates" />
    </div>
  </div>
</template>

<style scoped>
.dest-error { display: flex; flex-direction: column; align-items: flex-start; gap: 0.75rem; }
</style>
