<script setup>
import { computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import Tag from 'primevue/tag'
import { formatMoney, budgetCategoryLabel as label } from '../utils/format.js'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  draft: { type: Array, default: null },
  currency: { type: String, default: 'INR' },
  // trip-planner-53h: read mode (formatted text, no inputs) is the default;
  // the parent card owns the Edit budget / Save / Cancel toggle and passes
  // this down once the owner opts into editing.
  editing: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

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
  <DataTable :value="modelValue" data-key="category" scrollable class="budget-table dense">
    <Column header="Category">
      <template #body="{ data }">
        {{ label(data.category) }}
        <!-- booked vs estimated (trip-planner-ztt): a booked line's estimate is what was paid -->
        <label v-if="editing" class="booked-toggle" :for="`bt-booked-${data.category}`">
          <Checkbox binary :input-id="`bt-booked-${data.category}`" :model-value="!!data.booked" @update:model-value="update(data.category, 'booked', !!$event)" />
          Booked
        </label>
        <Tag v-else-if="data.booked" value="booked" severity="success" class="line-booked" data-test="line-booked" />
      </template>
      <template #footer><strong>Total</strong></template>
    </Column>
    <Column header="Estimate">
      <template #body="{ data }">
        <InputNumber
          v-if="editing"
          :input-id="`bt-estimate-${data.category}`"
          :name="`bt-estimate-${data.category}`"
          :model-value="data.estimate"
          :min="0"
          :max-fraction-digits="2"
          fluid
          @input="update(data.category, 'estimate', Number($event.value) || 0)"
          @update:model-value="update(data.category, 'estimate', Number($event) || 0)"
        />
        <span v-else>{{ formatMoney(data.estimate, currency) }}</span>
      </template>
      <template #footer><strong>{{ formatMoney(total, currency) }}</strong></template>
    </Column>
    <Column header="Basis" class="budget-basis-col">
      <template #body="{ data }">
        <InputText
          v-if="editing"
          :id="`bt-basis-${data.category}`"
          :name="`bt-basis-${data.category}`"
          :model-value="data.basis"
          fluid
          @update:model-value="update(data.category, 'basis', $event)"
        />
        <span v-else class="budget-basis-text">{{ data.basis }}</span>
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

<style scoped>
/* trip-planner-53h: dense rows in both read and edit mode — PrimeVue's
   default cell padding is generous enough that four columns of inputs (or
   text) waste vertical space; :deep() is required because DataTable renders
   its own td/th elements outside this component's scoped styles. */
.budget-table.dense :deep(.p-datatable-tbody > tr > td),
.budget-table.dense :deep(.p-datatable-thead > tr > th) {
  padding-block: 0.5rem;
}

.booked-toggle { display: flex; align-items: center; gap: 0.375rem; margin-top: 0.25rem; font-size: 0.875rem; color: var(--app-text-muted); cursor: pointer; }
.line-booked { margin-left: 0.375rem; }

/* Read mode's basis text should wrap fully instead of clipping the way the
   fixed-width input does. */
.budget-basis-text {
  white-space: normal;
  word-break: break-word;
}

/* Phone (§4): the Basis column was ~60px wide, wrapping a few characters per
   line (a 2000px table at 390). Under 640px each line becomes a block:
   category + estimate on one line, Basis (and the AI draft) full width below. */
@media (max-width: 640px) {
  .budget-table :deep(.p-datatable-thead) { display: none; }
  .budget-table :deep(.p-datatable-table) { display: block; min-width: 0 !important; }
  .budget-table :deep(.p-datatable-tbody),
  .budget-table :deep(.p-datatable-tfoot) { display: block; }
  .budget-table :deep(.p-datatable-tbody > tr),
  .budget-table :deep(.p-datatable-tfoot > tr) {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 0.75rem;
    border-bottom: 1px solid var(--app-border);
  }
  .budget-table :deep(.p-datatable-tbody > tr > td),
  .budget-table :deep(.p-datatable-tfoot > tr > td) { border: 0; padding-inline: 0; }
  .budget-table :deep(.p-datatable-tbody > tr > td:nth-child(n + 3)) {
    grid-column: 1 / -1; padding-top: 0; color: var(--app-text-muted); font-size: 0.875rem;
  }
  .budget-table :deep(.p-datatable-tbody > tr > td:nth-child(2)),
  .budget-table :deep(.p-datatable-tfoot > tr > td:nth-child(2)) { text-align: right; font-variant-numeric: tabular-nums; }
  .budget-table :deep(.p-datatable-tbody > tr > td:nth-child(2) .p-inputnumber) { width: 8rem; }
  .budget-table :deep(.p-datatable-tfoot > tr > td:nth-child(n + 3)) { display: none; }
  /* the label is the tap target for the 20px box (§4 44px) */
  .booked-toggle { min-height: 2.75rem; margin-top: 0; }
}
</style>
