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
  text-align: center;
  padding: 2rem 1rem;
  color: #6b7280;
}
.empty-state i { font-size: 2rem; }
.empty-state p { margin: 0.5rem 0 1rem; }
</style>
