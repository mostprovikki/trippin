<script setup>
import { reactive, watch } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import DateField from './DateField.vue'

const props = defineProps({
  windows: { type: Array, default: () => [] }
})
const emit = defineEmits(['save'])

const rows = reactive([])

function loadFrom(list) {
  rows.splice(0, rows.length)
  for (const w of list || []) rows.push({ start_date: w.start_date, end_date: w.end_date, note: w.note || '' })
}
loadFrom(props.windows)
watch(() => props.windows, (v) => loadFrom(v))

function addRow() {
  rows.push({ start_date: '', end_date: '', note: '' })
}
function removeRow(idx) {
  rows.splice(idx, 1)
}
// Parse 'YYYY-MM-DD' in *local* time (never `new Date(str)`, which is UTC and
// can shift the day) so the end date can't be picked before the start date.
function isoToDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return undefined
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
function save() {
  emit('save', rows.map((r) => ({ start_date: r.start_date, end_date: r.end_date, note: r.note || undefined })))
}
</script>

<template>
  <div class="date-windows-editor">
    <div v-for="(row, idx) in rows" :key="idx" class="dwe-row">
      <div class="field">
        <label>Start date</label>
        <DateField v-model="row.start_date" />
      </div>
      <div class="field">
        <label>End date</label>
        <DateField v-model="row.end_date" :min-date="isoToDate(row.start_date)" />
      </div>
      <div class="field">
        <label>Note</label>
        <InputText v-model="row.note" placeholder="optional" fluid />
      </div>
      <Button type="button" label="Remove" severity="secondary" outlined size="small" @click="removeRow(idx)" />
    </div>
    <p v-if="!rows.length" class="dwe-empty">
      <i class="pi pi-calendar-plus" aria-hidden="true" /> No date windows yet — add one to propose dates.
    </p>
    <Button type="button" label="Add date window" severity="secondary" outlined @click="addRow" />
    <Button type="button" label="Save windows" @click="save" />
  </div>
</template>

<style scoped>
.dwe-row {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}
.dwe-row .field {
  margin-bottom: 0;
  /* Roomier than the old native date input: 'd M yy' text plus the inline
     calendar icon needs more than 8rem before it starts clipping. */
  min-width: 11rem;
  flex: 1;
}
.date-windows-editor > .p-button {
  margin-right: 0.5rem;
}
.dwe-empty {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.75rem;
  color: var(--app-text-muted);
  font-size: 0.9375rem;
}
</style>
