<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useItineraryStore } from '../../stores/itinerary.js'
import { useTripsStore } from '../../stores/trips.js'
import { useAuthStore } from '../../stores/auth.js'
import { useDraft } from '../../composables/useDraft.js'
import { useNotify } from '../../composables/useNotify.js'
import EmptyState from '../../components/EmptyState.vue'
import DayCard from '../../components/DayCard.vue'
import SectionHeader from '../../components/SectionHeader.vue'
import { formatMoney } from '../../utils/format.js'

const route = useRoute()
const tripId = computed(() => route.params.id)
const store = useItineraryStore()
const trips = useTripsStore()
const auth = useAuthStore()
const notify = useNotify()

const loading = ref(true)

const todayDayId = computed(() => {
  const trip = trips.current
  if (!trip || trip.status !== 'active') return null
  const today = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const iso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  if (trip.start_date && trip.end_date && (iso < trip.start_date || iso > trip.end_date)) return null
  const day = store.days.find((d) => d.day_date === iso)
  return day ? day.id : null
})

const todayCardRef = ref(null)
// Named function rather than an inline `el => { todayCardRef.value = el }` in
// the template: script-setup's template compiler auto-unwraps top-level refs,
// so an assignment to `todayCardRef.value` written directly inside a template
// expression compiles as `unref(todayCardRef).value = el` — which throws
// ("Cannot set properties of null") because unref(todayCardRef) is the ref's
// *current* (null) inner value, not the ref itself. Keeping the assignment in
// a plain script-setup function sidesteps that transform (see
// ParticipantItinerary.vue's setDayRef for the same pattern).
function setTodayCardRef(dayId, el) {
  if (dayId === todayDayId.value) todayCardRef.value = el
}
watch(todayDayId, (id) => {
  if (id && todayCardRef.value?.$el?.scrollIntoView) todayCardRef.value.$el.scrollIntoView({ behavior: 'smooth', block: 'start' })
})

// Getter key: this view is reused across :id changes, so the AI draft has to
// follow the trip rather than freeze on whichever one was open at setup.
const aiDraftStore = useDraft(() => `trip:${tripId.value}:itinerary-ai`, () => ({ ai: null }))

// Mirror the Pinia draft into persistent storage both ways.
watch(() => store.draft, (d) => { aiDraftStore.draft.ai = d ?? null })

async function load() {
  loading.value = true
  // Read the stored draft before fetching: fetchItinerary clears store.draft on
  // a trip change, which feeds a null back through the mirror watcher above.
  // useDraft has already re-keyed by the time this runs, so this is the *new*
  // trip's stored draft.
  const stored = aiDraftStore.draft.ai
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
// Belt and braces, not the mechanism. Trip-scoped stores now clear themselves
// when asked about a different trip, which empties trips.current and makes
// TripLayout fall back to its skeleton — that unmounts this view, so onMounted
// covers the common path today (verified in a browser: the skeleton really does
// appear on a param-only switch). Kept because the reuse it guards against is
// silent when it returns: the sidebar would say one trip and the body show
// another, with edits written to whichever id the view captured first.
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
  <div>
    <SectionHeader title="Itinerary" description="Day-by-day plan. Days are generated from confirmed dates." />

    <div v-if="store.error" class="card">
      <strong>Error:</strong> {{ store.error }}
    </div>

    <div v-if="loading" class="card"><Skeleton v-for="i in 3" :key="i" class="skeleton-row" /></div>

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
              <span v-if="it.est_cost != null">{{ formatMoney(it.est_cost, trips.current?.currency) }}</span>
            </li>
          </ul>
        </div>
        <Button type="button" @click="applyWholeDraft">Apply</Button>
        <Button type="button" severity="secondary" outlined @click="discardWholeDraft">Discard</Button>
      </div>

      <DayCard
        v-for="(day, idx) in store.days"
        :key="day.id"
        :day="day"
        :index="idx + 1"
        :currency="trips.current?.currency"
        :is-today="day.id === todayDayId"
        :ref="el => setTodayCardRef(day.id, el)"
      />
    </template>
  </div>
</template>

<style scoped>
.ai-draft-card { background: var(--app-primary-soft); }
</style>
