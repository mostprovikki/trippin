<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useTripsStore } from '../../stores/trips.js'
import { useArchiveStore } from '../../stores/archive.js'
import { useDraft, confirmDiscard } from '../../composables/useDraft.js'
import { useNotify } from '../../composables/useNotify.js'
import SectionHeader from '../../components/SectionHeader.vue'

const route = useRoute()
const router = useRouter()
const trips = useTripsStore()
const archiveStore = useArchiveStore()
const confirm = useConfirm()
const notify = useNotify()

const tripId = computed(() => route.params.id)

// --- Basics (draft key unchanged from the old TripDetailView) ---
const basicsDraft = useDraft(`trip:${route.params.id}:basics`, () => ({ name: '', description: '', origin_city: '', vibe_tags: '' }))
const basics = basicsDraft.draft

function loadBasics(trip) {
  if (!trip) return
  basicsDraft.load({
    name: trip.name || '',
    description: trip.description || '',
    origin_city: trip.origin_city || '',
    vibe_tags: (trip.vibe_tags || []).join(', ')
  })
}
watch(() => trips.current, loadBasics, { immediate: true })

async function saveBasics() {
  try {
    const trip = await trips.updateTrip(tripId.value, {
      name: basics.name,
      description: basics.description || null,
      origin_city: basics.origin_city || null,
      vibe_tags: basics.vibe_tags.split(',').map((s) => s.trim()).filter(Boolean)
    })
    loadBasics(trip)
    basicsDraft.clear()
    notify.success('Trip saved')
  } catch (e) { notify.error(e.message) }
}

onBeforeRouteLeave(async () => {
  if (!basicsDraft.isDirty.value) return true
  const ok = await confirmDiscard(confirm)
  if (ok) basicsDraft.clear()
  return ok
})

// --- Status lifecycle ---
const NEXT_STATUS = {
  idea: { label: 'Start planning', target: 'planning' },
  planning: { label: 'Confirm trip', target: 'confirmed' },
  confirmed: { label: 'Activate', target: 'active' }
}
const nextTransition = computed(() => trips.current ? NEXT_STATUS[trips.current.status] : null)

async function advanceStatus() {
  if (!nextTransition.value) return
  try { await trips.setStatus(tripId.value, nextTransition.value.target) } catch (e) { notify.error(e.message) }
}

// --- Archive / clone (ported from TripArchiveView) ---
const archiveLoading = ref(true)
const isArchived = computed(() => !!archiveStore.snapshot)
const notesDraft = ref('')
const photoLinksDraft = ref('')
const actualsDraft = ref([])
const cloneName = ref('')

function syncDraftsFromStore() {
  notesDraft.value = archiveStore.notes || ''
  photoLinksDraft.value = (archiveStore.photo_links || []).join('\n')
  const byCategory = Object.fromEntries((archiveStore.actuals || []).map((a) => [a.category, a.amount]))
  const categories = (archiveStore.snapshot?.budget?.lines || []).map((l) => l.category)
  actualsDraft.value = categories.map((category) => ({ category, amount: byCategory[category] ?? 0 }))
}

onMounted(async () => {
  try {
    await archiveStore.fetchArchive(tripId.value)
    syncDraftsFromStore()
  } catch (e) {
    if (e.code !== 'NOT_ARCHIVED') notify.error(e.message)
  } finally {
    archiveLoading.value = false
  }
})

function doArchive() {
  confirm.require({
    message: 'Archive this trip? This will lock editing and revoke all participant links.',
    header: 'Archive trip', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Archive', acceptClass: 'p-button-danger', rejectLabel: 'Cancel',
    accept: async () => {
      try {
        await archiveStore.archive(tripId.value, { notes: notesDraft.value || null, photo_links: [] })
        syncDraftsFromStore()
        notify.success('Trip archived')
      } catch (e) { notify.error(e.message) }
    }
  })
}

async function saveMeta() {
  try {
    const photo_links = photoLinksDraft.value.split('\n').map((l) => l.trim()).filter(Boolean)
    await archiveStore.saveArchiveMeta(tripId.value, { notes: notesDraft.value || null, photo_links })
    syncDraftsFromStore()
    notify.success('Notes saved')
  } catch (e) { notify.error(e.message) }
}

async function saveActuals() {
  try {
    const actuals = actualsDraft.value.map((a) => ({ category: a.category, amount: Number(a.amount) || 0 }))
    await archiveStore.saveActuals(tripId.value, actuals)
    notify.success('Actuals saved')
  } catch (e) { notify.error(e.message) }
}

