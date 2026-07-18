<script setup>
import { ref, computed } from 'vue'
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
    <h3>{{ checklist.name }} <span class="badge">{{ checklist.kind }}</span></h3>

    <ul>
      <li v-for="item in checklist.items" :key="item.id">
        <label>
          <input type="checkbox" :checked="!!item.done" @change="toggleDone(item)" />
          {{ item.title }}
        </label>
        <span v-if="isOverdue(item)" class="badge badge-warn">Overdue</span>

        <template v-if="isTasks">
          <select :value="item.assignee_person_id || ''" @change="changeAssignee(item, $event.target.value)">
            <option value="">Unassigned</option>
            <option v-for="p in participants" :key="p.person_id" :value="p.person_id">{{ p.name }}</option>
          </select>
          <input type="date" :value="item.due_date || ''" @change="changeDueDate(item, $event.target.value)" />
        </template>

        <button type="button" class="btn" @click="removeItem(item.id)">Delete</button>
      </li>
    </ul>

    <form class="field" @submit.prevent="addItem">
      <input v-model="newTitle" placeholder="New item title" />
      <template v-if="isTasks">
        <select v-model="newAssignee">
          <option value="">Unassigned</option>
          <option v-for="p in participants" :key="p.person_id" :value="p.person_id">{{ p.name }}</option>
        </select>
        <input v-model="newDueDate" type="date" />
      </template>
      <button type="submit" class="btn btn-primary">Add item</button>
    </form>

    <div v-if="isPacking && auth.aiEnabled">
      <button type="button" class="btn" :disabled="store.aiBusy" @click="suggestPacking">
        {{ store.aiBusy ? 'Generating…' : 'AI packing suggest' }}
      </button>
    </div>
    <div v-else-if="isPacking">
      <p>AI disabled — set LLM_PROVIDER</p>
    </div>

    <div v-if="draft" class="card">
      <h4>AI packing draft</h4>
      <ul>
        <li v-for="(item, idx) in draft.items" :key="idx">{{ item.title }}</li>
      </ul>
      <button type="button" class="btn btn-primary" @click="applyDraft">Apply</button>
      <button type="button" class="btn" @click="discardDraft">Discard</button>
    </div>

    <div>
      <button v-if="!checklist.is_template && !showSaveAsTemplate" type="button" class="btn" @click="showSaveAsTemplate = true">
        Save as template
      </button>
      <form v-if="showSaveAsTemplate" class="field" @submit.prevent="saveAsTemplate">
        <input v-model="templateName" placeholder="Template name" />
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn" @click="showSaveAsTemplate = false">Cancel</button>
      </form>
      <button type="button" class="btn" @click="removeChecklist">Delete checklist</button>
    </div>
  </div>
</template>
