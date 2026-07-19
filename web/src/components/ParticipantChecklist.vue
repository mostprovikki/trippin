<script setup>
import Checkbox from 'primevue/checkbox'
import { useParticipantStore } from '../stores/participant.js'

const store = useParticipantStore()

function today() { return new Date().toISOString().slice(0, 10) }
function isOverdue(item) {
  return !item.done && item.due_date && item.due_date < today()
}
async function toggle(item) {
  try {
    await store.tickItem(item.id, !item.done)
  } catch {
    /* store.error surfaced by parent view */
  }
}
</script>

<template>
  <section class="card">
    <h2>Your checklist</h2>

    <h3>Packing</h3>
    <ul v-if="store.packing.length" class="participant-items">
      <li v-for="item in store.packing" :key="item.id">
        <Checkbox :model-value="!!item.done" binary :input-id="`pcl-pack-${item.id}`" @update:model-value="toggle(item)" />
        <label :for="`pcl-pack-${item.id}`">{{ item.title }}</label>
        <span class="badge">{{ item.checklist_name }}</span>
      </li>
    </ul>
    <p v-else>Nothing to pack yet.</p>

    <h3>Tasks</h3>
    <ul v-if="store.tasks.length" class="participant-items">
      <li v-for="item in store.tasks" :key="item.id">
        <Checkbox :model-value="!!item.done" binary :input-id="`pcl-task-${item.id}`" @update:model-value="toggle(item)" />
        <label :for="`pcl-task-${item.id}`">{{ item.title }}</label>
        <span v-if="item.due_date" class="badge" :class="{ 'badge-warn': isOverdue(item) }">
          due {{ item.due_date }}
        </span>
      </li>
    </ul>
    <p v-else>No tasks assigned to you.</p>
  </section>
</template>

<style scoped>
.participant-items { list-style: none; padding: 0; }
.participant-items li { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; }
</style>
