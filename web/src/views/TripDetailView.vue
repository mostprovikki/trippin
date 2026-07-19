<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { useTripsStore } from '../stores/trips.js'
import { usePeopleStore } from '../stores/people.js'
import TripTabs from '../components/TripTabs.vue'
import DateWindowsEditor from '../components/DateWindowsEditor.vue'
import GoalsEditor from '../components/GoalsEditor.vue'
import DestinationPanel from '../components/DestinationPanel.vue'
import { useDraft, confirmDiscard } from '../composables/useDraft.js'
import { useNotify } from '../composables/useNotify.js'

const route = useRoute()
const store = useTripsStore()
const people = usePeopleStore()

const tripId = computed(() => route.params.id)

const confirm = useConfirm()
const notify = useNotify()
const loading = ref(true)
const basicsDraft = useDraft(`trip:${route.params.id}:basics`, () => ({ name: '', description: '', origin_city: '', vibe_tags: '' }))
const basics = basicsDraft.draft
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
  basicsDraft.load({
    name: trip.name || '',
    description: trip.description || '',
    origin_city: trip.origin_city || '',
    vibe_tags: (trip.vibe_tags || []).join(', ')
  })
}

async function load() {
  loading.value = true
  try {
    await store.fetchTrip(tripId.value)
    loadBasics(store.current)
    await store.fetchCandidates(tripId.value)
    await store.fetchLinks(tripId.value)
    try { await people.fetchPeople() } catch { /* non-critical */ }
  } catch (e) {
    notify.error(e.message)
  } finally {
    loading.value = false
  }
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
    basicsDraft.clear()
    notify.success('Trip saved')
  } catch (e) {
    notify.error(e.message)
  }
}

onBeforeRouteLeave(async () => {
  if (!basicsDraft.isDirty.value) return true
  const ok = await confirmDiscard(confirm)
  if (ok) basicsDraft.clear()
  return ok
})

async function advanceStatus() {
  if (!nextTransition.value) return
  try { await store.setStatus(tripId.value, nextTransition.value.target) } catch (e) { notify.error(e.message) }
}

async function onSaveWindows(windows) {
  try { await store.saveWindows(tripId.value, windows) } catch (e) { notify.error(e.message) }
}

async function onAddGoal(goal) {
  try { await store.addGoal(tripId.value, goal) } catch (e) { notify.error(e.message) }
}
async function onUpdateGoal(goalId, goal) {
  try { await store.updateGoal(goalId, goal) } catch (e) { notify.error(e.message) }
}
async function onDeleteGoal(goalId) {
  try { await store.deleteGoal(goalId) } catch (e) { notify.error(e.message) }
}

async function addParticipant() {
  if (!newParticipantId.value) return
  try {
    await store.addParticipant(tripId.value, newParticipantId.value)
    newParticipantId.value = ''
  } catch (e) { notify.error(e.message) }
}
function removeParticipant(personId) {
  confirm.require({
    message: 'Remove this participant?',
    header: 'Remove participant',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Remove',
    acceptClass: 'p-button-danger',
    rejectLabel: 'Cancel',
    accept: async () => {
      try { await store.removeParticipant(tripId.value, personId) } catch (e) { notify.error(e.message) }
    }
  })
}

async function createLink(personId) {
  try {
    const result = await store.createLink(tripId.value, personId)
    revealedLink.value = { personId, url: result.url }
    await store.fetchLinks(tripId.value)
  } catch (e) { notify.error(e.message) }
}
async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(location.origin + url)
    notify.success('Link copied')
  } catch {
    notify.error('Could not access clipboard — copy the link manually')
  }
}
async function revokeLink(linkId) {
  try { await store.revokeLink(linkId) } catch (e) { notify.error(e.message) }
}
function linksFor(personId) {
  return store.links.filter((l) => l.person_id === personId)
}
</script>

<template>
  <main class="page">
    <h1>
      {{ store.current?.name || 'Trip' }}
      <Tag v-if="store.current" :value="store.current.status" severity="info" />
    </h1>
    <TripTabs :trip-id="tripId" />

    <ProgressSpinner v-if="loading && !store.current" style="width: 2.5rem; height: 2.5rem" />

    <template v-if="store.current">
      <section class="card">
        <h2>Overview</h2>
        <div class="field"><label for="td-name">Name</label><input id="td-name" v-model="basics.name" /></div>
        <div class="field"><label for="td-desc">Description</label><textarea id="td-desc" v-model="basics.description"></textarea></div>
        <div class="field"><label for="td-origin">Origin city</label><input id="td-origin" v-model="basics.origin_city" /></div>
        <div class="field"><label for="td-vibe">Vibe tags (comma-separated)</label><input id="td-vibe" v-model="basics.vibe_tags" /></div>
        <Button label="Save changes" @click="saveBasics" />
        <p>Status: <span class="badge badge-ok">{{ store.current.status }}</span></p>
        <Button v-if="nextTransition" :label="nextTransition.label" severity="secondary" outlined @click="advanceStatus" />
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
.participants-list { list-style: none; padding: 0; }
.participant-row { border-bottom: 1px solid #e2e2e2; padding: 0.5rem 0; }
.link-reveal { margin-top: 0.5rem; }
.links-list { list-style: none; padding: 0; }
</style>
