<script setup>
// tripper.md §2 Before tomorrow · N open, checkable in place (§4 one click:
// tick an item). The parent writes the tick; a row ticked here stays listed
// (ticked, still untickable) so the list doesn't shift and focus stays on the checkbox.
import { computed, reactive } from 'vue'
import { useRoute } from 'vue-router'
import { dueByTomorrow } from '../../utils/overview.js'

const props = defineProps({
  checklists: { type: Array, default: () => [] },
  tomorrowIso: { type: String, required: true }
})
const emit = defineEmits(['toggle'])
const route = useRoute()
const tickedHere = reactive(new Set())
const rows = computed(() => dueByTomorrow(props.checklists, props.tomorrowIso, tickedHere))
const open = computed(() => rows.value.filter((i) => !i.done).length)
// Never disabled once ticked: a disabled control drops keyboard focus in
// Chrome. Unticking a row ticked here is allowed and just undoes it.
function toggle(item, done) {
  tickedHere.add(item.id)
  emit('toggle', item, done)
}
</script>

<template>
  <section class="card overview-card before-tomorrow-card" aria-labelledby="bt-h">
    <h2 id="bt-h" class="overview-card-title">Before tomorrow · {{ open }} open</h2>
    <p v-if="!rows.length" class="overview-empty">Nothing due before tomorrow.</p>
    <ul v-else class="overview-rows">
      <li v-for="item in rows" :key="item.id" :class="['overview-row', 'overview-row-plain', { 'is-done': item.done }]">
        <label class="bt-item">
          <input type="checkbox" :checked="!!item.done" @change="toggle(item, $event.target.checked)" />
          <span>{{ item.title }}</span>
        </label>
        <span class="overview-row-reason checklist-who">{{ item.assignee_name || 'Anyone' }}</span>
      </li>
    </ul>
    <p class="overview-card-foot">
      <RouterLink :to="{ name: 'trip-checklists', params: { id: route.params.id } }">All checklists</RouterLink>
    </p>
  </section>
</template>
