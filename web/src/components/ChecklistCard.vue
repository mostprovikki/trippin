<script setup>
import { ref, computed } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import Menu from 'primevue/menu'
import DateField from './DateField.vue'
import DraftReview from './DraftReview.vue'
import PromptPasteDialog from './PromptPasteDialog.vue'
import { useChecklistsStore } from '../stores/checklists.js'
import { useAiStatus } from '../composables/useAiStatus.js'

const props = defineProps({
  checklist: { type: Object, required: true },
  participants: { type: Array, default: () => [] }
})

const store = useChecklistsStore()
const aiStatus = useAiStatus()
const confirm = useConfirm()

const newTitle = ref('')
const newAssignee = ref('')
const newDueDate = ref('')
const showSaveAsTemplate = ref(false)
const templateName = ref('')

const isTasks = computed(() => props.checklist.kind === 'tasks')
const assigneeOptions = computed(() => [
  { label: 'Unassigned', value: '' },
  ...props.participants.map((p) => ({ label: p.name, value: p.person_id }))
])
const isPacking = computed(() => props.checklist.kind === 'packing')
const draft = computed(() =>
  store.packingDraft && store.packingDraft.checklistId === props.checklist.id ? store.packingDraft : null
)

function today() { return new Date().toISOString().slice(0, 10) }
function isOverdue(item) {
  return isTasks.value && !item.done && item.due_date && item.due_date < today()
}
function assigneeName(personId) {
  const p = props.participants.find((pp) => pp.person_id === personId)
  return p ? p.name : ''
}

async function toggleDone(item) {
  await store.updateItem(item.id, { done: !item.done })
}
async function changeAssignee(item, personId) {
  await store.updateItem(item.id, { assignee_person_id: personId || null })
}
async function changeDueDate(item, dueDate) {
  await store.updateItem(item.id, { due_date: dueDate || null })
}
async function addItem() {
  if (!newTitle.value.trim()) return
  const item = { title: newTitle.value }
  if (isTasks.value) {
    item.assignee_person_id = newAssignee.value || null
    item.due_date = newDueDate.value || null
  }
  await store.addItem(props.checklist.id, item)
  newTitle.value = ''
  newAssignee.value = ''
  newDueDate.value = ''
}
// Was deliberately unconfirmed (item content is visible in the row you're
// deleting, and this is the most frequent delete in the app) — owner decision
// 2026-09-24 overrides that: confirm like every other delete.
function removeItem(item) {
  confirm.require({
    message: `Delete "${item.title}"?`,
    header: 'Delete item?', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Delete', acceptClass: 'p-button-danger', rejectLabel: 'Cancel',
    accept: async () => { await store.deleteItem(item.id) }
  })
}
function removeChecklist() {
  const count = props.checklist.items?.length || 0
  // the button says "Delete checklist" and gives no hint that the items go
  // too, so the cascade — the part that actually can't be re-typed — has to be
  // spelled out with a count rather than a generic "are you sure?".
  const cascade = count
    ? ` Its ${count} item${count === 1 ? '' : 's'} will be deleted with it.`
    : ''
  confirm.require({
    message: `Delete the checklist "${props.checklist.name}"?${cascade} This cannot be undone.`,
    header: 'Delete checklist', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Delete', acceptClass: 'p-button-danger', rejectLabel: 'Cancel',
    accept: async () => { try { await store.deleteChecklist(props.checklist.id) } catch { /* store.error is rendered by the parent view */ } }
  })
}
async function saveAsTemplate() {
  if (!templateName.value.trim()) return
  await store.promoteToTemplate(props.checklist.id, templateName.value)
  templateName.value = ''
  showSaveAsTemplate.value = false
}
function openSaveAsTemplate() {
  templateName.value = props.checklist.name
  showSaveAsTemplate.value = true
}
// AI actions and per-card management (save as template, delete) sit under ⋯,
// never as buttons at rest (docs/design/tripper.md §5, D8). Templates are not
// shown on a trip and have no trip to draft for, so they get no menu.
const hasMenu = computed(() => !props.checklist.is_template)
const moreMenu = ref(null)
const menuId = computed(() => `checklist-more-${props.checklist.id}`)
const aiItems = computed(() => !isPacking.value ? [] : [
  {
    // A disabled menu item shows no tooltip, so the reason goes in the label.
    label: (store.aiBusy ? 'Generating…' : 'AI packing suggest')
      + (!aiStatus.enabled ? ' · AI not configured' : aiStatus.isMock ? ' · AI: dev mock' : ''),
    icon: 'pi pi-sparkles',
    disabled: !aiStatus.enabled || store.aiBusy,
    command: suggestPacking
  },
  // BYO-AI: always offered, provider or not (trip-planner-d5d).
  { label: 'Draft with your own AI…', icon: 'pi pi-clipboard', command: () => { pasteOpen.value = true } },
  { separator: true }
])
const moreItems = computed(() => [
  ...aiItems.value,
  { label: 'Save as template…', icon: 'pi pi-copy', command: openSaveAsTemplate },
  { label: 'Delete checklist…', icon: 'pi pi-trash', class: 'menu-danger', command: removeChecklist }
])
const pasteOpen = ref(false)
function onPasted(res) { store.setPastedPackingDraft(props.checklist.id, res.items) }

