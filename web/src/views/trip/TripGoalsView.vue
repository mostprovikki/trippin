<script setup>
import { useRoute } from 'vue-router'
import { useTripsStore } from '../../stores/trips.js'
import { useNotify } from '../../composables/useNotify.js'
import SectionHeader from '../../components/SectionHeader.vue'
import GoalsEditor from '../../components/GoalsEditor.vue'

const route = useRoute()
const trips = useTripsStore()
const notify = useNotify()

async function onAdd(goal) {
  try { await trips.addGoal(route.params.id, goal) } catch (e) { notify.error(e.message) }
}
async function onUpdate(goalId, goal) {
  try { await trips.updateGoal(goalId, goal) } catch (e) { notify.error(e.message) }
}
async function onDelete(goalId) {
  try { await trips.deleteGoal(goalId) } catch (e) { notify.error(e.message) }
}
</script>

<template>
  <div>
    <SectionHeader title="Goals" description="What this trip is for — fixed events, must-dos, shared intentions." />
    <div class="card">
      <GoalsEditor :goals="trips.current?.goals || []" @add="onAdd" @update="onUpdate" @delete="onDelete" />
    </div>
  </div>
</template>
