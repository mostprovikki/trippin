<script setup>
defineProps({
  tripId: { type: String, required: true }
})

const tabs = [
  { label: 'Overview', name: 'trip' },
  { label: 'Budget', name: 'trip-budget' },
  { label: 'Itinerary', name: 'trip-itinerary' },
  { label: 'Checklists', name: 'trip-checklists' },
  { label: 'Readiness', name: 'trip-readiness' },
  { label: 'Archive', name: 'trip-archive' }
]
</script>

<template>
  <nav class="trip-tabs">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.name"
      :to="{ name: tab.name, params: { id: tripId } }"
      class="trip-tab"
      active-class="trip-tab-active"
    >{{ tab.label }}</RouterLink>
  </nav>
</template>

<style scoped>
/* Router-driven tab bar styled with PrimeVue design tokens (Tabs component
   doesn't fit router navigation, so this mirrors its underline look). */
.trip-tabs {
  display: flex;
  gap: 0.25rem;
  overflow-x: auto;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--p-content-border-color, #e2e2e2);
}
.trip-tab {
  padding: 0.5rem 0.875rem;
  text-decoration: none;
  color: var(--p-text-muted-color, #6b7280);
  font-weight: 500;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.2s, border-color 0.2s;
}
.trip-tab:hover {
  color: var(--p-text-color, #1a1a1a);
}
.trip-tab-active {
  color: var(--p-primary-color, #2563eb);
  border-bottom-color: var(--p-primary-color, #2563eb);
  font-weight: 600;
}
</style>
