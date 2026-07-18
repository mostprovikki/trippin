<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({ item: { type: Object, default: null } })
const emit = defineEmits(['submit', 'cancel'])

const categories = ['travel', 'food', 'activity', 'rest', 'logistics']

const form = reactive({
  title: '', time_range: '', location: '', category: 'activity', est_cost: '', notes: '', link: ''
})

function load(item) {
  form.title = item?.title || ''
  form.time_range = item?.time_range || ''
  form.location = item?.location || ''
  form.category = item?.category || 'activity'
  form.est_cost = item?.est_cost ?? ''
  form.notes = item?.notes || ''
  form.link = item?.link || ''
}
load(props.item)
watch(() => props.item, load)

function submit() {
  emit('submit', {
    title: form.title,
    time_range: form.time_range || null,
    location: form.location || null,
    category: form.category,
    est_cost: form.est_cost === '' ? null : Number(form.est_cost),
    notes: form.notes || null,
    link: form.link || null
  })
}
</script>

<template>
  <form class="card" @submit.prevent="submit">
    <div class="field">
      <label>Title</label>
      <input v-model="form.title" required />
    </div>
    <div class="field">
      <label>Time</label>
      <input v-model="form.time_range" placeholder="e.g. 09:00-11:00" />
    </div>
    <div class="field">
      <label>Location</label>
      <input v-model="form.location" />
    </div>
    <div class="field">
      <label>Category</label>
      <select v-model="form.category">
        <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>
    <div class="field">
      <label>Estimated cost</label>
      <input v-model="form.est_cost" type="number" step="0.01" />
    </div>
    <div class="field">
      <label>Notes</label>
      <textarea v-model="form.notes"></textarea>
    </div>
    <div class="field">
      <label>Link</label>
      <input v-model="form.link" />
    </div>
    <button class="btn btn-primary" type="submit">Save</button>
    <button class="btn" type="button" @click="$emit('cancel')">Cancel</button>
  </form>
</template>
