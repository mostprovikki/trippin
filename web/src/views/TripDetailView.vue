<script setup>
import { reactive, ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTripsStore } from '../stores/trips.js'
import { usePeopleStore } from '../stores/people.js'
import TripTabs from '../components/TripTabs.vue'
import DateWindowsEditor from '../components/DateWindowsEditor.vue'
import GoalsEditor from '../components/GoalsEditor.vue'
import DestinationPanel from '../components/DestinationPanel.vue'

const route = useRoute()
const store = useTripsStore()
const people = usePeopleStore()

const tripId = computed(() => route.params.id)

const basics = reactive({ name: '', description: '', origin_city: '', vibe_tags: '' })
const newParticipantId = ref('')
const revealedLink = ref(null)

const NEXT_STATUS = { idea: { label: 'Plan', target: 'planning' }, planning: { label: 'Confirm', target: 'confirmed' }, confirmed: { label: 'Activate', target: 'active' } }

const nextTransition = computed(() => store.current ? NEXT_STATUS[store.current.status] : null)

const availablePeople = computed(() => {
  if (!store.current) return []
  const memberIds = new Set((store.current.participants || []).map((p) => p.person_id))
  return people.people.filter((p) => !memberIds.has(p.id))
})

function loadBasics(trip) {
  if (!trip) return
  basics.name = trip.name || ''
  basics.description = trip.description || ''
  basics.origin_city = trip.origin_city || ''
  basics.vibe_tags = (trip.vibe_tags || []).join(', ')
}

async function load() {
  await store.fetchTrip(tripId.value)
  loadBasics(store.current)
  await store.fetchCandidates(tripId.value)
  await store.fetchLinks(tripId.value)
  try { await people.fetchPeople() } catch { /* ignore */ }
}

onMounted(load)
watch(tripId, load)

async function saveBasics() {
  try {
    const trip = await store.updateTrip(tripId.value, {
      name: basics.name,
      description: basics.description || null,
      origin_city: basics.origin_city || null,
      vibe_tags: basics.vibe_tags.split(',').map((s) => s.trim()).filter(Boolean)
    })
    loadBasics(trip)
  } catch { /* store.error surfaced below */ }
}

async function advanceStatus() {
  if (!nextTransition.value) return
  try { await store.setStatus(tripId.value, nextTransition.value.target) } catch { /* surfaced via store.error */ }
}

async function onSaveWindows(windows) {
  try { await store.saveWindows(tripId.value, windows) } catch { /* surfaced */ }
}

async function onAddGoal(goal) {
  try { await store.addGoal(tripId.value, goal) } catch { /* surfaced */ }
}
async function onUpdateGoal(goalId, goal) {
  try { await store.updateGoal(goalId, goal) } catch { /* surfaced */ }
}
async function onDeleteGoal(goalId) {
  try { await store.deleteGoal(goalId) } catch { /* surfaced */ }
}

async function addParticipant() {
  if (!newParticipantId.value) return
  try {
    await store.addParticipant(tripId.value, newParticipantId.value)
    newParticipantId.value = ''
  } catch { /* surfaced */ }
}
async function removeParticipant(personId) {
  if (!confirm('Remove this participant?')) return
  try { await store.removeParticipant(tripId.value, personId) } catch { /* surfaced */ }
}

async function createLink(personId) {
  try {
    const result = await store.createLink(tripId.value, personId)
    revealedLink.value = { personId, url: result.url }
    await store.fetchLinks(tripId.value)
  } catch { /* surfaced */ }
}
async function copyLink(url) {
  try { await navigator.clipboard.writeText(location.origin + url) } catch { /* clipboard may be unavailable */ }
}
async function revokeLink(linkId) {
  try { await store.revokeLink(linkId) } catch { /* surfaced */ }
}
function linksFor(personId) {
  return store.links.filter((l) => l.person_id === personId)
}
</script>

<template>
  <main class="page">
    <h1>Trip</h1>
    <TripTabs :trip-id="tripId" />

    <div v-if="store.error" class="card trip-error">{{ store.error }}</div>

    <template v-if="store.current">
      <section class="card">
        <h2>Overview</h2>
        <div class="field"><label for="td-name">Name</label><input id="td-name" v-model="basics.name" /></div>
        <div class="field"><label for="td-desc">Description</label><textarea id="td-desc" v-model="basics.description"></textarea></div>
        <div class="field"><label for="td-origin">Origin city</label><input id="td-origin" v-model="basics.origin_city" /></div>
        <div class="field"><label for="td-vibe">Vibe tags (comma-separated)</label><input id="td-vibe" v-model="basics.vibe_tags" /></div>
        <button type="button" class="btn btn-primary" @click="saveBasics">Save changes</button>
        <p>Status: <span class="badge badge-ok">{{ store.current.status }}</span></p>
        <button v-if="nextTransition" type="button" class="btn" @click="advanceStatus">{{ nextTransition.label }}</button>
      </section>

      <section class="card">
        <h2>Dates</h2>
        <DateWindowsEditor :windows="store.current.windows" @save="onSaveWindows" />
      </section>

      <section class="card">
        <h2>Goals</h2>
        <GoalsEditor :goals="store.current.goals" @add="onAddGoal" @update="onUpdateGoal" @delete="onDeleteGoal" />
      </section>

      <section class="card">
        <h2>Destination</h2>
        <DestinationPanel :trip-id="tripId" :candidates="store.candidates" />
      </section>

      <section class="card">
        <h2>Participants</h2>
        <ul class="participants-list">
          <li v-for="p in store.current.participants" :key="p.person_id" class="participant-row">
            <span>{{ p.name }}</span>
            <button type="button" class="btn" @click="removeParticipant(p.person_id)">Remove</button>
            <button type="button" class="btn" @click="createLink(p.person_id)">Create link</button>
            <div v-if="revealedLink && revealedLink.personId === p.person_id" class="card link-reveal">
              <p><strong>Shown only once — copy it now:</strong></p>
              <code>{{ location.origin + revealedLink.url }}</code>
              <button type="button" class="btn" @click="copyLink(revealedLink.url)">Copy</button>
            </div>
            <ul class="links-list">
              <li v-for="link in linksFor(p.person_id)" :key="link.id">
                created {{ link.created_at }}
                <span v-if="link.revoked_at" class="badge badge-warn">revoked</span>
                <button v-else type="button" class="btn" @click="revokeLink(link.id)">Revoke</button>
              </li>
            </ul>
          </li>
        </ul>
        <div class="field">
          <label for="td-add-participant">Add participant</label>
          <select id="td-add-participant" v-model="newParticipantId">
            <option value="">Select person…</option>
            <option v-for="p in availablePeople" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <button type="button" class="btn btn-primary" @click="addParticipant">Add</button>
      </section>
    </template>
  </main>
</template>

<style scoped>
.trip-error { border-color: #fca5a5; color: #7f1d1d; }
.participants-list { list-style: none; padding: 0; }
.participant-row { border-bottom: 1px solid #e2e2e2; padding: 0.5rem 0; }
.link-reveal { margin-top: 0.5rem; }
.links-list { list-style: none; padding: 0; }
</style>
