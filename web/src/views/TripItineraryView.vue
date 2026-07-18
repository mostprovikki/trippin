<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useItineraryStore } from '../stores/itinerary.js'
import { useTripsStore } from '../stores/trips.js'
import { useAuthStore } from '../stores/auth.js'
import { useDraft } from '../composables/useDraft.js'
import { useNotify } from '../composables/useNotify.js'
import EmptyState from '../components/EmptyState.vue'
import DayCard from '../components/DayCard.vue'

const route = useRoute()
const tripId = route.params.id
const store = useItineraryStore()
const trips = useTripsStore()
const auth = useAuthStore()
const notify = useNotify()

const loading = ref(true)
const aiDraftStore = useDraft(`trip:${tripId}:itinerary-ai`, () => ({ ai: null }))

// Mirror the Pinia draft into persistent storage both ways.
watch(() => store.draft, (d) => { aiDraftStore.draft.ai = d ?? null })

onMounted(async () => {
  try {
    await store.fetchItinerary(tripId)
    if (!trips.current || trips.current.id !== tripId) {
      try { await trips.fetchTrip(tripId) } catch { /* header falls back to generic */ }
    }
    if (aiDraftStore.draft.ai && !store.draft) store.draft = aiDraftStore.draft.ai
  } catch (e) {
    notify.error(e.message)
  } finally {
    loading.value = false
  }
})

async function initDays() {
  try { await store.init(tripId) } catch (e) { notify.error(e.message) }
}

async function draftWholeTrip() {
  try { await store.aiDraft(tripId) } catch (e) { notify.error(e.message) }
}

async function applyWholeDraft() {
  try {
    await store.applyDraft(tripId)
    aiDraftStore.draft.ai = null
    aiDraftStore.clear()
    notify.success('AI draft applied')
  } catch (e) {
    notify.error(e.message)
  }
}

function discardWholeDraft() {
  store.draft = null
  aiDraftStore.draft.ai = null
  aiDraftStore.clear()
}
</script>

<template>
  <main class="page">
    <h1>{{ trips.current?.name || 'Trip' }} — Itinerary</h1>

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
        <Tag v-else severity="secondary" value="AI disabled — set LLM_PROVIDER" />
      </div>

      <div v-if="store.draft" class="card" style="background:#f6f7f9">
        <h2>AI draft preview</h2>
        <div v-for="d in store.draft" :key="d.day_date" style="margin-bottom:1rem">
          <h3>{{ d.day_date }}</h3>
          <ul style="list-style:none;padding:0;margin:0">
            <li v-for="(it, i) in d.items" :key="i">
              <span v-if="it.time_range" class="badge">{{ it.time_range }}</span>
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
  </main>
</template>
