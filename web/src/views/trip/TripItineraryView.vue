<script setup>
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useItineraryStore } from '../../stores/itinerary.js'
import { useAuthStore } from '../../stores/auth.js'
import { useDraft } from '../../composables/useDraft.js'
import { useNotify } from '../../composables/useNotify.js'
import EmptyState from '../../components/EmptyState.vue'
import DayCard from '../../components/DayCard.vue'
import SectionHeader from '../../components/SectionHeader.vue'

const route = useRoute()
const tripId = computed(() => route.params.id)
const store = useItineraryStore()
const auth = useAuthStore()
const notify = useNotify()

const loading = ref(true)

// useDraft resolves its storage key once, so the stored draft is rebuilt
// whenever the trip changes — otherwise trip B's AI draft is persisted under
// trip A's key.
let draftTripId = tripId.value
const aiDraftStore = shallowRef(useDraft(`trip:${draftTripId}:itinerary-ai`, () => ({ ai: null })))

function rekeyAiDraft() {
  if (draftTripId === tripId.value) return
  aiDraftStore.value.teardown()
  draftTripId = tripId.value
  aiDraftStore.value = useDraft(`trip:${draftTripId}:itinerary-ai`, () => ({ ai: null }))
}
// A draft rebuilt outside setup doesn't get useDraft's own unmount hook.
onBeforeUnmount(() => aiDraftStore.value.teardown())

// Mirror the Pinia draft into persistent storage both ways.
watch(() => store.draft, (d) => { aiDraftStore.value.draft.ai = d ?? null })

async function load() {
  loading.value = true
  rekeyAiDraft()
  // Read the stored draft before resetting: clearing store.draft feeds a null
  // back through the mirror watcher above.
  const stored = aiDraftStore.value.draft.ai
  // Days, per-day drafts and the error banner all belong to the trip we came
  // from; an unapplied draft applied here would write to the wrong trip.
  store.$reset()
  try {
    await store.fetchItinerary(tripId.value)
  } catch (e) {
    notify.error(e.message)
  } finally {
    if (stored && !store.draft) store.draft = stored
    loading.value = false
  }
}

onMounted(load)
// TripLayout is reused when only :id changes, so this view is never remounted
// between trips and has to refetch for the new :id itself.
watch(tripId, load)

async function initDays() {
  try { await store.init(tripId.value) } catch (e) { notify.error(e.message) }
}

async function draftWholeTrip() {
  try { await store.aiDraft(tripId.value) } catch (e) { notify.error(e.message) }
}

async function applyWholeDraft() {
  try {
    await store.applyDraft(tripId.value)
    aiDraftStore.value.draft.ai = null
    aiDraftStore.value.clear()
    notify.success('AI draft applied')
  } catch (e) {
    notify.error(e.message)
  }
}

function discardWholeDraft() {
  store.draft = null
  aiDraftStore.value.draft.ai = null
  aiDraftStore.value.clear()
}
</script>

<template>
  <div>
    <SectionHeader title="Itinerary" description="Day-by-day plan. Days are generated from confirmed dates." />

    <div v-if="store.error" class="card">
      <strong>Error:</strong> {{ store.error }}
    </div>

    <div v-if="loading" class="card"><Skeleton v-for="i in 3" :key="i" height="1.5rem" style="margin-bottom: 0.5rem" /></div>

    <EmptyState v-else-if="!store.days.length" icon="pi pi-calendar" message="No itinerary days yet. Days are generated from the trip's confirmed start/end dates." cta-label="Initialize days" @cta="initDays" />

    <template v-else>
      <div class="card">
        <div v-if="auth.aiEnabled">
          <Button type="button" :loading="store.aiBusy" @click="draftWholeTrip">
            {{ store.aiBusy ? 'Generating…' : 'AI draft (whole trip)' }}
          </Button>
        </div>
        <Tag v-else severity="secondary" value="AI suggestions are turned off" />
      </div>

      <div v-if="store.draft" class="card ai-draft-card">
        <h2>AI draft preview</h2>
        <div v-for="d in store.draft" :key="d.day_date" style="margin-bottom:1rem">
          <h3>{{ d.day_date }}</h3>
          <ul style="list-style:none;padding:0;margin:0">
            <li v-for="(it, i) in d.items" :key="i">
              <Tag v-if="it.time_range" :value="it.time_range" severity="secondary" />
              <strong>{{ it.title }}</strong>
              <span v-if="it.location">— {{ it.location }}</span>
              <span v-if="it.est_cost != null">${{ it.est_cost }}</span>
            </li>
          </ul>
        </div>
        <Button type="button" @click="applyWholeDraft">Apply</Button>
        <Button type="button" severity="secondary" outlined @click="discardWholeDraft">Discard</Button>
      </div>

      <DayCard v-for="day in store.days" :key="day.id" :day="day" />
    </template>
  </div>
</template>

<style scoped>
.ai-draft-card { background: var(--app-primary-soft); }
</style>