async function suggestPacking() {
  await store.aiPackingSuggest(props.checklist.id)
}
async function applyDraft() {
  await store.applyPackingDraft(props.checklist.id)
}
function discardDraft() {
  store.packingDraft = null
}
</script>

<template>
  <div class="card">
    <div class="checklist-head">
      <h3>{{ checklist.name }} <Tag :value="checklist.kind" severity="secondary" /></h3>
      <template v-if="hasMenu">
        <Button
          type="button" icon="pi pi-ellipsis-h" severity="secondary" text rounded
          :aria-label="`More ${checklist.name} actions`" aria-haspopup="true" :aria-controls="menuId"
          @click="moreMenu.toggle($event)"
        />
        <Menu :id="menuId" ref="moreMenu" :model="moreItems" popup />
        <PromptPasteDialog
          v-if="isPacking"
          v-model:visible="pasteOpen" header="Draft packing items with your own AI"
          :prompt-url="`/api/checklists/${checklist.id}/ai-packing-suggest/prompt`" :import-url="`/api/checklists/${checklist.id}/ai-packing-suggest/import`"
          @imported="onPasted"
        />
      </template>
    </div>

    <ul class="checklist-items">
      <li v-for="item in checklist.items" :key="item.id">
        <!-- The label wraps the checkbox so the whole row, not the 20px box, is
             the tick target (§4: ≥44px on a phone). -->
        <label class="item-tick" :for="`cl-item-${item.id}`">
          <Checkbox :model-value="!!item.done" binary :input-id="`cl-item-${item.id}`" @update:model-value="toggleDone(item)" />
          <span class="item-title">{{ item.title }}</span>
          <Tag v-if="isOverdue(item)" value="Overdue" severity="warn" />
        </label>

        <div v-if="isTasks" class="item-meta">
          <Select
            :input-id="`cl-assignee-${item.id}`"
            :name="`cl-assignee-${item.id}`"
            :model-value="item.assignee_person_id || ''"
            :options="assigneeOptions"
            option-label="label"
            option-value="value"
            aria-label="Assignee"
            @update:model-value="changeAssignee(item, $event)"
          />
          <DateField
            class="due-date"
            :fluid="false"
            placeholder="Due date"
            :model-value="item.due_date || ''"
            @update:model-value="changeDueDate(item, $event)"
          />
        </div>

        <Button type="button" icon="pi pi-times" severity="secondary" text rounded class="icon-danger-btn" :aria-label="`Delete ${item.title}`" @click="removeItem(item)" />
      </li>
    </ul>

    <form class="field checklist-add" @submit.prevent="addItem">
      <input v-model="newTitle" placeholder="New item title" />
      <template v-if="isTasks">
        <Select input-id="cl-new-assignee" name="cl-new-assignee" v-model="newAssignee" :options="assigneeOptions" option-label="label" option-value="value" aria-label="Assignee" />
        <DateField v-model="newDueDate" class="due-date" :fluid="false" placeholder="Due date" />
      </template>
      <Button type="submit" label="Add item" />
    </form>

    <DraftReview v-if="draft" title="AI packing draft" :busy="store.aiBusy" :pasted="!!draft.pasted" @apply="applyDraft" @discard="discardDraft">
      <ul>
        <li v-for="(item, idx) in draft.items" :key="idx">{{ item.title }}</li>
      </ul>
    </DraftReview>

    <form v-if="showSaveAsTemplate" class="field checklist-add save-template" @submit.prevent="saveAsTemplate">
      <input v-model="templateName" placeholder="Template name" aria-label="Template name" />
      <Button type="submit" label="Save template" :disabled="!templateName.trim()" />
      <Button type="button" label="Cancel" severity="secondary" outlined @click="showSaveAsTemplate = false" />
    </form>
  </div>
