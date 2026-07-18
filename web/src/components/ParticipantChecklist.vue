<script setup>
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
    <ul v-if="store.packing.length">
      <li v-for="item in store.packing" :key="item.id">
        <label>
          <input type="checkbox" :checked="!!item.done" @change="toggle(item)" />
          {{ item.title }}
        </label>
        <span class="badge">{{ item.checklist_name }}</span>
      </li>
    </ul>
    <p v-else>Nothing to pack yet.</p>

    <h3>Tasks</h3>
    <ul v-if="store.tasks.length">
      <li v-for="item in store.tasks" :key="item.id">
        <label>
          <input type="checkbox" :checked="!!item.done" @change="toggle(item)" />
          {{ item.title }}
        </label>
        <span v-if="item.due_date" class="badge" :class="{ 'badge-warn': isOverdue(item) }">
          due {{ item.due_date }}
        </span>
      </li>
    </ul>
    <p v-else>No tasks assigned to you.</p>
  </section>
</template>
