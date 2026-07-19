<script setup>
import { reactive, watch } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'

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
function save() {
  emit('save', rows.map((r) => ({ start_date: r.start_date, end_date: r.end_date, note: r.note || undefined })))
}
</script>

<template>
  <div class="date-windows-editor">
    <div v-for="(row, idx) in rows" :key="idx" class="dwe-row">
      <div class="field">
        <label>Start date</label>
        <InputText type="date" v-model="row.start_date" fluid />
      </div>
      <div class="field">
        <label>End date</label>
        <InputText type="date" v-model="row.end_date" fluid />
      </div>
      <div class="field">
        <label>Note</label>
        <InputText v-model="row.note" placeholder="optional" fluid />
      </div>
      <Button type="button" label="Remove" severity="secondary" outlined size="small" @click="removeRow(idx)" />
    </div>
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
  min-width: 8rem;
  flex: 1;
}
.date-windows-editor > .p-button {
  margin-right: 0.5rem;
}
</style>