</template>

<style scoped>
.checklist-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.checklist-items { list-style: none; padding: 0; }
/* Wraps like .checklist-add below it: a task row is checkbox + label + assignee
   Select + 10rem date + Delete, which is far past 375px, and without wrap the
   overflow pushes the whole page into sideways scroll rather than the row. */
.checklist-items li { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; flex-wrap: wrap; }
.item-tick { flex: 1 1 12rem; min-width: 0; display: flex; align-items: center; gap: 0.5rem; min-height: 2.25rem; cursor: pointer; }
.item-title { min-width: 0; overflow-wrap: anywhere; }
.item-meta { display: flex; align-items: center; gap: 0.5rem; }
/* Phone (§4): one tap row ≥44px. A packing row stays one line (title wraps
   inside the label); a task row puts assignee + due on ONE second line under
   the title instead of breaking into three. */
@media (max-width: 640px) {
  .checklist-items li { flex-wrap: nowrap; }
  .checklist-items li:has(.item-meta) { flex-wrap: wrap; }
  .item-tick { flex: 1 1 0; min-height: 2.75rem; }
  .item-meta { order: 3; flex: 1 0 100%; min-width: 0; box-sizing: border-box; padding-left: 1.75rem; }
  .item-meta .p-select { flex: 1 1 0; min-width: 0; }
}
.checklist-add { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.save-template { margin-top: 0.5rem; }
/* DateField is fluid by default; in these flex rows it must keep an intrinsic
   width so it can't stretch over the assignee Select and Delete button. */
.due-date { flex: none; }
/* The add form sits inside `.field`, so main.css styles its inner input; the
   item row has no `.field` ancestor and would otherwise keep PrimeVue's larger
   16px/12px type. Match them explicitly, and leave 2.5rem on the right so a
   full ISO date can't slide under the calendar icon (10rem is ~20px of slack
   at this size; 9rem clipped the last digit of dates like 2026-09-09). */
.due-date :deep(.p-datepicker-input) {
  width: 10rem;
  font-size: 0.9375rem;
  padding: 0.5rem 2.5rem 0.5rem 0.625rem;
}
/* `.field select` in main.css targets a native <select>, so PrimeVue's
   div-based Select never inherits it and stands 6px taller than every
   neighbour. Size the *label* — a min-height on the root can't shrink a box
   whose 40px content already exceeds it (8 + 18 + 8 + 2px border = 36px). */
.checklist-items li :deep(.p-select-label),
.checklist-add :deep(.p-select-label) {
  padding: 0.5rem 0.625rem;
  font-size: 0.9375rem;
  line-height: 1.125rem;
}
/* The row's Delete button is PrimeVue's icon-only rounded text Button, which
   defaults to 2.5rem (40px) — 4px taller than the Select/DateField it sits
   beside. Pin it to their 36px on this row only; main.css's own
   `.icon-danger-btn` media rule sets min-width/min-height: 2.75rem (44px)
   under 768px, and a min-* property always wins over a smaller width/height
   regardless of selector specificity, so the mobile tap-target floor is
   untouched by this. */
.checklist-items .icon-danger-btn {
  width: 2.25rem;
  height: 2.25rem;
}
</style>
