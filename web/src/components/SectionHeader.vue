<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' }
})
</script>

<template>
  <header class="section-header">
    <div>
      <h1 class="section-title">{{ title }}</h1>
      <p v-if="description" class="section-desc">{{ description }}</p>
    </div>
    <div class="section-actions"><slot name="actions" /></div>
  </header>
</template>

<style scoped>
.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  /* shared with .list-head on the list views: one value for the page-header
     role, so content starts at the same height everywhere. */
  margin-bottom: var(--app-header-gap);
}
.section-title { margin: 0; }
.section-desc { margin: 0.25rem 0 0; color: var(--app-text-muted); font-size: 0.875rem; }
.section-actions { display: flex; gap: 0.5rem; align-items: center; }
</style>
