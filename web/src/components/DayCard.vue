<script setup>
import { computed } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useItineraryStore } from '../stores/itinerary.js'
import ItineraryItemForm from './ItineraryItemForm.vue'
import { formatMoney } from '../utils/format.js'
import { dayHeader, formatDayDate } from '../utils/dates.js'
import { parseTimeRange } from '../utils/itinerary.js'

const props = defineProps({
  day: { type: Object, required: true },
  index: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  isToday: { type: Boolean, default: false },
  // Shared, page-wide "which single item form is open" state, owned by
  // TripItineraryView — { dayId, itemId } where itemId === null means the
  // Add form for that day, and a real id means editing that item. null means
  // nothing is open anywhere on the page. Lifted up rather than kept local so
  // opening a form on any day closes whatever was open on any other day (one
  // form open at a time, page-wide, per trip-planner-45h).
  openForm: { type: Object, default: null }
})
const emit = defineEmits(['open-form', 'close-form'])
const store = useItineraryStore()
const confirm = useConfirm()

// Text label per category, replacing the emoji glyph with a color-coded Tag
// (readable in both themes via the cat-tag-* classes below).
const CATEGORY_LABELS = { travel: 'Travel', food: 'Food', activity: 'Activity', rest: 'Rest', logistics: 'Logistics' }
function categoryLabel(cat) { return CATEGORY_LABELS[cat] || cat || 'Other' }

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

const adding = computed(() => props.openForm?.dayId === props.day.id && props.openForm.itemId == null)
const editingId = computed(() => (props.openForm?.dayId === props.day.id && props.openForm.itemId != null) ? props.openForm.itemId : null)

function openAdd() { emit('open-form', { dayId: props.day.id, itemId: null }) }
function openEdit(id) { emit('open-form', { dayId: props.day.id, itemId: id }) }
function closeForm() { emit('close-form') }

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
  closeForm()
}

async function onEditSubmit(item) {
  await store.updateItem(editingId.value, item)
  closeForm()
}
</script>

<template>
  <div class="card">
    <h3>{{ dayHeader(day.day_date, index) }} <Tag v-if="isToday" value="Today" severity="success" /></h3>
    <ul class="day-items">
      <li v-for="(item, idx) in day.items" :key="item.id">
        <div class="day-item" :class="{ 'day-item-now': isItemNow(item), 'day-item-editing': editingId === item.id }">
          <Tag :value="categoryLabel(item.category)" :class="['cat-tag', `cat-tag-${item.category}`]" />
          <Tag v-if="item.time_range" :value="item.time_range" severity="secondary" />
          <strong>{{ item.title }}</strong>
          <span v-if="item.location">— {{ item.location }}</span>
          <span v-if="item.est_cost != null">{{ formatMoney(item.est_cost, currency) }}</span>
          <span class="day-item-actions">
            <Button type="button" severity="secondary" outlined :disabled="idx === 0" aria-label="Move up within day" title="Move up within day" @click="move(idx, -1)">↑</Button>
            <Button type="button" severity="secondary" outlined :disabled="idx === day.items.length - 1" aria-label="Move down within day" title="Move down within day" @click="move(idx, 1)">↓</Button>
            <Button type="button" label="Edit" severity="secondary" outlined @click="openEdit(item.id)" />
            <Button type="button" icon="pi pi-trash" severity="secondary" text rounded class="icon-danger-btn" :aria-label="`Delete ${item.title}`" @click="remove(item)" />
          </span>
        </div>
        <div v-if="editingId === item.id" class="day-item-edit">
          <h4 class="day-item-edit-heading">Editing: {{ item.title }}</h4>
          <ItineraryItemForm :item="item" @submit="onEditSubmit" @cancel="closeForm" />
        </div>
      </li>
    </ul>

    <p v-if="!adding">
      <Button type="button" label="Add item" @click="openAdd" />
    </p>
    <ItineraryItemForm v-if="adding" @submit="onAddSubmit" @cancel="closeForm" />
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
/* Same "faint fill + solid edge in both themes" shape as .day-item-now, on the
   accent hue instead of primary, so an item that is both "now" and "being
   edited" still reads as two different states rather than one indistinguishable
   wash. */
.day-item-editing { background: var(--app-accent-soft); border-left: 3px solid var(--app-accent); border-radius: var(--app-radius-sm); padding-left: 0.5rem; }
.day-item-edit { padding: 0.5rem 0 0.75rem; }
.day-item-edit-heading { margin: 0 0 0.5rem; color: var(--app-text-muted); }

/* Category tags: one hue per category, built from literal light/dark pairs
   (not just the app's 4 semantic tokens — travel/food/activity/rest/logistics
   is 5 categories and reusing severity="success"/"warn" would collide with
   what those colors already mean elsewhere, e.g. "Overdue"). Each pair is
   tuned the same way main.css tunes --app-danger/--app-primary: a darker
   600/700-weight hue as TEXT on a pale tint in light mode (the only failure
   mode "readable in both themes" is guarding against — a color chosen to look
   good on a dark card that goes unreadable on a light one), and a lighter
   400-weight hue as text on a low-alpha wash in dark mode. */
.cat-tag { font-weight: 600; }
.cat-tag-travel { background: #eff6ff; color: #1d4ed8; }
.cat-tag-food { background: #fff7ed; color: #c2410c; }
.cat-tag-activity { background: #f5f3ff; color: #6d28d9; }
.cat-tag-rest { background: #ecfdf5; color: #047857; }
.cat-tag-logistics { background: #fff1f2; color: #be123c; }
:root.app-dark .cat-tag-travel { background: rgba(96, 165, 250, 0.16); color: #60a5fa; }
:root.app-dark .cat-tag-food { background: rgba(251, 146, 60, 0.16); color: #fb923c; }
:root.app-dark .cat-tag-activity { background: rgba(167, 139, 250, 0.16); color: #a78bfa; }
:root.app-dark .cat-tag-rest { background: rgba(52, 211, 153, 0.16); color: #34d399; }
:root.app-dark .cat-tag-logistics { background: rgba(251, 113, 133, 0.16); color: #fb7185; }
</style>
