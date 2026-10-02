<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import InputNumber from 'primevue/inputnumber'
import Menu from 'primevue/menu'
import PromptPasteDialog from './PromptPasteDialog.vue'
import { useTripsStore } from '../stores/trips.js'
import { formatMoney } from '../utils/format.js'
import { useAiStatus } from '../composables/useAiStatus.js'
import { useNotify } from '../composables/useNotify.js'

const props = defineProps({
  tripId: { type: String, required: true },
  candidates: { type: Array, default: () => [] }
})

const store = useTripsStore()
const aiStatus = useAiStatus()
const confirm = useConfirm()
const notify = useNotify()

const form = reactive({ name: '', rationale: '', best_dates: '', est_budget_per_person: null, caveats: '' })

function resetForm() {
  form.name = ''
  form.rationale = ''
  form.best_dates = ''
  form.est_budget_per_person = null
  form.caveats = ''
}

// The panel is reused when the parent moves between trips, so a half-typed
// candidate would otherwise survive the jump and be submitted against whichever
// trip you landed on.
watch(() => props.tripId, resetForm)

async function suggestWithAi() {
  try { await store.aiSuggest(props.tripId) } catch (e) { notify.error(e.message) }
}

// AI actions sit under ⋯, never as buttons at rest (docs/design/tripper.md §5).
const moreMenu = ref(null)
const moreItems = computed(() => [
  {
    // A disabled menu item shows no tooltip, so the reason goes in the label.
    label: (store.aiBusy ? 'Generating…' : 'Suggest with AI')
      + (!aiStatus.enabled ? ' · AI not configured' : aiStatus.isMock ? ' · AI: dev mock' : ''),
    icon: 'pi pi-sparkles',
    disabled: !aiStatus.enabled || store.aiBusy,
    command: suggestWithAi
  },
  // BYO-AI: always offered, provider or not (trip-planner-d5d).
  { label: 'Draft with your own AI…', icon: 'pi pi-clipboard', command: () => { pasteOpen.value = true } }
])
const pasteOpen = ref(false)
// The import already saved the candidates server-side (same as the provider
// path), so just reload the list.
async function onPasted() {
  try { await store.fetchCandidates(props.tripId) } catch (e) { notify.error(e.message) }
}

function markDecided(candidateId, name) {
  confirm.require({
    message: `Make "${name}" the trip destination? Other candidates stay listed.`,
    header: 'Set destination?', icon: 'pi pi-info-circle',
    acceptLabel: 'Mark decided', rejectLabel: 'Cancel',
    accept: async () => {
      try { await store.decide(candidateId) } catch (e) { notify.error(e.message) }
    }
  })
}

function removeCandidate(candidateId) {
  confirm.require({
    message: 'Delete this candidate?', header: 'Delete candidate', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Delete', acceptClass: 'p-button-danger', rejectLabel: 'Cancel',
    accept: async () => { try { await store.deleteCandidate(candidateId) } catch (e) { notify.error(e.message) } }
  })
}

async function submitManual() {
  if (!form.name) return
  // Captured before the await: if the user moves to another trip while this is
  // in flight, the store correctly refuses to list the new row here — it belongs
  // to the trip they left. Silence would then read as "my candidate vanished",
  // so say where it went. Mirrors reportOffScreenCreate in TripChecklistsView.
  const target = props.tripId
  try {
    await store.addCandidate(target, {
      name: form.name,
      rationale: form.rationale || undefined,
      best_dates: form.best_dates || undefined,
      est_budget_per_person: form.est_budget_per_person ? Number(form.est_budget_per_person) : undefined,
      caveats: form.caveats || undefined
    })
    resetForm()
    if (store.lastTripId !== target) notify.success('Candidate added to the trip you started from.')
  } catch (e) { notify.error(e.message) }
}
</script>

<template>
  <div class="destination-panel">
    <div class="destination-toolbar">
      <Button
        type="button" icon="pi pi-ellipsis-h" severity="secondary" text rounded
        aria-label="More destination actions" aria-haspopup="true" aria-controls="destination-more-menu"
        @click="moreMenu.toggle($event)"
      />
      <Menu id="destination-more-menu" ref="moreMenu" :model="moreItems" popup />
      <PromptPasteDialog
        v-model:visible="pasteOpen" header="Suggest destinations with your own AI"
        :prompt-url="`/api/trips/${tripId}/candidates/ai-suggest/prompt`" :import-url="`/api/trips/${tripId}/candidates/ai-suggest/import`"
        @imported="onPasted"
      />
    </div>

    <div v-if="!candidates.length" class="dest-empty">No destination candidates yet.</div>
    <div v-for="c in candidates" :key="c.id" class="card dest-card">
      <h3>{{ c.name }}
        <Tag :severity="c.source === 'ai' ? 'success' : 'secondary'" :value="c.source" />
        <Tag v-if="c.decided" severity="success" value="decided" />
      </h3>
      <p v-if="c.rationale">{{ c.rationale }}</p>
      <p v-if="c.best_dates"><strong>Best dates:</strong> {{ c.best_dates }}</p>
      <p v-if="c.est_budget_per_person != null"><strong>Est. budget/person:</strong> {{ formatMoney(c.est_budget_per_person, store.current?.currency) }}</p>
      <p v-if="c.caveats"><strong>Caveats:</strong> {{ c.caveats }}</p>
      <Button type="button" label="Mark decided" :disabled="!!c.decided" @click="markDecided(c.id, c.name)" />
      <Button type="button" icon="pi pi-trash" severity="secondary" text rounded class="icon-danger-btn" :aria-label="`Delete ${c.name}`" :disabled="!!c.decided" @click="removeCandidate(c.id)" />
    </div>

    <form class="card dest-add-form" @submit.prevent="submitManual">
      <h3>Add destination candidate</h3>
      <div class="field"><label>Name</label><InputText id="dest-name" name="dest-name" v-model="form.name" required fluid /></div>
      <div class="field"><label>Rationale</label><Textarea v-model="form.rationale" fluid auto-resize /></div>
      <div class="field"><label>Best dates</label><InputText id="dest-best-dates" name="dest-best-dates" v-model="form.best_dates" fluid /></div>
      <div class="field"><label>Est. budget per person</label><InputNumber input-id="dest-budget-per-person" name="dest-budget-per-person" v-model="form.est_budget_per_person" fluid /></div>
      <div class="field"><label>Caveats</label><Textarea v-model="form.caveats" fluid auto-resize /></div>
      <Button type="submit" label="Add candidate" />
    </form>
  </div>
</template>

<style scoped>
.destination-toolbar { display: flex; justify-content: flex-end; margin-bottom: 1rem; }
.dest-card h3 { margin-top: 0; display: flex; align-items: center; gap: 0.5rem; }
.dest-empty { color: var(--app-text-muted); margin-bottom: 1rem; }
</style>
