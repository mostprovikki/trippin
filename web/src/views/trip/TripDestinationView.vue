<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Textarea from 'primevue/textarea'
import { useTripsStore } from '../../stores/trips.js'
import { useNotify } from '../../composables/useNotify.js'
import { useTripReadOnly } from '../../composables/useTripReadOnly.js'
import SectionHeader from '../../components/SectionHeader.vue'
import DestinationPanel from '../../components/DestinationPanel.vue'
import GoalsEditor from '../../components/GoalsEditor.vue'

const route = useRoute()
const trips = useTripsStore()
const notify = useNotify()
const readOnly = useTripReadOnly()

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

// Goals live here since the Goals tab was cut (docs/design/tripper.md §5): they
// are constraints on where the trip goes — fixed events, must-dos.
async function onAddGoal(goal) {
  try { await trips.addGoal(tripId.value, goal) } catch (e) { notify.error(e.message) }
}
async function onUpdateGoal(goalId, goal) {
  try { await trips.updateGoal(goalId, goal) } catch (e) { notify.error(e.message) }
}
async function onDeleteGoal(goalId) {
  try { await trips.deleteGoal(goalId) } catch (e) { notify.error(e.message) }
}

// Local emergency numbers, shown in the during-trip Overview's Quick reference
// (tripper.md §2; owner decision D4). One Save for this section (§5), shown only when dirty (D8).
const emergencyDraft = ref('')
watch(() => trips.current?.emergency_info, (v) => { emergencyDraft.value = v || '' }, { immediate: true })
const emergencyDirty = computed(() => emergencyDraft.value !== (trips.current?.emergency_info || ''))
async function saveEmergency() {
  try {
    await trips.updateTrip(tripId.value, { emergency_info: emergencyDraft.value.trim() || null })
    notify.success('Emergency numbers saved')
  } catch (e) { notify.error(e.message) }
}
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

      <DestinationPanel v-else :trip-id="tripId" :candidates="trips.candidates" :readonly="readOnly" />
    </div>

    <section class="card dest-goals" aria-labelledby="trip-goals-heading">
      <h2 id="trip-goals-heading">Goals</h2>
      <p class="dest-goals-desc">What this trip is for — fixed events, must-dos, shared intentions.</p>
      <GoalsEditor :goals="trips.current?.goals || []" :readonly="readOnly" @add="onAddGoal" @update="onUpdateGoal" @delete="onDeleteGoal" />
    </section>

    <section class="card dest-goals" aria-labelledby="trip-emergency-heading">
      <h2 id="trip-emergency-heading">On the trip</h2>
      <p class="dest-goals-desc">Shown in the Overview's Quick reference while the trip is on.</p>
      <template v-if="readOnly">
        <h3 class="dest-emergency-label">Local emergency numbers</h3>
        <p class="dest-emergency-text" data-test="emergency-text">{{ trips.current?.emergency_info || 'None recorded.' }}</p>
      </template>
      <template v-else>
      <div class="field">
        <label for="trip-emergency">Local emergency numbers</label>
        <Textarea id="trip-emergency" v-model="emergencyDraft" rows="3" auto-resize fluid placeholder="e.g. Police 113 · Ambulance 115 · Embassy +84 24 3824 0990" />
      </div>
      <!-- Shown only when dirty (D8): no filled button at rest. -->
      <Button v-if="emergencyDirty" label="Save emergency numbers" @click="saveEmergency" />
      </template>
    </section>
  </div>
</template>

<style scoped>
.dest-goals { margin-top: 1rem; }
.dest-goals h2 { margin-bottom: 0.25rem; }
.dest-goals-desc { margin: 0 0 0.75rem; color: var(--app-text-muted); font-size: 0.875rem; }
.dest-emergency-label { margin: 0 0 0.25rem; font-size: 0.875rem; }
.dest-emergency-text { margin: 0; white-space: pre-line; }
.dest-error { display: flex; flex-direction: column; align-items: flex-start; gap: 0.75rem; }
</style>
