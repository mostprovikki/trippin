<script setup>
import { reactive } from 'vue'
import { useConfirm } from 'primevue/useconfirm'

const props = defineProps({
  goals: { type: Array, default: () => [] }
})
const emit = defineEmits(['add', 'update', 'delete'])
const confirm = useConfirm()

const form = reactive({ title: '', fixed_date: '', fixed_place: '', notes: '' })
const editing = reactive({})

function submitAdd() {
  if (!form.title) return
  emit('add', {
    title: form.title,
    fixed_date: form.fixed_date || undefined,
    fixed_place: form.fixed_place || undefined,
    notes: form.notes || undefined
  })
  form.title = ''; form.fixed_date = ''; form.fixed_place = ''; form.notes = ''
}

function startEdit(goal) {
  editing[goal.id] = { title: goal.title, fixed_date: goal.fixed_date || '', fixed_place: goal.fixed_place || '', notes: goal.notes || '' }
}
function cancelEdit(id) {
  delete editing[id]
}
function submitEdit(id) {
  const e = editing[id]
  emit('update', id, {
    title: e.title,
    fixed_date: e.fixed_date || undefined,
    fixed_place: e.fixed_place || undefined,
    notes: e.notes || undefined
  })
  delete editing[id]
}
function remove(id) {
  confirm.require({
    message: 'Delete this goal?', header: 'Delete goal', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Delete', acceptClass: 'p-button-danger', rejectLabel: 'Cancel',
    accept: () => emit('delete', id)
  })
}
</script>

<template>
  <div class="goals-editor">
    <ul class="goals-list">
      <li v-for="goal in goals" :key="goal.id" class="goal-item">
        <template v-if="editing[goal.id]">
          <div class="field"><label>Title</label><input v-model="editing[goal.id].title" /></div>
          <div class="field"><label>Fixed date</label><input type="date" v-model="editing[goal.id].fixed_date" /></div>
          <div class="field"><label>Fixed place</label><input v-model="editing[goal.id].fixed_place" /></div>
          <div class="field"><label>Notes</label><textarea v-model="editing[goal.id].notes"></textarea></div>
          <button type="button" class="btn btn-primary" @click="submitEdit(goal.id)">Save</button>
          <button type="button" class="btn" @click="cancelEdit(goal.id)">Cancel</button>
        </template>
        <template v-else>
          <strong>{{ goal.title }}</strong>
          <span v-if="goal.fixed_date"> — {{ goal.fixed_date }}</span>
          <span v-if="goal.fixed_place"> @ {{ goal.fixed_place }}</span>
          <p v-if="goal.notes">{{ goal.notes }}</p>
          <button type="button" class="btn" @click="startEdit(goal)">Edit</button>
          <button type="button" class="btn" @click="remove(goal.id)">Delete</button>
        </template>
      </li>
    </ul>
    <form class="goal-add-form" @submit.prevent="submitAdd">
      <div class="field"><label>New goal title</label><input v-model="form.title" placeholder="e.g. Visit temple" /></div>
      <div class="field"><label>Fixed date</label><input type="date" v-model="form.fixed_date" /></div>
      <div class="field"><label>Fixed place</label><input v-model="form.fixed_place" /></div>
      <div class="field"><label>Notes</label><textarea v-model="form.notes"></textarea></div>
      <button type="submit" class="btn btn-primary">Add goal</button>
    </form>
  </div>
</template>

<style scoped>
.goals-list { list-style: none; padding: 0; }
.goal-item { border-bottom: 1px solid #e2e2e2; padding: 0.5rem 0; }
</style>
