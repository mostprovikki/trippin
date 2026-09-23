<script setup>
import { computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import { formatMoney } from '../utils/format.js'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  draft: { type: Array, default: null },
  currency: { type: String, default: 'INR' }
})
const emit = defineEmits(['update:modelValue'])

function label(category) {
  return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function draftFor(category) {
  return (props.draft || []).find((d) => d.category === category)
}

// PrimeVue InputNumber only emits update:model-value on blur/Enter/spin/paste,
// not per keystroke — its onUserInput never calls updateModel, that happens in
// onInputBlur. The footer Total below is computed from modelValue, so without
// also handling @input (which does fire per keystroke, payload
// { originalEvent, value, formattedValue }) the Total stays stale while
// typing. Both events can land with the same final value (e.g. Enter fires
// input then update:model-value) — lastEmitted guards that double-fire so it
// doesn't do redundant work, not because a repeat would be wrong.
const lastEmitted = new Map()
function update(category, field, value) {
  const key = `${category}:${field}`
  if (lastEmitted.get(key) === value) return
  lastEmitted.set(key, value)
  emit('update:modelValue', props.modelValue.map((l) => (l.category === category ? { ...l, [field]: value } : l)))
}

const total = computed(() => props.modelValue.reduce((sum, l) => sum + (Number(l.estimate) || 0), 0))
</script>

<template>
  <!-- scrollable is what makes PrimeVue v4 wrap the table in an overflow:auto
       wrapper. Without it, four columns of inputs simply exceed the viewport at
       375px and the page scrolls sideways instead of the table. -->
  <DataTable :value="modelValue" data-key="category" scrollable>
    <Column header="Category">
      <template #body="{ data }">{{ label(data.category) }}</template>
      <template #footer><strong>Total</strong></template>
    </Column>
    <Column header="Estimate">
      <template #body="{ data }">
        <InputNumber
          :model-value="data.estimate"
          :min="0"
          :max-fraction-digits="2"
          fluid
          @input="update(data.category, 'estimate', Number($event.value) || 0)"
          @update:model-value="update(data.category, 'estimate', Number($event) || 0)"
        />
      </template>
      <template #footer><strong>{{ formatMoney(total, currency) }}</strong></template>
    </Column>
    <Column header="Basis">
      <template #body="{ data }">
        <InputText
          :model-value="data.basis"
          fluid
          @update:model-value="update(data.category, 'basis', $event)"
        />
      </template>
    </Column>
    <Column v-if="draft" header="AI draft">
      <template #body="{ data }">
        <span v-if="draftFor(data.category)">
          {{ formatMoney(draftFor(data.category).estimate, currency) }} — {{ draftFor(data.category).basis }}
        </span>
      </template>
    </Column>
  </DataTable>
</template>
