<script setup>
// tripper.md §6 per-person cost, kept on the Overview by the mockup review.
// Estimate only: Budget has no booked flag yet (owner decision D5).
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { formatMoney } from '../../utils/format.js'

const props = defineProps({
  equalShare: { type: Number, default: 0 },
  participantCount: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' }
})
const route = useRoute()
const hero = computed(() => (props.equalShare > 0 ? formatMoney(Math.round(props.equalShare), props.currency) : null))
</script>

<template>
  <section class="card overview-card budget-card" aria-labelledby="budget-h">
    <h2 id="budget-h" class="overview-card-title">Budget · per person</h2>
    <template v-if="hero">
      <p class="budget-hero">{{ hero }}</p>
      <p class="overview-row-reason">estimate · {{ participantCount }} {{ participantCount === 1 ? 'person' : 'people' }}</p>
    </template>
    <p v-else class="overview-empty">No estimate yet.</p>
    <p class="overview-card-foot">
      <RouterLink :to="{ name: 'trip-budget', params: { id: route.params.id } }">Open budget</RouterLink>
    </p>
  </section>
</template>
