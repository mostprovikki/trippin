<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import InputText from 'primevue/inputtext'
import { formatMoney, perPersonLabel, bookedSplitLabel } from '../../utils/format.js'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Menu from 'primevue/menu'
import { api } from '../../api/client.js'
import { useAiStatus } from '../../composables/useAiStatus.js'
import { useBudgetStore } from '../../stores/budget.js'
import { useDraft, confirmDiscard } from '../../composables/useDraft.js'
import { useNotify } from '../../composables/useNotify.js'
import BudgetTable from '../../components/BudgetTable.vue'
import DraftReview from '../../components/DraftReview.vue'
import SectionHeader from '../../components/SectionHeader.vue'
import PromptPasteDialog from '../../components/PromptPasteDialog.vue'

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

// Save shows only when there is something to save (tripper.md §5, owner D8).
const overridesDirty = computed(() => overridesDraft.isDirty.value)
// Per-person cost is job 3: it leads the tab, in the Overview's own words (§6).
const perPersonHero = computed(() => (store.equal_share > 0 ? formatMoney(Math.round(store.equal_share), tripCurrency.value) : null))
const perPersonSplit = computed(() => bookedSplitLabel(store.equal_share, store.equal_share_booked, tripCurrency.value))
const perPersonSub = computed(() => perPersonLabel(store.participant_count, store.overrides.length))
// An all-zero budget is "no estimate", not eight ₹0 rows. Judged on the saved
// lines, so typing a 0 while editing doesn't swap the table out from under you.
const noEstimate = computed(() => !editing.value && !store.draft && !store.lines.some((l) => Number(l.estimate) > 0))

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
  // trip participants are { person_id, name } (GET /trips/:id), not { id }
  const person = participants.value.find((p) => p.person_id === newOverride.person_id)
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

