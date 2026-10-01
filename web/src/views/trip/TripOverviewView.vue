<script setup>
// Trip overview — a phase-aware Monitor (docs/design/tripper.md §2). Before the
// trip: Who's missing what + Since you last looked | Itinerary, Budget,
// Checklists. During: Today (Task 7 of the 2026-10-01 plan builds the rest).
// After: trip line, Itinerary, Budget. No button in the page header (§5);
// every action sits on the row it acts on.
import { computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Tag from 'primevue/tag'
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
import { overviewPhase } from '../../utils/overview.js'
import { toIsoDate, dayHeader } from '../../utils/dates.js'

const route = useRoute()
const trips = useTripsStore()
const readiness = useReadinessStore()
const budget = useBudgetStore()
const itinerary = useItineraryStore()
const checklists = useChecklistsStore()
const overview = useOverviewStore()
const { copy: copyLink } = useCopyLink()

const tripId = computed(() => route.params.id)
const trip = computed(() => trips.current)
const participants = computed(() => readiness.data?.participants || [])
const hasActiveLink = (personId) => !!participants.value.find((p) => p.person_id === personId)?.has_active_link

const todayIso = computed(() => toIsoDate(new Date()))
const phase = computed(() => overviewPhase(trip.value, todayIso.value))
// Stores are shared across trips; show only data that belongs to this one.
const mine = (store) => store.lastTripId === tripId.value
const itineraryDays = computed(() => (mine(itinerary) ? itinerary.days : []))
const tripChecklists = computed(() => (mine(checklists) ? checklists.checklists : []))

const todayHeading = computed(() => `Today — ${dayHeader(todayIso.value)}`)
const todayItems = computed(() => itineraryDays.value.find((d) => d.day_date === todayIso.value)?.items || [])

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
  if (phase.value === 'before' && checklists.lastTripId !== tripId.value) {
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
        <BudgetCard :equal-share="Number(budget.equal_share) || 0" :participant-count="budget.participant_count || 0" :currency="trip.currency || 'INR'" />
        <ChecklistsCard :checklists="tripChecklists" />
      </div>
    </div>

    <div v-else-if="phase === 'during'" class="overview-grid">
      <div class="overview-col">
        <section class="card today-card">
          <h2>{{ todayHeading }}</h2>
          <ul v-if="todayItems.length" class="day-items">
            <li v-for="item in todayItems" :key="item.id" class="day-item">
              <Tag v-if="item.time_range" :value="item.time_range" severity="secondary" />
              <strong>{{ item.title }}</strong>
              <span v-if="item.location">— {{ item.location }}</span>
            </li>
          </ul>
          <p v-else class="today-empty">Nothing planned today — open the itinerary to add something</p>
          <RouterLink class="action-link" :to="{ name: 'trip-itinerary', params: { id: trip.id } }">
            <i class="pi pi-arrow-right" /> Open itinerary
          </RouterLink>
        </section>
      </div>
    </div>

    <div v-else class="overview-grid">
      <div class="overview-col">
        <ItineraryCard :trip="trip" :days="itineraryDays" />
      </div>
      <div class="overview-col">
        <BudgetCard :equal-share="Number(budget.equal_share) || 0" :participant-count="budget.participant_count || 0" :currency="trip.currency || 'INR'" />
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

/* Matches DayCard.vue's .day-items/.day-item row idiom. */
.today-card .day-items { list-style: none; padding: 0; margin: 0 0 0.75rem; }
.today-card .day-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0; border-bottom: 1px solid var(--app-border); flex-wrap: wrap; }
.today-empty { color: var(--app-text-muted); margin: 0 0 0.75rem; }
.action-link { display: inline-flex; align-items: center; gap: 0.5rem; text-decoration: none; font-weight: 500; }
.action-link:hover { text-decoration: underline; }
</style>
