<script setup>
import { computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  draft: { type: Array, default: null }
})
const emit = defineEmits(['update:modelValue'])

function label(category) {
  return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function draftFor(category) {
  return (props.draft || []).find((d) => d.category === category)
}

function update(category, field, value) {
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
          @update:model-value="update(data.category, 'estimate', Number($event) || 0)"
        />
      </template>
      <template #footer><strong>{{ total }}</strong></template>
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
          {{ draftFor(data.category).estimate }} — {{ draftFor(data.category).basis }}
        </span>
      </template>
    </Column>
  </DataTable>
</template>
