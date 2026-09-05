<script setup>
import { computed, onMounted, ref } from 'vue'
import Tag from 'primevue/tag'
import { categoryIcon } from '../utils/itinerary.js'
import { dayHeader, tripCountdown } from '../utils/dates.js'
import { formatMoney } from '../utils/format.js'

const props = defineProps({
  itinerary: { type: Array, default: () => [] },
  trip: { type: Object, required: true },
  budget: { type: Object, default: null },
  companions: { type: Array, default: () => [] },
  companionCount: { type: Number, default: 0 },
})

const todayIso = computed(() => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})
function isToday(dayDate) { return dayDate === todayIso.value }

const companionsLine = computed(() => {
  if (!props.companions.length) return null
  const shown = props.companions.slice(0, 2)
  const restCount = props.companionCount - shown.length - 1 // -1 for self
  return `Travelling with: ${shown.join(', ')}${restCount > 0 ? ` +${restCount}` : ''}`
})

// formatMoney already returns null for a missing/unparseable amount (e.g. a
// budget row that exists but whose my_amount hasn't been computed yet) —
// gate on the *formatted* text, not just budget's presence, so "Your share:"
// never renders with nothing after the colon.
const shareText = computed(() => {
  if (!props.budget) return null
  const formatted = formatMoney(props.budget.my_amount, props.budget.currency)
  return formatted ? `Your share: ${formatted}` : null
})

const countdown = computed(() => tripCountdown(props.trip))

// An idea/planning trip with no budget row and no companions would otherwise
// render an empty bordered card — hide the strip entirely when it has
// nothing to say rather than show a visible box with nothing inside it.
const hasEssentials = computed(() => !!(countdown.value || shareText.value || companionsLine.value))

const todayRef = ref(null)
// Named function rather than an inline `el => { todayRef.value = el }` in the
// template: script-setup's template compiler auto-unwraps top-level refs, and
// an assignment to `todayRef.value` written directly inside a template
// expression gets compiled as `unref(todayRef).value = el` — which throws
// ("Cannot set properties of null") because unref(todayRef) is the ref's
// *current* (null) inner value, not the ref itself. Keeping the assignment in
// a plain script-setup function sidesteps that transform.
function setDayRef(dayDate, el) {
  if (dayDate === todayIso.value) todayRef.value = el
}
onMounted(() => {
  // happy-dom (this component's test environment) does implement
  // scrollIntoView as a no-op, so this guard isn't papering over it being
  // undefined in tests — it's defensive for any host that doesn't implement
  // it, and it also lets todayRef legitimately stay null (no day is "today")
  // without throwing.
  if (todayRef.value && typeof todayRef.value.scrollIntoView === 'function') {
    todayRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
})
</script>

<template>
  <div v-if="hasEssentials" class="pi-essentials card">
    <Tag v-if="countdown" :value="countdown.label" severity="info" />
    <span v-if="shareText" class="pi-share">{{ shareText }}</span>
    <span v-if="companionsLine">{{ companionsLine }}</span>
  </div>

  <template v-if="itinerary.length">
    <h2 class="pi-heading">Itinerary</h2>
    <section v-for="(day, idx) in itinerary" :key="day.day_date" class="pi-day" :class="{ 'pi-today': isToday(day.day_date) }" :ref="(el) => setDayRef(day.day_date, el)">
      <h3>
        {{ dayHeader(day.day_date, idx + 1) }}
        <Tag v-if="isToday(day.day_date)" value="Today" severity="success" />
      </h3>
      <ul class="pi-items">
        <li v-for="(item, i) in day.items" :key="i" class="pi-item">
          <span>{{ categoryIcon(item.category) }}</span>
          <Tag v-if="item.time_range" :value="item.time_range" severity="secondary" />
          <strong>{{ item.title }}</strong>
          <span v-if="item.location">— {{ item.location }}</span>
        </li>
      </ul>
    </section>
  </template>
  <p v-else class="pi-empty">Your organizer hasn't shared a day-by-day plan yet — check back soon.</p>
</template>

<style scoped>
.pi-essentials { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
.pi-heading { margin: 0 0 0.5rem; }
.pi-items { list-style: none; padding: 0; margin: 0; }
.pi-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0; border-bottom: 1px solid var(--app-border); flex-wrap: wrap; }
.pi-today h3 { color: var(--app-primary); }
.pi-empty { color: var(--app-text-muted); }
</style>
