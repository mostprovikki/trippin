<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
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
    <div v-if="invalidLink" class="card">
      <p>This link is no longer valid — ask your trip organizer for a new one</p>
    </div>

    <template v-else-if="loading">
      <p>Loading…</p>
    </template>

    <template v-else>
      <div v-if="store.error" class="card">
        <p>{{ store.error }}</p>
      </div>

      <section class="card" v-if="store.trip">
        <h1>{{ store.trip.name }}</h1>
        <p><span class="badge">{{ store.trip.status }}</span></p>
        <p><strong>Destination:</strong> {{ store.trip.destination || 'TBD' }}</p>
        <p>
          <strong>Dates:</strong>
          {{ store.trip.start_date && store.trip.end_date
            ? `${store.trip.start_date} – ${store.trip.end_date}`
            : 'TBD' }}
        </p>
        <p v-if="store.trip.description">{{ store.trip.description }}</p>
        <div v-if="store.trip.vibe_tags && store.trip.vibe_tags.length">
          <span v-for="tag in store.trip.vibe_tags" :key="tag" class="badge">{{ tag }}</span>
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
