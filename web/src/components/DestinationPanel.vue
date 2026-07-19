<script setup>
import { reactive } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import InputNumber from 'primevue/inputnumber'
import { useTripsStore } from '../stores/trips.js'
import { useAuthStore } from '../stores/auth.js'
import { useNotify } from '../composables/useNotify.js'

const props = defineProps({
  tripId: { type: String, required: true },
  candidates: { type: Array, default: () => [] }
})

const store = useTripsStore()
const auth = useAuthStore()
const confirm = useConfirm()
const notify = useNotify()

const form = reactive({ name: '', rationale: '', best_dates: '', est_budget_per_person: null, caveats: '' })

async function suggestWithAi() {
  try { await store.aiSuggest(props.tripId) } catch (e) { notify.error(e.message) }
}

async function markDecided(candidateId) {
  try { await store.decide(candidateId) } catch (e) { notify.error(e.message) }
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
  try {
    await store.addCandidate(props.tripId, {
      name: form.name,
      rationale: form.rationale || undefined,
      best_dates: form.best_dates || undefined,
      est_budget_per_person: form.est_budget_per_person ? Number(form.est_budget_per_person) : undefined,
      caveats: form.caveats || undefined
    })
    form.name = ''; form.rationale = ''; form.best_dates = ''; form.est_budget_per_person = null; form.caveats = ''
  } catch (e) { notify.error(e.message) }
}
</script>

<template>
  <div class="destination-panel">
    <div class="destination-toolbar">
      <Button v-if="auth.aiEnabled" type="button" severity="secondary" outlined :loading="store.aiBusy" @click="suggestWithAi">
        {{ store.aiBusy ? 'Generating…' : 'Suggest with AI' }}
      </Button>
      <Tag v-else severity="warn" value="AI disabled — set LLM_PROVIDER" />
    </div>

    <div v-if="!candidates.length" class="dest-empty">No destination candidates yet.</div>
    <div v-for="c in candidates" :key="c.id" class="card dest-card">
      <h3>{{ c.name }}
        <Tag :severity="c.source === 'ai' ? 'success' : 'secondary'" :value="c.source" />
        <Tag v-if="c.decided" severity="success" value="decided" />
      </h3>
      <p v-if="c.rationale">{{ c.rationale }}</p>
      <p v-if="c.best_dates"><strong>Best dates:</strong> {{ c.best_dates }}</p>
      <p v-if="c.est_budget_per_person != null"><strong>Est. budget/person:</strong> {{ c.est_budget_per_person }}</p>
      <p v-if="c.caveats"><strong>Caveats:</strong> {{ c.caveats }}</p>
      <Button type="button" label="Mark decided" :disabled="!!c.decided" @click="markDecided(c.id)" />
      <Button type="button" label="Delete" severity="danger" outlined :disabled="!!c.decided" @click="removeCandidate(c.id)" />
    </div>

    <form class="card dest-add-form" @submit.prevent="submitManual">
      <h3>Add destination candidate</h3>
      <div class="field"><label>Name</label><InputText v-model="form.name" required fluid /></div>
      <div class="field"><label>Rationale</label><Textarea v-model="form.rationale" fluid auto-resize /></div>
      <div class="field"><label>Best dates</label><InputText v-model="form.best_dates" fluid /></div>
      <div class="field"><label>Est. budget per person</label><InputNumber v-model="form.est_budget_per_person" fluid /></div>
      <div class="field"><label>Caveats</label><Textarea v-model="form.caveats" fluid auto-resize /></div>
      <Button type="submit" label="Add candidate" />
    </form>
  </div>
</template>

<style scoped>
.destination-toolbar { margin-bottom: 1rem; }
.dest-card h3 { margin-top: 0; display: flex; align-items: center; gap: 0.5rem; }
.dest-empty { color: #666; margin-bottom: 1rem; }
</style>
