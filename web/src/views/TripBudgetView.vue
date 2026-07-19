<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import { api } from '../api/client.js'
import { useAuthStore } from '../stores/auth.js'
import { useBudgetStore } from '../stores/budget.js'
import { useDraft, confirmDiscard } from '../composables/useDraft.js'
import { useNotify } from '../composables/useNotify.js'
import BudgetTable from '../components/BudgetTable.vue'

const route = useRoute()
const tripId = route.params.id
const auth = useAuthStore()
const store = useBudgetStore()
const confirm = useConfirm()
const notify = useNotify()

const loading = ref(true)
const tripName = ref('')
const participants = ref([])
const newOverride = reactive({ person_id: '', amount: 0, note: '' })

const linesDraft = useDraft(`trip:${tripId}:budget-lines`, () => ({ lines: [] }))
const overridesDraft = useDraft(`trip:${tripId}:budget-overrides`, () => ({ overrides: [] }))

watch(() => store.lines, (lines) => { linesDraft.load({ lines: lines.map((l) => ({ ...l })) }) }, { immediate: true })
watch(() => store.overrides, (overrides) => { overridesDraft.load({ overrides: overrides.map((o) => ({ ...o })) }) }, { immediate: true })

onMounted(async () => {
  try {
    const trip = (await api.get(`/api/trips/${tripId}`)).trip
    participants.value = trip?.participants || []
    tripName.value = trip?.name || ''
  } catch { participants.value = [] }
  try { await store.fetchBudget(tripId) } catch (e) { notify.error(e.message) } finally { loading.value = false }
})

async function saveLines() {
  try {
    await store.saveLines(tripId, linesDraft.draft.lines)
    linesDraft.clear()
    notify.success('Budget saved')
  } catch (e) { notify.error(e.message) }
}

function addOverrideRow() {
  if (!newOverride.person_id) return
  const person = participants.value.find((p) => p.id === newOverride.person_id)
  overridesDraft.draft.overrides.push({
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
  overridesDraft.draft.overrides = overridesDraft.draft.overrides.filter((o) => o.person_id !== personId)
}

async function saveOverrides() {
  try {
    const overrides = overridesDraft.draft.overrides.map((o) => ({ person_id: o.person_id, amount: Number(o.amount) || 0, note: o.note }))
    await store.saveOverrides(tripId, overrides)
    overridesDraft.clear()
    notify.success('Overrides saved')
  } catch (e) { notify.error(e.message) }
}

async function runAiDraft() {
  try { await store.aiDraft(tripId) } catch (e) { notify.error(e.message) }
}

async function applyDraft() {
  try { await store.applyDraft(tripId); notify.success('AI draft applied') } catch (e) { notify.error(e.message) }
}

function discardDraft() {
  store.draft = null
}

onBeforeRouteLeave(async () => {
  if (!linesDraft.isDirty.value && !overridesDraft.isDirty.value) return true
  const ok = await confirmDiscard(confirm)
  if (ok) { linesDraft.clear(); overridesDraft.clear() }
  return ok
})
</script>

<template>
  <main class="page">
    <h1>{{ tripName || 'Trip' }} — Budget</h1>

    <div v-if="loading" class="card"><Skeleton v-for="i in 4" :key="i" height="1.5rem" style="margin-bottom: 0.5rem" /></div>

    <template v-else>
      <div v-if="store.error" class="card">{{ store.error }}</div>

      <div class="card">
        <h2>Category estimates</h2>
        <BudgetTable v-model="linesDraft.draft.lines" :draft="store.draft" />
        <p><strong>Total: {{ store.total }}</strong></p>
        <Button label="Save budget" @click="saveLines" />
      </div>

      <div class="card">
        <h2>AI draft</h2>
        <Button v-if="auth.aiEnabled" :label="store.aiBusy ? 'Generating…' : 'AI draft'" :disabled="store.aiBusy" @click="runAiDraft" />
        <p v-else>AI disabled — set LLM_PROVIDER</p>
        <div v-if="store.draft">
          <p>Compare the "AI draft" column above against your estimates, then apply or discard.</p>
          <Button label="Apply" @click="applyDraft" />
          <Button label="Discard" severity="secondary" outlined @click="discardDraft" />
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
            <tr v-for="o in overridesDraft.draft.overrides" :key="o.person_id">
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
        <Button label="Save overrides" @click="saveOverrides" />
      </div>
    </template>
  </main>
</template>
