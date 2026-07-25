<script setup>
import Button from 'primevue/button'

defineProps({
  icon: { type: String, default: 'pi pi-inbox' },
  message: { type: String, required: true },
  ctaLabel: { type: String, default: '' }
})
const emit = defineEmits(['cta'])
</script>

<template>
  <div class="empty-state">
    <i :class="icon" aria-hidden="true"></i>
    <p>{{ message }}</p>
    <Button v-if="ctaLabel" :label="ctaLabel" size="small" @click="emit('cta')" />
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 3.5rem 1.5rem;
  color: var(--app-text-muted);
}
.empty-state i {
  font-size: 2rem;
  color: var(--app-text-subtle);
}
.empty-state p {
  margin: 0.75rem 0 1.25rem;
  font-size: 0.9375rem;
}
</style>
