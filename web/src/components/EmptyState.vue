<script setup>
import Button from 'primevue/button'

defineProps({
  icon: { type: String, default: 'pi pi-inbox' },
  // Optional heading above the message. SearchView was already passing `title`
  // before this existed, so with no prop to catch it the string fell through to
  // the root element as the HTML `title` attribute — the empty-search heading
  // rendered as a hover tooltip instead of text on the page.
  title: { type: String, default: '' },
  message: { type: String, required: true },
  ctaLabel: { type: String, default: '' }
})
const emit = defineEmits(['cta'])
</script>

<template>
  <div class="empty-state">
    <i :class="icon" aria-hidden="true"></i>
    <h3 v-if="title">{{ title }}</h3>
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
/* Full-strength text: the heading carries the state, while the message below it
   stays muted as supporting detail. */
.empty-state h3 {
  margin: 0.75rem 0 0;
  color: var(--app-text);
}
.empty-state p {
  margin: 0.75rem 0 1.25rem;
  font-size: 0.9375rem;
}
</style>
