<script setup>
import Button from 'primevue/button'

defineProps({
  title: { type: String, required: true },
  busy: { type: Boolean, default: false },
  error: { type: String, default: null }
})
defineEmits(['apply', 'discard'])
</script>

<template>
  <div class="draft-review card">
    <header class="draft-review-head">
      <i class="pi pi-sparkles" aria-hidden="true" />
      <h4>{{ title }}</h4>
    </header>
    <div class="draft-review-body">
      <slot><slot name="empty" /></slot>
    </div>
    <p v-if="error" class="draft-review-error" data-test="draft-error">{{ error }}</p>
    <footer class="draft-review-footer">
      <Button type="button" data-test="draft-apply" label="Apply" :disabled="busy" @click="$emit('apply')" />
      <Button type="button" data-test="draft-discard" label="Discard" severity="secondary" outlined :disabled="busy" @click="$emit('discard')" />
    </footer>
  </div>
</template>

<style scoped>
.draft-review { background: var(--app-primary-soft); }
.draft-review-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
.draft-review-head h4 { margin: 0; }
.draft-review-error { color: var(--app-danger, #c0392b); font-size: 0.875rem; }
.draft-review-footer { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
</style>
