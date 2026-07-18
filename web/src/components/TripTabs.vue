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
.trip-tabs {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  margin-bottom: 1rem;
  border-bottom: 1px solid #e2e2e2;
}
.trip-tab {
  padding: 0.5rem 0.75rem;
  text-decoration: none;
  color: #1a1a1a;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
}
.trip-tab-active {
  color: #2563eb;
  border-bottom-color: #2563eb;
  font-weight: 600;
}
</style>
