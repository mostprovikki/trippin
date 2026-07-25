<script setup>
import { ref, computed } from 'vue'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import DateField from './DateField.vue'
import { useChecklistsStore } from '../stores/checklists.js'
import { useAuthStore } from '../stores/auth.js'

const props = defineProps({
  checklist: { type: Object, required: true },
  participants: { type: Array, default: () => [] }
})

const store = useChecklistsStore()
const auth = useAuthStore()

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
async function removeItem(itemId) {
  await store.deleteItem(itemId)
}
async function removeChecklist() {
  await store.deleteChecklist(props.checklist.id)
}
async function saveAsTemplate() {
  if (!templateName.value.trim()) return
  await store.promoteToTemplate(props.checklist.id, templateName.value)
  templateName.value = ''
  showSaveAsTemplate.value = false
}
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
    <h3>{{ checklist.name }} <Tag :value="checklist.kind" severity="secondary" /></h3>

    <ul class="checklist-items">
      <li v-for="item in checklist.items" :key="item.id">
        <Checkbox :model-value="!!item.done" binary :input-id="`cl-item-${item.id}`" @update:model-value="toggleDone(item)" />
        <label :for="`cl-item-${item.id}`">{{ item.title }}</label>
        <Tag v-if="isOverdue(item)" value="Overdue" severity="warn" />

        <template v-if="isTasks">
          <Select
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
        </template>

        <Button type="button" label="Delete" severity="danger" outlined @click="removeItem(item.id)" />
      </li>
    </ul>

    <form class="field checklist-add" @submit.prevent="addItem">
      <input v-model="newTitle" placeholder="New item title" />
      <template v-if="isTasks">
        <Select v-model="newAssignee" :options="assigneeOptions" option-label="label" option-value="value" aria-label="Assignee" />
        <DateField v-model="newDueDate" class="due-date" :fluid="false" placeholder="Due date" />
      </template>
      <Button type="submit" label="Add item" />
    </form>

    <div v-if="isPacking && auth.aiEnabled">
      <Button type="button" severity="secondary" outlined :loading="store.aiBusy" @click="suggestPacking">
        {{ store.aiBusy ? 'Generating…' : 'AI packing suggest' }}
      </Button>
    </div>
    <div v-else-if="isPacking">
      <p>AI suggestions are turned off</p>
    </div>

    <div v-if="draft" class="card">
      <h4>AI packing draft</h4>
      <ul>
        <li v-for="(item, idx) in draft.items" :key="idx">{{ item.title }}</li>
      </ul>
      <Button type="button" label="Apply" @click="applyDraft" />
      <Button type="button" label="Discard" severity="secondary" outlined @click="discardDraft" />
    </div>

    <div class="checklist-footer">
      <Button
        v-if="!checklist.is_template && !showSaveAsTemplate"
        type="button"
        label="Save as template"
        severity="secondary"
        outlined
        @click="showSaveAsTemplate = true"
      />
      <form v-if="showSaveAsTemplate" class="field checklist-add" @submit.prevent="saveAsTemplate">
        <input v-model="templateName" placeholder="Template name" />
        <Button type="submit" label="Save" />
        <Button type="button" label="Cancel" severity="secondary" outlined @click="showSaveAsTemplate = false" />
      </form>
      <Button type="button" label="Delete checklist" severity="danger" outlined @click="removeChecklist" />
    </div>
  </div>
</template>

<style scoped>
.checklist-items { list-style: none; padding: 0; }
.checklist-items li { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; }
.checklist-add { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.checklist-footer { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
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
</style>
