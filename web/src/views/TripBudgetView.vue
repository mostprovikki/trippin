<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/client.js'
import { useAuthStore } from '../stores/auth.js'
import { useBudgetStore } from '../stores/budget.js'
import BudgetTable from '../components/BudgetTable.vue'

const route = useRoute()
const tripId = route.params.id
const auth = useAuthStore()
const store = useBudgetStore()

const localLines = ref([])
const participants = ref([])
const editableOverrides = ref([])
const newOverride = reactive({ person_id: '', amount: 0, note: '' })

watch(() => store.lines, (lines) => { localLines.value = lines.map((l) => ({ ...l })) }, { immediate: true })
watch(() => store.overrides, (overrides) => { editableOverrides.value = overrides.map((o) => ({ ...o })) }, { immediate: true })

onMounted(async () => {
  try {
    const trip = (await api.get(`/api/trips/${tripId}`)).trip
    participants.value = trip?.participants || []
  } catch { participants.value = [] }
  await store.fetchBudget(tripId)
})

async function saveLines() {
  await store.saveLines(tripId, localLines.value)
}

function addOverrideRow() {
  if (!newOverride.person_id) return
  const person = participants.value.find((p) => p.id === newOverride.person_id)
  editableOverrides.value.push({
    person_id: newOverride.person_id,
    person_name: person?.name || '',
    amount: Number(newOverride.amount) || 0,
    note: newOverride.note
  })
  newOverride.person_id = ''
  newOverride.amount = 0
  newOverride.note = ''
}

function removeOverrideRow(personId) {
  editableOverrides.value = editableOverrides.value.filter((o) => o.person_id !== personId)
}

async function saveOverrides() {
  const overrides = editableOverrides.value.map((o) => ({ person_id: o.person_id, amount: Number(o.amount) || 0, note: o.note }))
  await store.saveOverrides(tripId, overrides)
}

async function runAiDraft() {
  await store.aiDraft(tripId)
}

async function applyDraft() {
  await store.applyDraft(tripId)
}

function discardDraft() {
  store.draft = null
}
</script>

<template>
  <main class="page">
    <h1>Trip Budget</h1>

    <div v-if="store.error" class="card">{{ store.error }}</div>

    <div class="card">
      <h2>Category estimates</h2>
      <BudgetTable v-model="localLines" :draft="store.draft" />
      <p><strong>Total: {{ store.total }}</strong></p>
      <button type="button" class="btn btn-primary" @click="saveLines">Save budget</button>
    </div>

    <div class="card">
      <h2>AI draft</h2>
      <button v-if="auth.aiEnabled" type="button" class="btn" :disabled="store.aiBusy" @click="runAiDraft">
        {{ store.aiBusy ? 'Generating…' : 'AI draft' }}
      </button>
      <p v-else>AI disabled — set LLM_PROVIDER</p>
      <div v-if="store.draft">
        <p>Compare the "AI draft" column above against your estimates, then apply or discard.</p>
        <button type="button" class="btn btn-primary" @click="applyDraft">Apply</button>
        <button type="button" class="btn" @click="discardDraft">Discard</button>
      </div>
    </div>

    <div class="card">
      <h2>Per-person split</h2>
      <p>Participants: {{ store.participant_count }}</p>
      <p>Equal share: {{ store.equal_share }}</p>

      <table class="table">
        <thead>
          <tr><th>Person</th><th>Override amount</th><th>Note</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="o in editableOverrides" :key="o.person_id">
            <td>{{ o.person_name }}</td>
            <td><input type="number" min="0" step="0.01" v-model.number="o.amount" /></td>
            <td><input type="text" v-model="o.note" /></td>
            <td><button type="button" class="btn" @click="removeOverrideRow(o.person_id)">Remove</button></td>
          </tr>
          <tr>
            <td>
              <select v-model="newOverride.person_id">
                <option value="">Select person…</option>
                <option v-for="p in participants" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </td>
            <td><input type="number" min="0" step="0.01" v-model.number="newOverride.amount" /></td>
            <td><input type="text" v-model="newOverride.note" placeholder="Note" /></td>
            <td><button type="button" class="btn" @click="addOverrideRow">Add</button></td>
          </tr>
        </tbody>
      </table>
      <button type="button" class="btn btn-primary" @click="saveOverrides">Save overrides</button>
    </div>
  </main>
</template>
