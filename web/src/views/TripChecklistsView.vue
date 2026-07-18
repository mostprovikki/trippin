<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/client.js'
import { useChecklistsStore } from '../stores/checklists.js'
import ChecklistCard from '../components/ChecklistCard.vue'

const route = useRoute()
const tripId = route.params.id
const store = useChecklistsStore()

const participants = ref([])
const newKind = ref('packing')
const newName = ref('')
const selectedTemplate = ref('')

onMounted(async () => {
  try {
    const trip = (await api.get(`/api/trips/${tripId}`)).trip
    participants.value = trip?.participants || []
  } catch { participants.value = [] }
  await store.fetchForTrip(tripId)
  await store.fetchTemplates()
})

async function createChecklist() {
  if (!newName.value.trim()) return
  await store.createChecklist({ kind: newKind.value, name: newName.value, trip_id: tripId })
  newName.value = ''
}

async function addFromTemplate() {
  if (!selectedTemplate.value) return
  await store.fromTemplate(tripId, selectedTemplate.value)
  selectedTemplate.value = ''
}
</script>

<template>
  <main class="page">
    <h1>Trip Checklists</h1>

    <div v-if="store.error" class="card">{{ store.error }}</div>

    <div class="card">
      <h2>New checklist</h2>
      <form class="field" @submit.prevent="createChecklist">
        <label for="checklist-kind">Kind</label>
        <select id="checklist-kind" v-model="newKind">
          <option value="packing">Packing</option>
          <option value="tasks">Tasks</option>
        </select>
        <label for="checklist-name">Name</label>
        <input id="checklist-name" v-model="newName" placeholder="Checklist name" />
        <button type="submit" class="btn btn-primary">Create</button>
      </form>
    </div>

    <div class="card">
      <h2>From template</h2>
      <form class="field" @submit.prevent="addFromTemplate">
        <select v-model="selectedTemplate">
          <option value="">Select a template…</option>
          <option v-for="t in store.templates" :key="t.id" :value="t.id">{{ t.name }} ({{ t.kind }})</option>
        </select>
        <button type="submit" class="btn">Add from template</button>
      </form>
    </div>

    <ChecklistCard
      v-for="checklist in store.checklists"
      :key="checklist.id"
      :checklist="checklist"
      :participants="participants"
    />
  </main>
</template>
