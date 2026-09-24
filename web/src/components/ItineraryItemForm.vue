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
  <form class="card iif-form" @submit.prevent="submit">
    <div class="iif-grid">
      <div class="field iif-title">
        <label>Title</label>
        <InputText id="iif-title" name="iif-title" v-model="form.title" required fluid />
      </div>
      <div class="field iif-time">
        <label>Time</label>
        <InputText id="iif-time-range" name="iif-time-range" v-model="form.time_range" placeholder="e.g. 09:00-11:00" fluid />
      </div>
      <div class="field iif-category">
        <label>Category</label>
        <Select input-id="iif-category" name="iif-category" v-model="form.category" :options="categories" fluid />
      </div>
      <div class="field iif-cost">
        <label>Estimated cost</label>
        <InputText id="iif-est-cost" name="iif-est-cost" v-model="form.est_cost" type="number" step="0.01" fluid />
      </div>
      <div class="field iif-location">
        <label>Location</label>
        <InputText id="iif-location" name="iif-location" v-model="form.location" fluid />
      </div>
      <div class="field iif-link">
        <label>Link</label>
        <InputText id="iif-link" name="iif-link" v-model="form.link" fluid />
      </div>
      <div class="field iif-notes">
        <label>Notes</label>
        <Textarea v-model="form.notes" fluid auto-resize />
      </div>
    </div>
    <div class="iif-actions">
      <Button type="submit" label="Save" />
      <Button type="button" label="Cancel" severity="secondary" outlined @click="$emit('cancel')" />
    </div>
  </form>
</template>

<style scoped>
/* Compact grid: Title full-width; Time · Category · Est. cost on one row;
   Location · Link on one row; Notes full-width. 6 columns is the LCM of the
   3-across and 2-across rows so both fit the same track without a nested
   grid. Collapses to one column at phone width (participant pages are
   phones) by resetting every span back to the full row. */
.iif-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.5rem 0.75rem; }
.iif-title, .iif-notes { grid-column: 1 / -1; }
.iif-time, .iif-category, .iif-cost { grid-column: span 2; }
.iif-location, .iif-link { grid-column: span 3; }
/* Tighter than the global .field (1rem bottom margin, 0.375rem label gap) —
   this form's fields sit in a dense grid rather than a single stacked column,
   so the extra breathing room the global rule budgets for isn't needed here.
   Selector wins on specificity via the scoped data-v attribute, not via
   `!important`. */
.iif-form :deep(.field) { margin-bottom: 0; }
.iif-form :deep(.field label) { margin-bottom: 0.25rem; font-size: 0.75rem; }
.iif-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }

@media (max-width: 30rem) {
  .iif-grid { grid-template-columns: 1fr; }
  .iif-title, .iif-notes, .iif-time, .iif-category, .iif-cost, .iif-location, .iif-link {
    grid-column: auto;
  }
}
</style>
