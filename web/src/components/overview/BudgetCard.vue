<script setup>
// tripper.md §6 per-person cost, kept on the Overview by the mockup review.
// Estimate only: Budget has no booked flag yet (owner decision D5).
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { formatMoney } from '../../utils/format.js'

const props = defineProps({
  equalShare: { type: Number, default: 0 },
  participantCount: { type: Number, default: 0 },
  // people with their own amount (budget overrides): equal_share is what
  // each of the OTHERS pays, so the label must say so
  overrideCount: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' }
})
const route = useRoute()
const sharing = computed(() => Math.max(0, props.participantCount - props.overrideCount))
const plural = (n) => `${n} ${n === 1 ? 'person' : 'people'}`
const sub = computed(() => (props.overrideCount
  ? `estimate · each of ${plural(sharing.value)} · ${props.overrideCount} set their own amount`
  : `estimate · ${plural(props.participantCount)}`))
const hero = computed(() => (props.equalShare > 0 ? formatMoney(Math.round(props.equalShare), props.currency) : null))
</script>

<template>
  <section class="card overview-card budget-card" aria-labelledby="budget-h">
    <h2 id="budget-h" class="overview-card-title">Budget · per person</h2>
    <template v-if="hero">
      <p class="budget-hero">{{ hero }}</p>
      <p class="overview-row-reason">{{ sub }}</p>
    </template>
    <p v-else class="overview-empty">No estimate yet.</p>
    <p class="overview-card-foot">
      <RouterLink :to="{ name: 'trip-budget', params: { id: route.params.id } }">Open budget</RouterLink>
    </p>
  </section>
</template>
