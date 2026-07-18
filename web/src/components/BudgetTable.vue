<script setup>
import { computed } from 'vue'

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
  <table class="table">
    <thead>
      <tr>
        <th>Category</th>
        <th>Estimate</th>
        <th>Basis</th>
        <th v-if="draft">AI draft</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="line in modelValue" :key="line.category">
        <td>{{ label(line.category) }}</td>
        <td>
          <input
            type="number"
            min="0"
            step="0.01"
            :value="line.estimate"
            @input="update(line.category, 'estimate', Number($event.target.value))"
          />
        </td>
        <td>
          <input
            type="text"
            :value="line.basis"
            @input="update(line.category, 'basis', $event.target.value)"
          />
        </td>
        <td v-if="draft">
          <span v-if="draftFor(line.category)">
            {{ draftFor(line.category).estimate }} — {{ draftFor(line.category).basis }}
          </span>
        </td>
      </tr>
      <tr>
        <td><strong>Total</strong></td>
        <td><strong>{{ total }}</strong></td>
        <td></td>
        <td v-if="draft"></td>
      </tr>
    </tbody>
  </table>
</template>