async function cloneTrip() {
  if (!cloneName.value.trim()) return
  try {
    const newId = await archiveStore.clone(tripId.value, cloneName.value.trim())
    notify.success('Trip cloned')
    router.push({ name: 'trip-overview', params: { id: newId } })
  } catch (e) { notify.error(e.message) }
}
</script>

<template>
  <div>
    <SectionHeader title="Settings" description="Trip basics, lifecycle, archive and clone." />

    <section class="card">
      <h2>Basics</h2>
      <div class="field"><label for="ts-name">Name</label><InputText id="ts-name" v-model="basics.name" fluid /></div>
      <div class="field"><label for="ts-desc">Description</label><Textarea id="ts-desc" v-model="basics.description" rows="3" fluid /></div>
      <div class="field"><label for="ts-origin">Origin city</label><InputText id="ts-origin" v-model="basics.origin_city" fluid /></div>
      <div class="field"><label for="ts-vibe">Vibe tags (comma-separated)</label><InputText id="ts-vibe" v-model="basics.vibe_tags" fluid /></div>
      <Button label="Save changes" :disabled="!basicsDraft.isDirty.value" @click="saveBasics" />
    </section>

    <section class="card">
      <h2>Status</h2>
      <p>
        Current: <Tag :value="trips.current?.status || '…'" severity="info" />
      </p>
      <p class="muted">Lifecycle: idea → planning → confirmed → active → archived. Confirming locks dates for participants; archiving (below) snapshots everything and revokes links.</p>
      <Button v-if="nextTransition" :label="nextTransition.label" outlined @click="advanceStatus" />
    </section>

    <section v-if="!archiveLoading && !isArchived" class="card">
      <h2>Archive</h2>
      <p class="muted">Archiving locks the trip, snapshots the budget/itinerary/checklists, and revokes all participant links.</p>
      <div class="field"><label for="ts-arch-notes">Notes</label><Textarea id="ts-arch-notes" v-model="notesDraft" rows="3" fluid /></div>
      <Button label="Archive trip" severity="danger" outlined icon="pi pi-box" @click="doArchive" />
    </section>

    <template v-if="isArchived">
      <section class="card">
        <h2>Archived</h2>
        <p>Archived at: {{ archiveStore.archived_at }}</p>
        <div class="field"><label for="ts-notes">Notes</label><Textarea id="ts-notes" v-model="notesDraft" rows="3" fluid /></div>
        <div class="field"><label for="ts-photos">Photo links (one per line)</label><Textarea id="ts-photos" v-model="photoLinksDraft" rows="3" fluid /></div>
        <Button label="Save notes & links" @click="saveMeta" />
      </section>

      <section class="card">
        <h2>Actuals</h2>
        <div v-for="(a, idx) in actualsDraft" :key="a.category" class="actual-row">
          <span class="actual-cat">{{ a.category }}</span>
          <span class="muted">est. {{ archiveStore.snapshot?.budget?.lines?.find((l) => l.category === a.category)?.estimate ?? 0 }}</span>
          <InputNumber v-model="actualsDraft[idx].amount" :min="0" :max-fraction-digits="2" />
        </div>
        <Button label="Save actuals" @click="saveActuals" />
      </section>

      <section class="card">
        <h2>Snapshot</h2>
        <p>Itinerary days: {{ archiveStore.snapshot?.itinerary?.length ?? 0 }}</p>
        <p>Checklists: {{ archiveStore.snapshot?.checklists?.length ?? 0 }}</p>
        <p>Budget total at archive time: {{ archiveStore.snapshot?.budget?.total ?? 0 }}</p>
      </section>
    </template>

    <section class="card">
      <h2>Clone as new trip</h2>
      <p class="muted">Copies vibe, origin city, currency, goals, participants (unconfirmed), budget lines, and checklists — without dates, destination, or itinerary.</p>
      <div class="field"><label for="ts-clone">Name for the new trip</label><InputText id="ts-clone" v-model="cloneName" fluid /></div>
      <Button label="Clone trip" icon="pi pi-clone" :disabled="!cloneName.trim()" @click="cloneTrip" />
    </section>
  </div>
</template>

<style scoped>
.muted { color: var(--app-text-muted); font-size: 0.875rem; }
.actual-row { display: flex; align-items: center; gap: 1rem; padding: 0.375rem 0; }
.actual-cat { min-width: 8rem; font-weight: 500; }
</style>
