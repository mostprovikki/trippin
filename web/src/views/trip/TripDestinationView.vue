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
  // Which trip this run is for. The view is reused across :id changes, so a slow
  // run can still be in progress once the route has moved on, and the banner and
  // spinner below belong to whichever trip is on screen now — not to this one.
  const target = tripId.value
  loading.value = true
  // Only this view's own state is cleared here. The candidates list is the
  // store's, and it drops another trip's rows itself off its lastTripId.
  loadError.value = null
  try {
    await trips.fetchCandidates(target)
  } catch (e) {
    // A failure for a trip the user has already left would sit here as a
    // permanent banner over a list that in fact loaded fine.
    if (target !== tripId.value) return
    // Kept on the page as well as in a toast — a toast fades, and what it left
    // behind was "No destination candidates yet.", which reads as an answer
    // rather than as a failure.
    loadError.value = e.message
    notify.error(e.message)
  } finally {
    // the newer run owns the spinner; clearing it from here would uncover an
    // empty list while that run is still fetching.
    if (target === tripId.value) loading.value = false
  }
}

onMounted(load)
// Refetches for the new :id whether TripLayout rebuilds this view on a trip
// change — it does now, since it blanks its trip while the next one loads — or
// reuses it in place, which is what it used to do.
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
