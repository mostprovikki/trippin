<script setup>
import { computed, onMounted, ref } from 'vue'
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

const checklistItems = computed(() => [...store.packing, ...store.tasks])
const checklistDone = computed(() => checklistItems.value.filter((i) => i.done).length)

const steps = computed(() => [
  { key: 'profile', n: 1, title: 'Your profile', done: store.profileConfirmed, hint: store.profileConfirmed ? 'Confirmed' : 'Confirm your details' },
  { key: 'docs', n: 2, title: 'Documents', done: store.documents.length > 0, hint: store.documents.length ? `${store.documents.length} uploaded` : 'Upload passport / ID / tickets' },
  { key: 'checklist', n: 3, title: 'Checklist', done: checklistItems.value.length > 0 && checklistDone.value === checklistItems.value.length, hint: checklistItems.value.length ? `${checklistDone.value}/${checklistItems.value.length} done` : 'Nothing assigned yet' }
])

const dateRange = computed(() =>
  store.trip?.start_date && store.trip?.end_date ? `${store.trip.start_date} – ${store.trip.end_date}` : 'Dates TBD'
)
</script>

<template>
  <main class="p-page">
    <Message v-if="invalidLink" severity="warn" :closable="false">
      This link is no longer valid — ask your trip organizer for a new one
    </Message>

    <ProgressSpinner v-else-if="loading" style="width: 2.5rem; height: 2.5rem" />

    <template v-else>
      <Message v-if="store.error" severity="error" :closable="false">{{ store.error }}</Message>

      <section v-if="store.trip" class="card p-hero">
        <p v-if="store.person" class="p-greeting">Hi {{ store.person.name }} 👋 you're invited to</p>
        <h1>{{ store.trip.name }}</h1>
        <p class="p-meta">
          <i class="pi pi-map-marker" /> {{ store.trip.destination || 'Destination TBD' }}
          <span class="p-sep">·</span>
          <i class="pi pi-calendar" /> {{ dateRange }}
        </p>
        <p v-if="store.trip.description" class="p-desc">{{ store.trip.description }}</p>
        <div v-if="(store.trip.vibe_tags || []).length" class="p-tags">
          <Tag v-for="tag in store.trip.vibe_tags" :key="tag" :value="tag" severity="secondary" />
        </div>
        <ul v-if="(store.trip.goals || []).length" class="p-goals">
          <li v-for="(goal, idx) in store.trip.goals" :key="idx">
            <i class="pi pi-flag" /> {{ goal.title }}
            <span v-if="goal.fixed_date"> — {{ goal.fixed_date }}</span>
            <span v-if="goal.fixed_place"> @ {{ goal.fixed_place }}</span>
          </li>
        </ul>
      </section>

      <section
        v-for="step in steps"
        :key="step.key"
        class="card step-card"
        :class="{ 'step-done': step.done }"
      >
        <header class="step-head">
          <span class="step-num" aria-hidden="true">
            <i v-if="step.done" class="pi pi-check" />
            <template v-else>{{ step.n }}</template>
          </span>
          <div>
            <h2>{{ step.title }}</h2>
            <p class="step-hint">{{ step.hint }}</p>
          </div>
        </header>
        <ParticipantProfileForm v-if="step.key === 'profile'" />
        <ParticipantDocs v-else-if="step.key === 'docs'" />
        <ParticipantChecklist v-else />
      </section>
    </template>
  </main>
</template>

<style scoped>
.p-page { max-width: 30rem; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
.p-hero h1 { margin: 0 0 0.375rem; }
.p-greeting { margin: 0 0 0.25rem; color: var(--app-text-muted); font-size: 0.875rem; }
.p-meta { margin: 0; color: var(--app-text-muted); display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; }
.p-sep { color: var(--app-border); }
.p-desc { margin: 0.625rem 0 0; }
.p-tags { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 0.625rem; }
.p-goals { list-style: none; padding: 0; margin: 0.75rem 0 0; }
.p-goals li { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.125rem 0; font-size: 0.875rem; }
.p-goals i { color: var(--app-primary); font-size: 0.75rem; }

.step-head { display: flex; gap: 0.75rem; align-items: flex-start; margin-bottom: 0.75rem; }
.step-head h2 { margin: 0; }
.step-hint { margin: 0.125rem 0 0; color: var(--app-text-muted); font-size: 0.8125rem; }
.step-num {
  flex: 0 0 auto;
  width: 1.75rem; height: 1.75rem;
  border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
  background: #f0efec; color: var(--app-text-muted);
  font-weight: 700; font-size: 0.875rem;
}
.step-done .step-num { background: var(--app-primary); color: #fff; }
</style>
