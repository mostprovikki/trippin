<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Select from 'primevue/select'
import { api } from '../../api/client.js'
import { useChecklistsStore } from '../../stores/checklists.js'
import ChecklistCard from '../../components/ChecklistCard.vue'
import EmptyState from '../../components/EmptyState.vue'
import SectionHeader from '../../components/SectionHeader.vue'

const route = useRoute()
const tripId = computed(() => route.params.id)
const store = useChecklistsStore()

const KIND_OPTIONS = [
  { label: 'Packing', value: 'packing' },
  { label: 'Tasks', value: 'tasks' }
]

const participants = ref([])
const newKind = ref('packing')
const newName = ref('')
const selectedTemplate = ref('')

async function load() {
  // The lists, the error banner and the two forms all belong to the trip we
  // came from; a checklist created from a leftover form would land elsewhere.
  store.error = null
  store.checklists = []
  participants.value = []
  newKind.value = 'packing'
  newName.value = ''
  selectedTemplate.value = ''
  try {
    const trip = (await api.get(`/api/trips/${tripId.value}`)).trip
    participants.value = trip?.participants || []
  } catch { /* participants stay empty; assignee pickers degrade gracefully */ }
  // Templates aren't trip-scoped, so their fetch must not hang off the
  // checklist fetch succeeding — a failure there would leave the template
  // dropdown empty for as long as the view stays open.
  await Promise.allSettled([store.fetchForTrip(tripId.value), store.fetchTemplates()])
}

onMounted(load)
// TripLayout is reused when only :id changes, so this view is never remounted
// between trips and has to refetch for the new :id itself.
watch(tripId, load)

async function createChecklist() {
  if (!newName.value.trim()) return
  await store.createChecklist({ kind: newKind.value, name: newName.value, trip_id: tripId.value })
  newName.value = ''
}

async function addFromTemplate() {
  if (!selectedTemplate.value) return
  await store.fromTemplate(tripId.value, selectedTemplate.value)
  selectedTemplate.value = ''
}
</script>

<template>
  <div>
    <SectionHeader title="Checklists" description="Packing lists and shared tasks, assignable to participants." />

    <Message v-if="store.error" severity="error" :closable="false">{{ store.error }}</Message>

    <div class="card">
      <h2>New checklist</h2>
      <form class="checklist-form-row" @submit.prevent="createChecklist">
        <Select v-model="newKind" :options="KIND_OPTIONS" option-label="label" option-value="value" aria-label="Kind" />
        <InputText id="checklist-name" v-model="newName" placeholder="Checklist name" />
        <Button type="submit" label="Create" />
      </form>
      <form class="checklist-form-row" @submit.prevent="addFromTemplate">
        <Select v-model="selectedTemplate" :options="store.templates" option-label="name" option-value="id" placeholder="Select a template…" aria-label="Template" />
        <Button type="submit" label="Add from template" severity="secondary" outlined />
      </form>
    </div>

    <EmptyState
      v-if="!store.checklists.length"
      icon="pi pi-check-square"
      message="No checklists yet — create one or start from a template."
    />

    <ChecklistCard
      v-for="checklist in store.checklists"
      :key="checklist.id"
      :checklist="checklist"
      :participants="participants"
    />
  </div>
</template>

<style scoped>
.checklist-form-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.75rem; }
.checklist-form-row:last-child { margin-bottom: 0; }
</style>
