<script setup>
import { computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Tag from 'primevue/tag'
import ProgressBar from 'primevue/progressbar'
import Message from 'primevue/message'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useReadinessStore } from '../../stores/readiness.js'
import SectionHeader from '../../components/SectionHeader.vue'

const route = useRoute()
const tripId = computed(() => route.params.id)
const store = useReadinessStore()

async function load() {
  // Nothing to clear: fetch() drops another trip's data itself, and keeps this
  // trip's in place so the sidebar badges reading the same store don't blink.
  try { await store.fetch(tripId.value) } catch { /* store.error drives the banner */ }
}

onMounted(load)
// Belt and braces, not the mechanism. Trip-scoped stores now clear themselves
// when asked about a different trip, which empties trips.current and makes
// TripLayout fall back to its skeleton — that unmounts this view, so onMounted
// covers the common path today (verified in a browser: the skeleton really does
// appear on a param-only switch). Kept because the reuse it guards against is
// silent when it returns: the sidebar would say one trip and the body show
// another, with edits written to whichever id the view captured first.
watch(tripId, load)

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
  <div>
    <SectionHeader title="Readiness" description="Is everyone — and everything — actually ready?" />

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
        <DataTable :value="store.data.participants" data-key="person_id">
          <Column field="name" header="Name" />
          <Column header="Profile">
            <template #body="{ data }">
              <Tag :value="data.profile_confirmed ? '✓' : '✗'" :severity="data.profile_confirmed ? 'success' : 'warn'" />
            </template>
          </Column>
          <Column field="docs_count" header="Docs" />
          <Column header="Doc warnings">
            <template #body="{ data }">
              <span v-if="!data.doc_warnings.length">—</span>
              <div v-else class="tag-row">
                <Tag
                  v-for="(w, i) in data.doc_warnings"
                  :key="i"
                  :value="`${w.doc_type} ${w.level} (${w.expiry_date})`"
                  severity="warn"
                />
              </div>
            </template>
          </Column>
          <Column header="Link">
            <template #body="{ data }">
              <Tag :value="data.has_active_link ? '✓' : '✗'" :severity="data.has_active_link ? 'success' : 'warn'" />
            </template>
          </Column>
        </DataTable>
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
  </div>
</template>

<style scoped>
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
