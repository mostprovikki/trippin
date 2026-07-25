<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useItineraryStore } from '../stores/itinerary.js'
import { useAuthStore } from '../stores/auth.js'
import ItineraryItemForm from './ItineraryItemForm.vue'

const props = defineProps({ day: { type: Object, required: true } })
const store = useItineraryStore()
const auth = useAuthStore()
const aiEnabled = computed(() => auth.aiEnabled)

const adding = ref(false)
const editingId = ref(null)
const instruction = ref('')

const editingItem = computed(() => props.day.items.find((it) => it.id === editingId.value) || null)
const dayDraft = computed(() => store.dayDrafts[props.day.id] || null)

const ICONS = { travel: '✈️', food: '🍽️', activity: '🎟️', rest: '🛌', logistics: '🧳' }
function categoryIcon(cat) { return ICONS[cat] || '•' }

async function move(idx, dir) {
  const items = [...props.day.items]
  const j = idx + dir
  if (j < 0 || j >= items.length) return
  ;[items[idx], items[j]] = [items[j], items[idx]]
  await store.reorder(props.day.id, items.map((it) => it.id))
}

async function remove(itemId) {
  await store.deleteItem(itemId)
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
    <h3>{{ day.day_date }}</h3>
    <ul class="day-items">
      <li v-for="(item, idx) in day.items" :key="item.id" class="day-item">
        <span>{{ categoryIcon(item.category) }}</span>
        <Tag v-if="item.time_range" :value="item.time_range" severity="secondary" />
        <strong>{{ item.title }}</strong>
        <span v-if="item.location">— {{ item.location }}</span>
        <span v-if="item.est_cost != null">${{ item.est_cost }}</span>
        <span class="day-item-actions">
          <Button type="button" severity="secondary" outlined :disabled="idx === 0" @click="move(idx, -1)">↑</Button>
          <Button type="button" severity="secondary" outlined :disabled="idx === day.items.length - 1" @click="move(idx, 1)">↓</Button>
          <Button type="button" label="Edit" severity="secondary" outlined @click="editingId = item.id" />
          <Button type="button" label="Delete" severity="danger" outlined @click="remove(item.id)" />
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

    <div v-if="dayDraft" class="card day-draft">
      <h4>Draft for {{ day.day_date }}</h4>
      <ul class="day-items">
        <li v-for="(it, i) in dayDraft" :key="i">
          {{ categoryIcon(it.category) }}
          <Tag v-if="it.time_range" :value="it.time_range" severity="secondary" />
          <strong>{{ it.title }}</strong>
          <span v-if="it.location">— {{ it.location }}</span>
          <span v-if="it.est_cost != null">${{ it.est_cost }}</span>
        </li>
      </ul>
      <Button type="button" label="Apply" @click="applyDayDraft" />
      <Button type="button" label="Discard" severity="secondary" outlined @click="discardDayDraft" />
    </div>
  </div>
</template>

<style scoped>
.day-items { list-style: none; padding: 0; margin: 0; }
.day-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0; border-bottom: 1px solid var(--app-border); }
.day-item-actions { margin-left: auto; display: flex; gap: 0.25rem; }
.day-ai { margin-top: 1rem; }
.day-draft { background: var(--app-surface-alt); }
</style>
