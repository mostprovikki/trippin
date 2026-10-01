<script setup>
// Trip overview — a phase-aware Monitor (docs/design/tripper.md §2). Before the
// trip: Who's missing what + Since you last looked | Itinerary, Budget,
// Checklists. During: Today | Quick reference, Tomorrow, Before tomorrow.
// After: trip line, Itinerary, Budget. No button in the page header (§5);
// every action sits on the row it acts on.
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import { useTripsStore } from '../../stores/trips.js'
import { useReadinessStore } from '../../stores/readiness.js'
import { useBudgetStore } from '../../stores/budget.js'
import { useItineraryStore } from '../../stores/itinerary.js'
import { useChecklistsStore } from '../../stores/checklists.js'
import { useOverviewStore } from '../../stores/overview.js'
import { useCopyLink } from '../../composables/useCopyLink.js'
import TripLine from '../../components/overview/TripLine.vue'
import MissingCard from '../../components/overview/MissingCard.vue'
import SinceCard from '../../components/overview/SinceCard.vue'
import ItineraryCard from '../../components/overview/ItineraryCard.vue'
import BudgetCard from '../../components/overview/BudgetCard.vue'
import ChecklistsCard from '../../components/overview/ChecklistsCard.vue'
import TodayCard from '../../components/overview/TodayCard.vue'
import QuickRefCard from '../../components/overview/QuickRefCard.vue'
import TomorrowCard from '../../components/overview/TomorrowCard.vue'
import BeforeTomorrowCard from '../../components/overview/BeforeTomorrowCard.vue'
import { useNotify } from '../../composables/useNotify.js'
import { overviewPhase, tonightStay } from '../../utils/overview.js'
import { toIsoDate } from '../../utils/dates.js'

const route = useRoute()
const trips = useTripsStore()
const readiness = useReadinessStore()
const budget = useBudgetStore()
const itinerary = useItineraryStore()
const checklists = useChecklistsStore()
const overview = useOverviewStore()
const { copy: copyLink } = useCopyLink()
const notify = useNotify()

const tripId = computed(() => route.params.id)
const trip = computed(() => trips.current)
const participants = computed(() => readiness.data?.participants || [])
const hasActiveLink = (personId) => !!participants.value.find((p) => p.person_id === personId)?.has_active_link

// A minute clock: "Next · in N min" moves on, and the phase flips at midnight
// without a reload.
const now = ref(new Date())
let clock = null
onMounted(() => { clock = setInterval(() => { now.value = new Date() }, 60_000) })
onUnmounted(() => clearInterval(clock))
const todayIso = computed(() => toIsoDate(now.value))
const tomorrowIso = computed(() => { const d = new Date(now.value); d.setDate(d.getDate() + 1); return toIsoDate(d) })
const nowMinutes = computed(() => now.value.getHours() * 60 + now.value.getMinutes())
const phase = computed(() => overviewPhase(trip.value, todayIso.value))
// Stores are shared across trips; show only data that belongs to this one.
const mine = (store) => store.lastTripId === tripId.value
const itineraryDays = computed(() => (mine(itinerary) ? itinerary.days : []))
const tripChecklists = computed(() => (mine(checklists) ? checklists.checklists : []))

const itemsOn = (iso) => itineraryDays.value.find((d) => d.day_date === iso)?.items || []
const todayItems = computed(() => itemsOn(todayIso.value))
const tomorrowItems = computed(() => itemsOn(tomorrowIso.value))
const isLastDay = computed(() => todayIso.value === trip.value?.end_date)
const stay = computed(() => tonightStay(itineraryDays.value, todayIso.value))

async function toggleItem(item, done) {
  try { await checklists.updateItem(item.id, { done }) } catch (e) { notify.error(e.message); throw e }
  // §6: the Checklists tab badge counts from readiness — keep it in step
  readiness.fetch(tripId.value).catch(() => { /* badge refreshes on next load */ })
}

