<script setup>
// tripper.md §2 "Who's missing what" (before the trip), §1 job 2 at zero
// clicks. Row actions (Copy ⟨name⟩'s link) come in through the row-action
// slot so this card stays display-only (§5: actions live on the row).
import { computed } from 'vue'
import Tag from 'primevue/tag'
import { missingRows } from '../../utils/overview.js'

const props = defineProps({
  participants: { type: Array, default: () => [] },
  tripEnd: { type: String, default: null }
})
const view = computed(() => missingRows(props.participants, props.tripEnd))
const completeLine = computed(() => {
  const c = view.value.complete
  return c.length ? `${c.join(', ')} ${c.length === 1 ? 'is' : 'are'} complete.` : ''
})
</script>

<template>
  <section class="card overview-card missing-card" aria-labelledby="missing-h">
    <h2 id="missing-h" class="overview-card-title">Who's missing what · {{ view.rows.length }} of {{ view.total }} people</h2>
    <p v-if="!view.total" class="overview-empty">
      No participants yet — <RouterLink :to="{ name: 'trip-people' }">add people</RouterLink>.
    </p>
    <p v-else-if="!view.rows.length" class="overview-empty">Everyone's details are in.</p>
    <ul v-else class="overview-rows">
      <li v-for="r in view.rows" :key="r.personId" data-person-row :class="['overview-row', `sev-${r.severity}`]">
        <div class="overview-row-main">
          <div class="overview-row-head">
            <RouterLink :to="{ name: 'trip-people' }" class="overview-row-name">{{ r.name }}</RouterLink>
            <Tag
              v-for="pill in r.pills"
              :key="pill.label"
              :value="pill.label"
              :data-doc-level="pill.level"
              :severity="pill.level === 'expired' ? 'danger' : 'warn'"
            />
          </div>
          <p class="overview-row-reason">{{ r.reasons.join(' · ') }}</p>
        </div>
        <slot name="row-action" v-bind="{ personId: r.personId, name: r.name }" />
      </li>
    </ul>
    <p v-if="completeLine && view.rows.length" class="overview-card-foot">{{ completeLine }}</p>
  </section>
</template>
