<script setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Tag from 'primevue/tag'
import ProgressBar from 'primevue/progressbar'
import Message from 'primevue/message'
import { useReadinessStore } from '../stores/readiness.js'

const route = useRoute()
const tripId = route.params.id
const store = useReadinessStore()

onMounted(() => store.fetch(tripId))

const decisionChips = computed(() => {
  const d = store.data?.decisions
  if (!d) return []
  return [
    { label: 'Dates', ok: !!d.dates_confirmed },
    { label: 'Destination', ok: !!d.destination_decided },
    { label: 'Budget', ok: !!d.budget_drafted },
    { label: 'Itinerary', ok: d.itinerary_days > 0, detail: `${d.itinerary_days} day(s)` }
  ]
})

const checklistPct = computed(() => {
  const c = store.data?.checklists
  if (!c || !c.total_items) return 0
  return Math.round((c.done_items / c.total_items) * 100)
})

function chipText(chip) {
  return `${chip.ok ? '✓' : '✗'} ${chip.label}${chip.detail ? ` (${chip.detail})` : ''}`
}
</script>

<template>
  <main class="page">
    <h1>Trip Readiness</h1>

    <Message v-if="store.error" severity="error" :closable="false">{{ store.error }}</Message>

    <template v-if="store.data">
      <div class="card">
        <h2>Decisions</h2>
        <div class="tag-row">
          <Tag
            v-for="chip in decisionChips"
            :key="chip.label"
            :value="chipText(chip)"
            :severity="chip.ok ? 'success' : 'warn'"
          />
        </div>
      </div>

      <div class="card">
        <h2>Participants</h2>
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Profile</th>
              <th>Docs</th>
              <th>Doc warnings</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in store.data.participants" :key="p.person_id">
              <td>{{ p.name }}</td>
              <td>
                <Tag :value="p.profile_confirmed ? '✓' : '✗'" :severity="p.profile_confirmed ? 'success' : 'warn'" />
              </td>
              <td>{{ p.docs_count }}</td>
              <td>
                <span v-if="!p.doc_warnings.length">—</span>
                <div v-else class="tag-row">
                  <Tag
                    v-for="(w, i) in p.doc_warnings"
                    :key="i"
                    :value="`${w.doc_type} ${w.level} (${w.expiry_date})`"
                    severity="warn"
                  />
                </div>
              </td>
              <td>
                <Tag :value="p.has_active_link ? '✓' : '✗'" :severity="p.has_active_link ? 'success' : 'warn'" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h2>Checklists</h2>
        <p>{{ store.data.checklists.done_items }} / {{ store.data.checklists.total_items }} done ({{ checklistPct }}%)</p>
        <ProgressBar :value="checklistPct" :show-value="false" style="height: 0.5rem" />
        <h3>Overdue</h3>
        <p v-if="!store.data.checklists.overdue.length">No overdue items.</p>
        <ul v-else>
          <li v-for="(item, i) in store.data.checklists.overdue" :key="i">
            {{ item.title }} — due {{ item.due_date }}<template v-if="item.assignee_name"> ({{ item.assignee_name }})</template>
          </li>
        </ul>
      </div>
    </template>
  </main>
</template>

<style scoped>
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
