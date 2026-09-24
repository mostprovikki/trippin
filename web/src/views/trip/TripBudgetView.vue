<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import { formatMoney } from '../../utils/format.js'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { api } from '../../api/client.js'
import { useAiStatus } from '../../composables/useAiStatus.js'
import { useBudgetStore } from '../../stores/budget.js'
import { useDraft, confirmDiscard } from '../../composables/useDraft.js'
import { useNotify } from '../../composables/useNotify.js'
import BudgetTable from '../../components/BudgetTable.vue'
import DraftReview from '../../components/DraftReview.vue'
import SectionHeader from '../../components/SectionHeader.vue'

const route = useRoute()
const tripId = computed(() => route.params.id)
const aiStatus = useAiStatus()
const store = useBudgetStore()
const confirm = useConfirm()
const notify = useNotify()

const loading = ref(true)
const participants = ref([])
const tripCurrency = ref('INR')
const newOverride = reactive({ person_id: '', amount: 0, note: '' })
// trip-planner-53h: BudgetTable is read-only until the owner opts in — the
// table was permanently in edit mode before, wasting space on inputs nobody
// was touching.
const editing = ref(false)

// Getter keys: this view is reused across :id changes, so the drafts have to
// follow the trip rather than freeze on whichever one was open at setup.
const linesDraft = useDraft(() => `trip:${tripId.value}:budget-lines`, () => ({ lines: [] }))
const overridesDraft = useDraft(() => `trip:${tripId.value}:budget-overrides`, () => ({ overrides: [] }))

watch(() => store.lines, (lines) => { linesDraft.load({ lines: lines.map((l) => ({ ...l })) }) }, { immediate: true })
watch(() => store.overrides, (overrides) => { overridesDraft.load({ overrides: overrides.map((o) => ({ ...o })) }) }, { immediate: true })

function resetNewOverride() {
  newOverride.person_id = ''
  newOverride.amount = 0
  newOverride.note = ''
}

async function load() {
  loading.value = true
  // Only the half-typed override row is cleared here — it is this view's own
  // state. The store's numbers, error and AI draft are cleared by the store
  // itself, which knows from its lastTripId whether what it holds is ours.
  resetNewOverride()
  try {
    const trip = (await api.get(`/api/trips/${tripId.value}`)).trip
    participants.value = trip?.participants || []
    tripCurrency.value = trip?.currency || 'INR'
  } catch { participants.value = [] }
  try { await store.fetchBudget(tripId.value) } catch (e) { notify.error(e.message) } finally { loading.value = false }
}

onMounted(load)
// Belt and braces, not the mechanism. Trip-scoped stores now clear themselves
// when asked about a different trip, which empties trips.current and makes
// TripLayout fall back to its skeleton — that unmounts this view, so onMounted
// covers the common path today (verified in a browser: the skeleton really does
// appear on a param-only switch). Kept because the reuse it guards against is
// silent when it returns: the sidebar would say one trip and the body show
// another, with edits written to whichever id the view captured first.
watch(tripId, load)

async function saveLines() {
  try {
    await store.saveLines(tripId.value, linesDraft.draft.lines)
    linesDraft.clear()
    notify.success('Budget saved')
    editing.value = false
  } catch (e) { notify.error(e.message) }
}

// Discards unsaved edits back to the last-saved lines (store.lines, which the
// linesDraft.load watcher above already mirrors into its baseline) rather
// than clearing the draft to the empty factory default.
function cancelEdit() {
  linesDraft.draft.lines = store.lines.map((l) => ({ ...l }))
  editing.value = false
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
  resetNewOverride()
}

function removeOverrideRow(personId) {
  overridesDraft.draft.overrides = overridesDraft.draft.overrides.filter((o) => o.person_id !== personId)
}

async function saveOverrides() {
  try {
    const overrides = overridesDraft.draft.overrides.map((o) => ({ person_id: o.person_id, amount: Number(o.amount) || 0, note: o.note }))
    await store.saveOverrides(tripId.value, overrides)
    overridesDraft.clear()
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
  if (!linesDraft.isDirty.value && !overridesDraft.isDirty.value) return true
  const ok = await confirmDiscard(confirm)
  if (ok) { linesDraft.clear(); overridesDraft.clear() }
  return ok
})
</script>

<template>
  <div>
    <SectionHeader title="Budget" description="Category estimates, AI draft, and per-person split." />

    <div v-if="loading" class="card"><Skeleton v-for="i in 4" :key="i" class="skeleton-row" /></div>

    <template v-else>
      <div v-if="store.error" class="card">{{ store.error }}</div>

      <div class="card">
        <div class="card-header-row">
          <h2>Category estimates</h2>
          <Button v-if="!editing" label="Edit budget" text @click="editing = true" />
        </div>
        <BudgetTable v-model="linesDraft.draft.lines" :draft="store.draft" :currency="tripCurrency" :editing="editing" />
        <div v-if="editing" class="budget-edit-actions">
          <Button label="Save budget" @click="saveLines" />
          <Button label="Cancel" severity="secondary" outlined @click="cancelEdit" />
        </div>
      </div>

      <div class="card">
        <h2>AI draft</h2>
        <Button
          :label="store.aiBusy ? 'Generating…' : 'AI draft'" :disabled="store.aiBusy || !aiStatus.enabled"
          :title="!aiStatus.enabled ? 'AI is not configured on this server (set LLM_PROVIDER)' : undefined"
          @click="runAiDraft"
        />
        <Tag v-if="aiStatus.isMock" severity="secondary" value="AI: dev mock" />
      </div>

      <DraftReview v-if="store.draft" title="AI draft" :busy="store.aiBusy" @apply="applyDraft" @discard="discardDraft">
        <p>Compare the "AI draft" column above against your estimates, then apply or discard.</p>
      </DraftReview>

      <div class="card">
        <h2>Per-person split</h2>
        <p>Participants: {{ store.participant_count }}</p>
        <p>Equal share: {{ formatMoney(store.equal_share, tripCurrency) }}</p>

        <div class="override-add">
          <Select input-id="tb-new-override-person" name="tb-new-override-person" v-model="newOverride.person_id" :options="participants" option-label="name" option-value="id" placeholder="Select person…" />
          <InputNumber input-id="tb-new-override-amount" name="tb-new-override-amount" v-model="newOverride.amount" :min="0" :max-fraction-digits="2" placeholder="Amount" />
          <InputText id="tb-new-override-note" name="tb-new-override-note" v-model="newOverride.note" placeholder="Note" />
          <Button label="Add" icon="pi pi-plus" outlined :disabled="!newOverride.person_id" @click="addOverrideRow" />
        </div>

        <DataTable :value="overridesDraft.draft.overrides" data-key="person_id">
          <Column header="Person">
            <template #body="{ data }">{{ data.person_name }}</template>
          </Column>
          <Column header="Override amount">
            <template #body="{ data }">
              <InputNumber :input-id="`tb-amount-${data.person_id}`" :name="`tb-amount-${data.person_id}`" v-model="data.amount" :min="0" :max-fraction-digits="2" fluid />
            </template>
          </Column>
          <Column header="Note">
            <template #body="{ data }">
              <InputText :id="`tb-note-${data.person_id}`" :name="`tb-note-${data.person_id}`" v-model="data.note" fluid />
            </template>
          </Column>
          <Column>
            <template #body="{ data }">
              <Button icon="pi pi-times" size="small" severity="secondary" text rounded class="icon-danger-btn" :aria-label="`Remove override for ${data.person_name}`" @click="removeOverrideRow(data.person_id)" />
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
.card-header-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.budget-edit-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
</style>
