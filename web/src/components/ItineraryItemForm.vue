<script setup>
import { reactive, watch } from 'vue'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Button from 'primevue/button'

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
      <InputText v-model="form.title" required fluid />
    </div>
    <div class="field">
      <label>Time</label>
      <InputText v-model="form.time_range" placeholder="e.g. 09:00-11:00" fluid />
    </div>
    <div class="field">
      <label>Location</label>
      <InputText v-model="form.location" fluid />
    </div>
    <div class="field">
      <label>Category</label>
      <Select v-model="form.category" :options="categories" fluid />
    </div>
    <div class="field">
      <label>Estimated cost</label>
      <InputText v-model="form.est_cost" type="number" step="0.01" fluid />
    </div>
    <div class="field">
      <label>Notes</label>
      <Textarea v-model="form.notes" fluid auto-resize />
    </div>
    <div class="field">
      <label>Link</label>
      <InputText v-model="form.link" fluid />
    </div>
    <Button type="submit" label="Save" />
    <Button type="button" label="Cancel" severity="secondary" outlined @click="$emit('cancel')" />
  </form>
</template>
