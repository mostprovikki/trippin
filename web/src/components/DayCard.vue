<script setup>
import { ref, computed } from 'vue'
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
    <ul style="list-style:none;padding:0;margin:0">
      <li v-for="(item, idx) in day.items" :key="item.id" style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0;border-bottom:1px solid #e2e2e2">
        <span>{{ categoryIcon(item.category) }}</span>
        <span v-if="item.time_range" class="badge">{{ item.time_range }}</span>
        <strong>{{ item.title }}</strong>
        <span v-if="item.location">— {{ item.location }}</span>
        <span v-if="item.est_cost != null">${{ item.est_cost }}</span>
        <span style="margin-left:auto;display:flex;gap:0.25rem">
          <button class="btn" type="button" :disabled="idx === 0" @click="move(idx, -1)">↑</button>
          <button class="btn" type="button" :disabled="idx === day.items.length - 1" @click="move(idx, 1)">↓</button>
          <button class="btn" type="button" @click="editingId = item.id">Edit</button>
          <button class="btn" type="button" @click="remove(item.id)">Delete</button>
        </span>
      </li>
    </ul>

    <ItineraryItemForm v-if="editingId" :item="editingItem" @submit="onEditSubmit" @cancel="editingId = null" />

    <p v-if="!adding && !editingId">
      <button class="btn" type="button" @click="adding = true">Add item</button>
    </p>
    <ItineraryItemForm v-if="adding" @submit="onAddSubmit" @cancel="adding = false" />

    <div style="margin-top:1rem">
      <div v-if="aiEnabled">
        <div class="field">
          <label>Regenerate instruction (optional)</label>
          <input v-model="instruction" placeholder="e.g. more relaxed" />
        </div>
        <button class="btn" type="button" :disabled="store.aiBusy" @click="regen">
          {{ store.aiBusy ? 'Generating…' : 'Regenerate day' }}
        </button>
      </div>
      <p v-else class="badge">AI disabled — set LLM_PROVIDER</p>
    </div>

    <div v-if="dayDraft" class="card" style="background:#f6f7f9">
      <h4>Draft for {{ day.day_date }}</h4>
      <ul style="list-style:none;padding:0;margin:0">
        <li v-for="(it, i) in dayDraft" :key="i">
          {{ categoryIcon(it.category) }}
          <span v-if="it.time_range" class="badge">{{ it.time_range }}</span>
          <strong>{{ it.title }}</strong>
          <span v-if="it.location">— {{ it.location }}</span>
          <span v-if="it.est_cost != null">${{ it.est_cost }}</span>
        </li>
      </ul>
      <button class="btn btn-primary" type="button" @click="applyDayDraft">Apply</button>
      <button class="btn" type="button" @click="discardDayDraft">Discard</button>
    </div>
  </div>
</template>
