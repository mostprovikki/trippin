<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTripsStore } from '../stores/trips.js'
import { usePeopleStore } from '../stores/people.js'
import DateWindowsEditor from './DateWindowsEditor.vue'

const router = useRouter()
const store = useTripsStore()
const people = usePeopleStore()

const step = ref(1)

const form = reactive({
  name: '',
  description: '',
  origin_city: '',
  vibe_tags: '',
  date_mode: 'broad',
  start_date: '',
  end_date: '',
  flex_days: '',
  destination_mode: 'open',
  destination: '',
  participant_ids: []
})

const windows = ref([])

onMounted(async () => {
  try { await people.fetchPeople() } catch { /* surfaced via store.error elsewhere */ }
})

function next() { if (step.value < 4) step.value++ }
function back() { if (step.value > 1) step.value-- }

function toggleParticipant(id) {
  const idx = form.participant_ids.indexOf(id)
  if (idx === -1) form.participant_ids.push(id)
  else form.participant_ids.splice(idx, 1)
}

function onWindowsSave(list) {
  windows.value = list
}

async function submit() {
  const payload = {
    name: form.name,
    description: form.description || undefined,
    origin_city: form.origin_city || undefined,
    vibe_tags: form.vibe_tags.split(',').map((s) => s.trim()).filter(Boolean),
    date_mode: form.date_mode,
    destination_mode: form.destination_mode,
    participant_ids: form.participant_ids
  }
  if (form.date_mode === 'confirmed') {
    payload.start_date = form.start_date || undefined
    payload.end_date = form.end_date || undefined
  } else if (form.date_mode === 'slight') {
    payload.start_date = form.start_date || undefined
    payload.flex_days = form.flex_days ? Number(form.flex_days) : undefined
  }
  if (form.destination_mode === 'decided') {
    payload.destination = form.destination || undefined
  }
  const trip = await store.createTrip(payload)
  if (form.date_mode === 'broad' && windows.value.length) {
    await store.saveWindows(trip.id, windows.value)
  }
  router.push({ name: 'trip', params: { id: trip.id } })
}
</script>

<template>
  <form class="trip-wizard card" @submit.prevent="submit">
    <div class="wizard-steps">
      <span :class="['badge', step === 1 ? 'badge-ok' : '']">1. Basics</span>
      <span :class="['badge', step === 2 ? 'badge-ok' : '']">2. Dates</span>
      <span :class="['badge', step === 3 ? 'badge-ok' : '']">3. Destination</span>
      <span :class="['badge', step === 4 ? 'badge-ok' : '']">4. Participants</span>
    </div>

    <div v-if="step === 1">
      <div class="field"><label for="w-name">Name</label><input id="w-name" v-model="form.name" required /></div>
      <div class="field"><label for="w-desc">Description</label><textarea id="w-desc" v-model="form.description"></textarea></div>
      <div class="field"><label for="w-origin">Origin city</label><input id="w-origin" v-model="form.origin_city" /></div>
      <div class="field"><label for="w-vibe">Vibe tags (comma-separated)</label><input id="w-vibe" v-model="form.vibe_tags" placeholder="beach, relaxed" /></div>
    </div>

    <div v-else-if="step === 2">
      <div class="field">
        <label>Date mode</label>
        <label><input type="radio" value="confirmed" v-model="form.date_mode" /> Confirmed</label>
        <label><input type="radio" value="slight" v-model="form.date_mode" /> Slight flex</label>
        <label><input type="radio" value="broad" v-model="form.date_mode" /> Broad</label>
      </div>
      <template v-if="form.date_mode === 'confirmed'">
        <div class="field"><label for="w-start">Start date</label><input id="w-start" type="date" v-model="form.start_date" /></div>
        <div class="field"><label for="w-end">End date</label><input id="w-end" type="date" v-model="form.end_date" /></div>
      </template>
      <template v-else-if="form.date_mode === 'slight'">
        <div class="field"><label for="w-anchor">Anchor date</label><input id="w-anchor" type="date" v-model="form.start_date" /></div>
        <div class="field"><label for="w-flex">Flex days</label><input id="w-flex" type="number" v-model="form.flex_days" /></div>
      </template>
      <template v-else>
        <DateWindowsEditor :windows="windows" @save="onWindowsSave" />
      </template>
    </div>

    <div v-else-if="step === 3">
      <div class="field">
        <label>Destination mode</label>
        <label><input type="radio" value="decided" v-model="form.destination_mode" /> Decided</label>
        <label><input type="radio" value="open" v-model="form.destination_mode" /> Open</label>
      </div>
      <div class="field" v-if="form.destination_mode === 'decided'">
        <label for="w-destination">Destination</label>
        <input id="w-destination" v-model="form.destination" />
      </div>
    </div>

    <div v-else-if="step === 4">
      <p>Select participants:</p>
      <ul class="wizard-participants">
        <li v-for="p in people.people" :key="p.id">
          <label>
            <input type="checkbox" :checked="form.participant_ids.includes(p.id)" @change="toggleParticipant(p.id)" />
            {{ p.name }}
          </label>
        </li>
      </ul>
      <RouterLink to="/people" class="btn">Add new person</RouterLink>
    </div>

    <div v-if="store.error" class="card wizard-error">{{ store.error }}</div>

    <div class="wizard-nav">
      <button type="button" class="btn" v-if="step > 1" @click="back">Back</button>
      <button type="button" class="btn" v-if="step < 4" @click="next">Next</button>
      <button type="submit" class="btn btn-primary" v-if="step === 4">Create trip</button>
    </div>
  </form>
</template>

<style scoped>
.wizard-steps { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.wizard-nav { display: flex; gap: 0.5rem; margin-top: 1rem; }
.wizard-participants { list-style: none; padding: 0; }
.wizard-error { border-color: #fca5a5; color: #7f1d1d; }
</style>
