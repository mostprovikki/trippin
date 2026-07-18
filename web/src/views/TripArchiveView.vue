<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useArchiveStore } from '../stores/archive.js'

const route = useRoute()
const router = useRouter()
const tripId = route.params.id
const store = useArchiveStore()

const loading = ref(true)
const isArchived = computed(() => !!store.snapshot)

const notesDraft = ref('')
const photoLinksDraft = ref('')
const actualsDraft = ref([])

function syncDraftsFromStore() {
  notesDraft.value = store.notes || ''
  photoLinksDraft.value = (store.photo_links || []).join('\n')
  const byCategory = Object.fromEntries((store.actuals || []).map((a) => [a.category, a.amount]))
  const categories = (store.snapshot?.budget?.lines || []).map((l) => l.category)
  actualsDraft.value = categories.map((category) => ({ category, amount: byCategory[category] ?? 0 }))
}

onMounted(async () => {
  try {
    await store.fetchArchive(tripId)
    syncDraftsFromStore()
  } catch (e) {
    if (e.code !== 'NOT_ARCHIVED') throw e
  } finally {
    loading.value = false
  }
})

async function doArchive() {
  if (!confirm('Archive this trip? This will lock editing and revoke all participant links.')) return
  await store.archive(tripId, { notes: notesDraft.value || null, photo_links: [] })
  syncDraftsFromStore()
}

async function saveMeta() {
  const photo_links = photoLinksDraft.value.split('\n').map((l) => l.trim()).filter(Boolean)
  await store.saveArchiveMeta(tripId, { notes: notesDraft.value || null, photo_links })
  syncDraftsFromStore()
}

async function saveActuals() {
  const actuals = actualsDraft.value.map((a) => ({ category: a.category, amount: Number(a.amount) || 0 }))
  await store.saveActuals(tripId, actuals)
}

async function cloneTrip() {
  const name = prompt('Name for the new trip:')
  if (!name) return
  const newId = await store.clone(tripId, name)
  router.push(`/trips/${newId}`)
}
</script>

<template>
  <main class="page">
    <h1>Trip Archive</h1>

    <div v-if="store.error" class="card">{{ store.error }}</div>

    <div v-if="loading" class="card">Loading…</div>

    <div v-else-if="!isArchived" class="card">
      <h2>Archive this trip</h2>
      <p>Archiving locks the trip, snapshots the budget/itinerary/checklists, and revokes all participant links.</p>
      <div class="field">
        <label>Notes</label>
        <textarea v-model="notesDraft" rows="4"></textarea>
      </div>
      <button type="button" class="btn btn-primary" @click="doArchive">Archive trip</button>
    </div>

    <template v-else>
      <div class="card">
        <h2>Archived</h2>
        <p>Archived at: {{ store.archived_at }}</p>
        <p><strong>{{ store.snapshot?.trip?.name }}</strong></p>
      </div>

      <div class="card">
        <h2>Notes &amp; photo links</h2>
        <div class="field">
          <label>Notes</label>
          <textarea v-model="notesDraft" rows="4"></textarea>
        </div>
        <div class="field">
          <label>Photo links (one per line)</label>
          <textarea v-model="photoLinksDraft" rows="4"></textarea>
        </div>
        <button type="button" class="btn btn-primary" @click="saveMeta">Save notes &amp; links</button>
      </div>

      <div class="card">
        <h2>Actuals</h2>
        <table class="table">
          <thead>
            <tr><th>Category</th><th>Estimate</th><th>Actual</th></tr>
          </thead>
          <tbody>
            <tr v-for="(a, idx) in actualsDraft" :key="a.category">
              <td>{{ a.category }}</td>
              <td>{{ store.snapshot?.budget?.lines?.find((l) => l.category === a.category)?.estimate ?? 0 }}</td>
              <td><input type="number" min="0" step="0.01" v-model.number="actualsDraft[idx].amount" /></td>
            </tr>
          </tbody>
        </table>
        <button type="button" class="btn btn-primary" @click="saveActuals">Save actuals</button>
      </div>

      <div class="card">
        <h2>Snapshot summary</h2>
        <p>Itinerary days: {{ store.snapshot?.itinerary?.length ?? 0 }}</p>
        <p>Checklists: {{ store.snapshot?.checklists?.length ?? 0 }}</p>
        <p>Budget total (at archive time): {{ store.snapshot?.budget?.total ?? 0 }}</p>
      </div>

      <div class="card">
        <h2>Clone as new trip</h2>
        <p>Copies vibe, origin city, currency, goals, participants (unconfirmed), budget lines, and checklists — without dates, destination, or itinerary.</p>
        <button type="button" class="btn" @click="cloneTrip">Clone as new trip</button>
      </div>
    </template>
  </main>
</template>