async function load() {
  // Readiness is guarded: TripLayout fetches it for the tab badges, and
  // refetching what the store already holds would blank a card it filled.
  const pending = []
  if (readiness.lastTripId !== tripId.value) {
    pending.push(readiness.fetch(tripId.value).catch(() => { /* layout badge already reported */ }))
  }
  if (itinerary.lastTripId !== tripId.value) {
    pending.push(itinerary.fetchItinerary(tripId.value).catch(() => { /* card shows its empty state */ }))
  }
  if (phase.value !== 'after' && checklists.lastTripId !== tripId.value) {
    pending.push(checklists.fetchForTrip(tripId.value).catch(() => { /* card shows Nothing open */ }))
  }
  // Records this visit for "Since you last looked" — once per open, never
  // guarded on lastTripId (the visit itself is the point).
  if (phase.value === 'before') pending.push(overview.fetchSeen(tripId.value).catch(() => { /* first-visit state */ }))
  pending.push(budget.fetchBudget(tripId.value).catch(() => { /* card shows No estimate yet */ }))
  await Promise.all(pending)
}

onMounted(load)
// Belt and braces: TripLayout remounts this view on a trip switch today, but a
// silent reuse would show one trip's cards under another's name.
watch(tripId, load)
</script>

<template>
  <div v-if="trip" class="overview" :data-phase="phase">
    <h1 class="visually-hidden">Overview</h1>
    <TripLine :trip="trip" />

    <div v-if="phase === 'before'" class="overview-grid">
      <div class="overview-col">
        <MissingCard :participants="participants" :trip-end="trip.end_date || null">
          <template #row-action="{ personId, name }">
            <Button
              size="small"
              outlined
              icon="pi pi-copy"
              :label="`Copy ${name}'s link`"
              @click="copyLink(trip.id, personId, name, { hasActiveLink: hasActiveLink(personId) })"
            />
          </template>
        </MissingCard>
        <SinceCard
          :since="mine(overview) ? overview.since : null"
          :events="mine(overview) ? overview.events : []"
        />
      </div>
      <div class="overview-col">
        <ItineraryCard :trip="trip" :days="itineraryDays" />
        <BudgetCard :equal-share="Number(budget.equal_share) || 0" :participant-count="budget.participant_count || 0" :override-count="(budget.overrides || []).length" :currency="trip.currency || 'INR'" />
        <ChecklistsCard :checklists="tripChecklists" />
      </div>
    </div>

    <!-- §2: on a phone the columns stack Today → Quick reference → Tomorrow →
         Before tomorrow, which is this DOM order. Missing, Since, Budget hidden. -->
    <div v-else-if="phase === 'during'" class="overview-grid">
      <div class="overview-col">
        <TodayCard :day-iso="todayIso" :items="todayItems" :now-minutes="nowMinutes" />
      </div>
      <div class="overview-col">
        <QuickRefCard :stay="stay" :today-items="todayItems" :emergency-info="trip.emergency_info || null" />
        <TomorrowCard :day-iso="isLastDay ? null : tomorrowIso" :items="tomorrowItems" :is-last-day="isLastDay" />
        <BeforeTomorrowCard :checklists="tripChecklists" :tomorrow-iso="tomorrowIso" :toggle="toggleItem" />
      </div>
    </div>

    <div v-else class="overview-grid">
      <div class="overview-col">
        <ItineraryCard :trip="trip" :days="itineraryDays" />
      </div>
      <div class="overview-col">
        <BudgetCard :equal-share="Number(budget.equal_share) || 0" :participant-count="budget.participant_count || 0" :override-count="(budget.overrides || []).length" :currency="trip.currency || 'INR'" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* §2: two columns at desk width; on a phone they stack left then right. */
.overview-grid { display: grid; grid-template-columns: 1fr; gap: 0 1rem; align-items: start; }
@media (min-width: 900px) {
  .overview-grid { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
}
.overview-col { min-width: 0; }

</style>
