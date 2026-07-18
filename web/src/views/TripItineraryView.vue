<script setup>
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useItineraryStore } from '../stores/itinerary.js'
import { useAuthStore } from '../stores/auth.js'
import DayCard from '../components/DayCard.vue'

const route = useRoute()
const tripId = route.params.id
const store = useItineraryStore()
const auth = useAuthStore()

onMounted(() => {
  store.fetchItinerary(tripId).catch(() => {})
})

async function initDays() {
  try { await store.init(tripId) } catch { /* error surfaced via store.error */ }
}

async function draftWholeTrip() {
  try { await store.aiDraft(tripId) } catch { /* error surfaced via store.error */ }
}

async function applyWholeDraft() {
  try { await store.applyDraft(tripId) } catch { /* error surfaced via store.error */ }
}

function discardWholeDraft() {
  store.draft = null
}
</script>

<template>
  <main class="page">
    <h1>Trip Itinerary</h1>

    <div v-if="store.error" class="card">
      <strong>Error:</strong> {{ store.error }}
    </div>

    <div v-if="!store.days.length" class="card">
      <p>No itinerary days yet. Days are generated from the trip's confirmed start/end dates.</p>
      <button class="btn btn-primary" type="button" @click="initDays">Initialize days</button>
    </div>

    <template v-else>
      <div class="card">
        <div v-if="auth.aiEnabled">
          <button class="btn" type="button" :disabled="store.aiBusy" @click="draftWholeTrip">
            {{ store.aiBusy ? 'Generating…' : 'AI draft (whole trip)' }}
          </button>
        </div>
        <p v-else class="badge">AI disabled — set LLM_PROVIDER</p>
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
        <button class="btn btn-primary" type="button" @click="applyWholeDraft">Apply</button>
        <button class="btn" type="button" @click="discardWholeDraft">Discard</button>
      </div>

      <DayCard v-for="day in store.days" :key="day.id" :day="day" />
    </template>
  </main>
</template>