// AI actions sit under ⋯, never as buttons at rest (docs/design/tripper.md §5).
// A disabled menu item shows no tooltip, so the reason goes in the label.
const moreMenu = ref(null)
const moreItems = computed(() => [
  {
    label: (store.aiBusy ? 'Generating…' : 'AI draft')
      + (!aiStatus.enabled ? ' · AI not configured' : aiStatus.isMock ? ' · AI: dev mock' : ''),
    icon: 'pi pi-sparkles',
    disabled: !aiStatus.enabled || store.aiBusy,
    command: runAiDraft
  },
  // BYO-AI: always offered, provider or not (trip-planner-d5d).
  { label: 'Draft with your own AI…', icon: 'pi pi-clipboard', command: () => { pasteOpen.value = true } }
])
const pasteOpen = ref(false)
function onPasted(res) { store.setPastedDraft(res.lines) }

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
    <SectionHeader title="Budget" description="Category estimates and per-person split." />

    <div v-if="loading" class="card"><Skeleton v-for="i in 4" :key="i" class="skeleton-row" /></div>

    <template v-else>
      <div v-if="store.error" class="card">{{ store.error }}</div>

      <div class="card" data-test="per-person">
        <h2>Per person</h2>
        <template v-if="perPersonHero">
          <p class="budget-hero">{{ perPersonHero }}</p>
          <p v-if="perPersonSplit" class="budget-split" data-test="budget-split">{{ perPersonSplit }}</p>
          <p class="budget-sub">{{ perPersonSub }}</p>
        </template>
        <p v-else class="budget-sub">No estimate yet.</p>

        <h3 class="override-head">Own amounts</h3>
        <ul class="override-list">
          <li v-for="o in overridesDraft.draft.overrides" :key="o.person_id" class="override-row">
            <span class="override-name">{{ o.person_name }}</span>
            <InputNumber class="override-amount" :input-id="`tb-amount-${o.person_id}`" :name="`tb-amount-${o.person_id}`" v-model="o.amount" :min="0" :max-fraction-digits="2" :aria-label="`Amount for ${o.person_name}`" fluid />
            <InputText class="override-note" :id="`tb-note-${o.person_id}`" :name="`tb-note-${o.person_id}`" v-model="o.note" placeholder="Note" :aria-label="`Note for ${o.person_name}`" />
            <Button icon="pi pi-times" severity="secondary" text rounded class="override-del icon-danger-btn" :aria-label="`Remove override for ${o.person_name}`" @click="removeOverrideRow(o.person_id)" />
          </li>
          <li class="override-row override-add">
            <Select class="override-name" input-id="tb-new-override-person" name="tb-new-override-person" v-model="newOverride.person_id" :options="participants" option-label="name" option-value="person_id" placeholder="Select person…" aria-label="Person" />
            <InputNumber class="override-amount" input-id="tb-new-override-amount" name="tb-new-override-amount" v-model="newOverride.amount" :min="0" :max-fraction-digits="2" placeholder="Amount" aria-label="Amount" fluid />
            <InputText class="override-note" id="tb-new-override-note" name="tb-new-override-note" v-model="newOverride.note" placeholder="Note" aria-label="Note" />
            <Button class="override-del" label="Add" icon="pi pi-plus" outlined :disabled="!newOverride.person_id" @click="addOverrideRow" />
          </li>
        </ul>
        <Button v-if="overridesDirty" label="Save overrides" class="override-save" @click="saveOverrides" />
      </div>

      <div class="card">
        <div class="card-header-row">
          <h2>Category estimates</h2>
          <div class="card-header-actions">
            <Button v-if="!editing" label="Edit budget" text @click="editing = true" />
            <Button
              type="button" icon="pi pi-ellipsis-h" severity="secondary" text rounded
              aria-label="More budget actions" aria-haspopup="true" aria-controls="budget-more-menu"
              @click="moreMenu.toggle($event)"
            />
            <Menu id="budget-more-menu" ref="moreMenu" :model="moreItems" popup />
          </div>
        </div>
        <p v-if="noEstimate" class="budget-sub">No estimate yet — Edit budget to add one.</p>
        <BudgetTable v-else v-model="linesDraft.draft.lines" :draft="store.draft" :currency="tripCurrency" :editing="editing" />
        <div v-if="editing" class="budget-edit-actions">
          <Button label="Save budget" @click="saveLines" />
          <Button label="Cancel" severity="secondary" outlined @click="cancelEdit" />
        </div>
      </div>

      <PromptPasteDialog
        v-model:visible="pasteOpen" header="Draft the budget with your own AI"
        :prompt-url="`/api/trips/${tripId}/budget/ai-draft/prompt`" :import-url="`/api/trips/${tripId}/budget/ai-draft/import`"
        @imported="onPasted"
      />

      <DraftReview v-if="store.draft" title="AI draft" :busy="store.aiBusy" :pasted="store.draftPasted" @apply="applyDraft" @discard="discardDraft">
        <p>Compare the "AI draft" column above against your estimates, then apply or discard.</p>
      </DraftReview>

    </template>
  </div>
</template>

<style scoped>
.budget-hero { font-size: 1.75rem; font-weight: 600; margin: 0.25rem 0 0; font-variant-numeric: tabular-nums; }
.budget-split { margin: 0.25rem 0 0; font-weight: 600; font-variant-numeric: tabular-nums; }
.budget-sub { margin: 0.25rem 0 0; color: var(--app-text-muted); font-size: 0.875rem; }
.override-head { font-size: 0.9375rem; margin: 1rem 0 0.5rem; }
.override-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
/* One grid for saved rows and the add row, so the columns line up. On a phone
   (§4) the row stacks: name + remove, then amount + note at full width — the
   old table squeezed the inputs to 62 and 34px. */
.override-row {
  display: grid; gap: 0.5rem; align-items: center;
  grid-template-columns: minmax(8rem, 1fr) 10rem minmax(8rem, 2fr) auto;
  grid-template-areas: "name amount note del";
}
.override-name { grid-area: name; min-width: 0; }
.override-amount { grid-area: amount; min-width: 0; }
.override-note { grid-area: note; min-width: 0; }
.override-del { grid-area: del; }
.override-save { margin-top: 0.75rem; }
@media (max-width: 640px) {
  .override-row {
    grid-template-columns: 7rem minmax(0, 1fr) auto;
    grid-template-areas: "name name del" "amount note note";
  }
  .override-row + .override-row { border-top: 1px solid var(--app-border); padding-top: 0.5rem; }
}
.card-header-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.card-header-actions { display: flex; align-items: center; gap: 0.25rem; flex: none; white-space: nowrap; }
.budget-edit-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
</style>
