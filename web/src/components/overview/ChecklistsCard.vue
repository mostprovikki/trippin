<script setup>
// tripper.md §2 Checklists card: `N open`, unassigned first. N is the same
// number as the Checklists tab badge (§6 one number, one place).
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Tag from 'primevue/tag'
import { openChecklistItems } from '../../utils/overview.js'

const props = defineProps({ checklists: { type: Array, default: () => [] } })
const route = useRoute()
const CAP = 5
const open = computed(() => openChecklistItems(props.checklists))
const shown = computed(() => open.value.slice(0, CAP))
</script>

<template>
  <section class="card overview-card checklists-card" aria-labelledby="chk-h">
    <h2 id="chk-h" class="overview-card-title">Checklists · {{ open.length }} open</h2>
    <p v-if="!open.length" class="overview-empty">Nothing open.</p>
    <ul v-else class="overview-rows">
      <li v-for="item in shown" :key="item.id" class="overview-row overview-row-plain">
        <span class="checklist-title">{{ item.title }}</span>
        <Tag v-if="item.unassigned" value="Unassigned" severity="warn" />
        <span v-else class="overview-row-reason checklist-who">{{ item.who }}</span>
      </li>
    </ul>
    <p v-if="open.length" class="overview-card-foot">
      <RouterLink :to="{ name: 'trip-checklists', params: { id: route.params.id } }">All {{ open.length }} open items</RouterLink>
    </p>
  </section>
</template>
