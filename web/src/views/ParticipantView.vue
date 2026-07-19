<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import Tag from 'primevue/tag'
import ProgressSpinner from 'primevue/progressspinner'
import Message from 'primevue/message'
import { useParticipantStore } from '../stores/participant.js'
import ParticipantProfileForm from '../components/ParticipantProfileForm.vue'
import ParticipantDocs from '../components/ParticipantDocs.vue'
import ParticipantChecklist from '../components/ParticipantChecklist.vue'

const route = useRoute()
const store = useParticipantStore()

const loading = ref(true)
const invalidLink = ref(false)

onMounted(async () => {
  try {
    await store.load(route.params.token)
  } catch (e) {
    if (e.status === 401) invalidLink.value = true
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="page">
    <Message v-if="invalidLink" severity="warn" :closable="false">
      This link is no longer valid — ask your trip organizer for a new one
    </Message>

    <template v-else-if="loading">
      <ProgressSpinner style="width: 2.5rem; height: 2.5rem" />
    </template>

    <template v-else>
      <Message v-if="store.error" severity="error" :closable="false">{{ store.error }}</Message>

      <section class="card" v-if="store.trip">
        <h1>
          {{ store.trip.name }}
          <Tag :value="store.trip.status" severity="info" />
        </h1>
        <p><strong>Destination:</strong> {{ store.trip.destination || 'TBD' }}</p>
        <p>
          <strong>Dates:</strong>
          {{ store.trip.start_date && store.trip.end_date
            ? `${store.trip.start_date} – ${store.trip.end_date}`
            : 'TBD' }}
        </p>
        <p v-if="store.trip.description">{{ store.trip.description }}</p>
        <div v-if="store.trip.vibe_tags && store.trip.vibe_tags.length" class="tag-row">
          <Tag v-for="tag in store.trip.vibe_tags" :key="tag" :value="tag" severity="secondary" />
        </div>
        <div v-if="store.trip.goals && store.trip.goals.length">
          <h3>Goals</h3>
          <ul>
            <li v-for="(goal, idx) in store.trip.goals" :key="idx">
              {{ goal.title }}
              <span v-if="goal.fixed_date"> — {{ goal.fixed_date }}</span>
              <span v-if="goal.fixed_place"> @ {{ goal.fixed_place }}</span>
            </li>
          </ul>
        </div>
      </section>

      <ParticipantProfileForm />
      <ParticipantDocs />
      <ParticipantChecklist />
    </template>
  </main>
</template>

<style scoped>
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
