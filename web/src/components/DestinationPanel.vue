<script setup>
import { reactive } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
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

const form = reactive({ name: '', rationale: '', best_dates: '', est_budget_per_person: '', caveats: '' })

async function suggestWithAi() {
  await store.aiSuggest(props.tripId)
}

async function markDecided(candidateId) {
  await store.decide(candidateId)
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
  await store.addCandidate(props.tripId, {
    name: form.name,
    rationale: form.rationale || undefined,
    best_dates: form.best_dates || undefined,
    est_budget_per_person: form.est_budget_per_person ? Number(form.est_budget_per_person) : undefined,
    caveats: form.caveats || undefined
  })
  form.name = ''; form.rationale = ''; form.best_dates = ''; form.est_budget_per_person = ''; form.caveats = ''
}
</script>

<template>
  <div class="destination-panel">
    <div class="destination-toolbar">
      <button v-if="auth.aiEnabled" type="button" class="btn" :disabled="store.aiBusy" @click="suggestWithAi">
        {{ store.aiBusy ? 'Generating…' : 'Suggest with AI' }}
      </button>
      <span v-else class="badge badge-warn">AI disabled — set LLM_PROVIDER</span>
    </div>

    <div v-if="!candidates.length" class="dest-empty">No destination candidates yet.</div>
    <div v-for="c in candidates" :key="c.id" class="card dest-card">
      <h3>{{ c.name }} <span class="badge" :class="c.source === 'ai' ? 'badge-ok' : ''">{{ c.source }}</span>
        <span v-if="c.decided" class="badge badge-ok">decided</span>
      </h3>
      <p v-if="c.rationale">{{ c.rationale }}</p>
      <p v-if="c.best_dates"><strong>Best dates:</strong> {{ c.best_dates }}</p>
      <p v-if="c.est_budget_per_person != null"><strong>Est. budget/person:</strong> {{ c.est_budget_per_person }}</p>
      <p v-if="c.caveats"><strong>Caveats:</strong> {{ c.caveats }}</p>
      <button type="button" class="btn btn-primary" :disabled="!!c.decided" @click="markDecided(c.id)">Mark decided</button>
      <button type="button" class="btn" :disabled="!!c.decided" @click="removeCandidate(c.id)">Delete</button>
    </div>

    <form class="card dest-add-form" @submit.prevent="submitManual">
      <h3>Add destination candidate</h3>
      <div class="field"><label>Name</label><input v-model="form.name" required /></div>
      <div class="field"><label>Rationale</label><textarea v-model="form.rationale"></textarea></div>
      <div class="field"><label>Best dates</label><input v-model="form.best_dates" /></div>
      <div class="field"><label>Est. budget per person</label><input type="number" v-model="form.est_budget_per_person" /></div>
      <div class="field"><label>Caveats</label><textarea v-model="form.caveats"></textarea></div>
      <button type="submit" class="btn btn-primary">Add candidate</button>
    </form>
  </div>
</template>

<style scoped>
.destination-toolbar { margin-bottom: 1rem; }
.dest-card h3 { margin-top: 0; }
.dest-empty { color: #666; margin-bottom: 1rem; }
</style>
