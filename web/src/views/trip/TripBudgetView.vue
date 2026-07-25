<script setup>
import { ref, reactive, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { api } from '../../api/client.js'
import { useAuthStore } from '../../stores/auth.js'
import { useBudgetStore } from '../../stores/budget.js'
import { useDraft, confirmDiscard } from '../../composables/useDraft.js'
import { useNotify } from '../../composables/useNotify.js'
import BudgetTable from '../../components/BudgetTable.vue'
import SectionHeader from '../../components/SectionHeader.vue'

const route = useRoute()
const tripId = computed(() => route.params.id)
const auth = useAuthStore()
const store = useBudgetStore()
const confirm = useConfirm()
const notify = useNotify()

const loading = ref(true)
const participants = ref([])
const newOverride = reactive({ person_id: '', amount: 0, note: '' })

// useDraft resolves its storage key once, so the drafts are rebuilt whenever the
// trip changes — otherwise trip B's edits get persisted under trip A's key.
let draftTripId = tripId.value
const linesDraft = shallowRef(useDraft(`trip:${draftTripId}:budget-lines`, () => ({ lines: [] })))
const overridesDraft = shallowRef(useDraft(`trip:${draftTripId}:budget-overrides`, () => ({ overrides: [] })))

function rekeyDrafts() {
  if (draftTripId === tripId.value) return
  linesDraft.value.teardown()
  overridesDraft.value.teardown()
  draftTripId = tripId.value
  linesDraft.value = useDraft(`trip:${draftTripId}:budget-lines`, () => ({ lines: [] }))
  overridesDraft.value = useDraft(`trip:${draftTripId}:budget-overrides`, () => ({ overrides: [] }))
}
// Drafts rebuilt outside setup don't get useDraft's own unmount hook.
onBeforeUnmount(() => { linesDraft.value.teardown(); overridesDraft.value.teardown() })

watch(() => store.lines, (lines) => { linesDraft.value.load({ lines: lines.map((l) => ({ ...l })) }) }, { immediate: true })
watch(() => store.overrides, (overrides) => { overridesDraft.value.load({ overrides: overrides.map((o) => ({ ...o })) }) }, { immediate: true })

function resetNewOverride() {
  newOverride.person_id = ''
  newOverride.amount = 0
  newOverride.note = ''
}

async function load() {
  loading.value = true
  // Nothing here survives a trip change: the half-typed override row, the
  // error banner and the untagged AI draft all belong to the trip we came from,
  // and applying that draft would write its numbers against the new trip.
  resetNewOverride()
  rekeyDrafts()
  store.$reset()
  try {
    const trip = (await api.get(`/api/trips/${tripId.value}`)).trip
    participants.value = trip?.participants || []
  } catch { participants.value = [] }
  try { await store.fetchBudget(tripId.value) } catch (e) { notify.error(e.message) } finally { loading.value = false }
}

onMounted(load)
// TripLayout is reused when only :id changes, so this view is never remounted
// between trips and has to refetch for the new :id itself.
watch(tripId, load)

async function saveLines() {
  try {
    await store.saveLines(tripId.value, linesDraft.value.draft.lines)
    linesDraft.value.clear()
    notify.success('Budget saved')
  } catch (e) { notify.error(e.message) }
}

function addOverrideRow() {
  if (!newOverride.person_id) return
  const person = participants.value.find((p) => p.id === newOverride.person_id)
  overridesDraft.value.draft.overrides.push({
    person_id: newOverride.person_id,
    person_name: person?.name || '',
    amount: Number(newOverride.amount) || 0,
    note: newOverride.note
  })
  resetNewOverride()
}

function removeOverrideRow(personId) {
  overridesDraft.value.draft.overrides = overridesDraft.value.draft.overrides.filter((o) => o.person_id !== personId)
}

async function saveOverrides() {
  try {
    const overrides = overridesDraft.value.draft.overrides.map((o) => ({ person_id: o.person_id, amount: Number(o.amount) || 0, note: o.note }))
    await store.saveOverrides(tripId.value, overrides)
    overridesDraft.value.clear()
    notify.success('Overrides saved')
  } catch (e) { notify.error(e.message) }
}

async function runAiDraft() {
  try { await store.aiDraft(tripId.value) } catch (e) { notify.error(e.message) }
}

async function applyDraft() {
  try { await store.applyDraft(tripId.value); notify.success('AI draft applied') } catch (e) { notify.error(e.message) }
}

function discardDraft() {
  store.draft = null
}

onBeforeRouteLeave(async () => {
  if (!linesDraft.value.isDirty.value && !overridesDraft.value.isDirty.value) return true
  const ok = await confirmDiscard(confirm)
  if (ok) { linesDraft.value.clear(); overridesDraft.value.clear() }
  return ok
})
</script>

<template>
  <div>
    <SectionHeader title="Budget" description="Category estimates, AI draft, and per-person split." />

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
        <p v-else>AI suggestions are turned off</p>
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

        <div class="override-add">
          <Select v-model="newOverride.person_id" :options="participants" option-label="name" option-value="id" placeholder="Select person…" />
          <InputNumber v-model="newOverride.amount" :min="0" :max-fraction-digits="2" placeholder="Amount" />
          <InputText v-model="newOverride.note" placeholder="Note" />
          <Button label="Add" icon="pi pi-plus" outlined :disabled="!newOverride.person_id" @click="addOverrideRow" />
        </div>

        <DataTable :value="overridesDraft.draft.overrides" data-key="person_id">
          <Column header="Person">
            <template #body="{ data }">{{ data.person_name }}</template>
          </Column>
          <Column header="Override amount">
            <template #body="{ data }">
              <InputNumber v-model="data.amount" :min="0" :max-fraction-digits="2" fluid />
            </template>
          </Column>
          <Column header="Note">
            <template #body="{ data }">
              <InputText v-model="data.note" fluid />
            </template>
          </Column>
          <Column>
            <template #body="{ data }">
              <Button label="Remove" size="small" severity="danger" text @click="removeOverrideRow(data.person_id)" />
            </template>
          </Column>
        </DataTable>
        <Button label="Save overrides" @click="saveOverrides" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.override-add { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.75rem; }
</style>
