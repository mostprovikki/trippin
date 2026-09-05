<script setup>
import { ref, computed } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useItineraryStore } from '../stores/itinerary.js'
import { useAuthStore } from '../stores/auth.js'
import ItineraryItemForm from './ItineraryItemForm.vue'
import DraftReview from './DraftReview.vue'
import { formatMoney } from '../utils/format.js'
import { dayHeader, formatDayDate } from '../utils/dates.js'
import { categoryIcon, parseTimeRange } from '../utils/itinerary.js'

const props = defineProps({
  day: { type: Object, required: true },
  index: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  isToday: { type: Boolean, default: false }
})
const store = useItineraryStore()
const auth = useAuthStore()
const confirm = useConfirm()
const aiEnabled = computed(() => auth.aiEnabled)

function isItemNow(item) {
  if (!props.isToday) return false
  const range = parseTimeRange(item.time_range)
  if (!range) return false
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = range.start.split(':').map(Number)
  const [eh, em] = range.end.split(':').map(Number)
  const start = sh * 60 + sm
  const end = eh * 60 + em
  // Overnight range (end < start, e.g. "22:00–02:00"): the end time is on the
  // *next* calendar day, but this card's `isToday` only says this day is
  // today — it says nothing about tomorrow's card. So an overnight item stays
  // highlighted from its start until midnight on today's card; matching it
  // again after midnight on tomorrow's card is out of scope (isToday gates by
  // day, so that's a separate DayCard's concern, not this one's).
  if (end < start) return mins >= start
  return mins >= start && mins <= end
}

const adding = ref(false)
const editingId = ref(null)
const instruction = ref('')

const editingItem = computed(() => props.day.items.find((it) => it.id === editingId.value) || null)
const dayDraft = computed(() => store.dayDrafts[props.day.id] || null)

async function move(idx, dir) {
  const items = [...props.day.items]
  const j = idx + dir
  if (j < 0 || j >= items.length) return
  ;[items[idx], items[j]] = [items[j], items[idx]]
  await store.reorder(props.day.id, items.map((it) => it.id))
}

// confirmed even though it is a single item: the row is only a summary — notes
// and link are never shown here — so the click destroys work the user cannot
// see, let alone re-type. Delete also sits last in a four-button cluster right
// beside Edit, which is the misclick this catches.
function remove(item) {
  confirm.require({
    message: `Delete "${item.title}" from ${formatDayDate(props.day.day_date)}? Its time, location, cost and notes go with it.`,
    header: 'Delete itinerary item', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Delete', acceptClass: 'p-button-danger', rejectLabel: 'Cancel',
    accept: async () => { try { await store.deleteItem(item.id) } catch { /* store.error is rendered by the parent view */ } }
  })
}

async function onAddSubmit(item) {
  await store.addItem(props.day.id, item)
  adding.value = false
}

async function onEditSubmit(item) {
  await store.updateItem(editingId.value, item)
  editingId.value = null
}

async function regen() {
  await store.aiRegenDay(props.day.id, instruction.value || null)
}

async function applyDayDraft() {
  await store.applyDay(props.day.id)
}

function discardDayDraft() {
  delete store.dayDrafts[props.day.id]
}
</script>

<template>
  <div class="card">
    <h3>{{ dayHeader(day.day_date, index) }} <Tag v-if="isToday" value="Today" severity="success" /></h3>
    <ul class="day-items">
      <li v-for="(item, idx) in day.items" :key="item.id" class="day-item" :class="{ 'day-item-now': isItemNow(item) }">
        <span>{{ categoryIcon(item.category) }}</span>
        <Tag v-if="item.time_range" :value="item.time_range" severity="secondary" />
        <strong>{{ item.title }}</strong>
        <span v-if="item.location">— {{ item.location }}</span>
        <span v-if="item.est_cost != null">{{ formatMoney(item.est_cost, currency) }}</span>
        <span class="day-item-actions">
          <Button type="button" severity="secondary" outlined :disabled="idx === 0" @click="move(idx, -1)">↑</Button>
          <Button type="button" severity="secondary" outlined :disabled="idx === day.items.length - 1" @click="move(idx, 1)">↓</Button>
          <Button type="button" label="Edit" severity="secondary" outlined @click="editingId = item.id" />
          <Button type="button" icon="pi pi-trash" severity="secondary" text rounded class="icon-danger-btn" :aria-label="`Delete ${item.title}`" @click="remove(item)" />
        </span>
      </li>
    </ul>

    <ItineraryItemForm v-if="editingId" :item="editingItem" @submit="onEditSubmit" @cancel="editingId = null" />

    <p v-if="!adding && !editingId">
      <Button type="button" label="Add item" severity="secondary" outlined @click="adding = true" />
    </p>
    <ItineraryItemForm v-if="adding" @submit="onAddSubmit" @cancel="adding = false" />

    <div class="day-ai">
      <div v-if="aiEnabled">
        <div class="field">
          <label>Regenerate instruction (optional)</label>
          <input v-model="instruction" placeholder="e.g. more relaxed" />
        </div>
        <Button type="button" severity="secondary" outlined :loading="store.aiBusy" @click="regen">
          {{ store.aiBusy ? 'Generating…' : 'Regenerate day' }}
        </Button>
      </div>
      <Tag v-else severity="secondary" value="AI suggestions are turned off" />
    </div>

    <DraftReview v-if="dayDraft" :title="`Draft for ${formatDayDate(day.day_date)}`" :busy="store.aiBusy" @apply="applyDayDraft" @discard="discardDayDraft">
      <ul class="day-items">
        <li v-for="(it, i) in dayDraft" :key="i">
          {{ categoryIcon(it.category) }}
          <Tag v-if="it.time_range" :value="it.time_range" severity="secondary" />
          <strong>{{ it.title }}</strong>
          <span v-if="it.location">— {{ it.location }}</span>
          <span v-if="it.est_cost != null">{{ formatMoney(it.est_cost, currency) }}</span>
        </li>
      </ul>
    </DraftReview>
  </div>
</template>

<style scoped>
.day-items { list-style: none; padding: 0; margin: 0; }
/* Icon, time, title, location, cost and four action buttons on one line cannot
   fit 375px; unwrapped they widen the page itself instead of the row. Wrapping
   lets .day-item-actions drop to its own line, which is where its margin-left:
   auto was already trying to put it. */
.day-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0; border-bottom: 1px solid var(--app-border); flex-wrap: wrap; }
.day-item-actions { margin-left: auto; display: flex; gap: 0.25rem; }
/* A soft background alone is close to invisible in light mode
   (--app-primary-soft is #f0fdfa on an off-white surface) — the left accent
   border gives a visible edge in both themes regardless of how faint the
   fill color is. */
.day-item-now { background: var(--app-primary-soft); border-left: 3px solid var(--app-primary); border-radius: var(--app-radius-sm); padding-left: 0.5rem; }
.day-ai { margin-top: 1rem; }
</style>
