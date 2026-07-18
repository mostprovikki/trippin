<script setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
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
</script>

<template>
  <main class="page">
    <h1>Trip Readiness</h1>

    <div v-if="store.error" class="card">{{ store.error }}</div>

    <template v-if="store.data">
      <div class="card">
        <h2>Decisions</h2>
        <p>
          <span v-for="chip in decisionChips" :key="chip.label" class="badge" :class="chip.ok ? 'badge-ok' : 'badge-warn'" style="margin-right: 0.5rem;">
            {{ chip.ok ? '✓' : '✗' }} {{ chip.label }}<template v-if="chip.detail"> ({{ chip.detail }})</template>
          </span>
        </p>
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
                <span class="badge" :class="p.profile_confirmed ? 'badge-ok' : 'badge-warn'">
                  {{ p.profile_confirmed ? '✓' : '✗' }}
                </span>
              </td>
              <td>{{ p.docs_count }}</td>
              <td>
                <span v-if="!p.doc_warnings.length">—</span>
                <span v-for="(w, i) in p.doc_warnings" :key="i" class="badge badge-warn" style="margin-right: 0.25rem;">
                  {{ w.doc_type }} {{ w.level }} ({{ w.expiry_date }})
                </span>
              </td>
              <td>
                <span class="badge" :class="p.has_active_link ? 'badge-ok' : 'badge-warn'">
                  {{ p.has_active_link ? '✓' : '✗' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h2>Checklists</h2>
        <p>{{ store.data.checklists.done_items }} / {{ store.data.checklists.total_items }} done ({{ checklistPct }}%)</p>
        <div style="background:#e2e2e2; border-radius: 999px; height: 0.5rem; overflow: hidden;">
          <div :style="{ width: checklistPct + '%', height: '100%', background: '#2563eb' }"></div>
        </div>
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
