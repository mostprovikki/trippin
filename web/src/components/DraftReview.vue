<script setup>
import Button from 'primevue/button'

defineProps({
  title: { type: String, required: true },
  busy: { type: Boolean, default: false },
  error: { type: String, default: null },
  // BYO-AI import: Tripper can't vouch for which model wrote it. One line, no badge (d5d).
  pasted: { type: Boolean, default: false }
})
defineEmits(['apply', 'discard'])
</script>

<template>
  <div class="draft-review card">
    <header class="draft-review-head">
      <i class="pi pi-sparkles" aria-hidden="true" />
      <h4>{{ title }}</h4>
    </header>
    <p v-if="pasted" class="draft-review-provenance" data-test="draft-pasted">Pasted draft — source not verified by Tripper</p>
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
.draft-review-provenance { margin: 0 0 0.5rem; color: var(--app-text-muted); font-size: 0.875rem; }
.draft-review-error { color: var(--app-danger, #c0392b); font-size: 0.875rem; }
.draft-review-footer { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
</style>
