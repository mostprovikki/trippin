<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { useArchiveStore } from '../stores/archive.js'
import { useNotify } from '../composables/useNotify.js'

const route = useRoute()
const router = useRouter()
const tripId = route.params.id
const store = useArchiveStore()
const confirm = useConfirm()
const notify = useNotify()

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

function doArchive() {
  confirm.require({
    message: 'Archive this trip? This will lock editing and revoke all participant links.',
    header: 'Archive trip', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Archive', acceptClass: 'p-button-danger', rejectLabel: 'Cancel',
    accept: async () => {
      try {
        await store.archive(tripId, { notes: notesDraft.value || null, photo_links: [] })
        syncDraftsFromStore()
        notify.success('Trip archived')
      } catch (e) { notify.error(e.message) }
    }
  })
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

const cloneName = ref('')
async function cloneTrip() {
  if (!cloneName.value.trim()) return
  try {
    const newId = await store.clone(tripId, cloneName.value.trim())
    notify.success('Trip cloned')
    router.push(`/trips/${newId}`)
  } catch (e) { notify.error(e.message) }
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
        <div class="field">
          <label for="clone-name">Name for the new trip</label>
          <InputText id="clone-name" v-model="cloneName" fluid />
        </div>
        <Button label="Clone trip" :disabled="!cloneName.trim()" @click="cloneTrip" />
      </div>
    </template>
  </main>
</template>
