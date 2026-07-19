<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { usePeopleStore } from '../stores/people.js'
import { useNotify } from '../composables/useNotify.js'
import PersonForm from '../components/PersonForm.vue'
import EmptyState from '../components/EmptyState.vue'

const store = usePeopleStore()
const router = useRouter()
const route = useRoute()
const notify = useNotify()

const showForm = ref(route.query.new === '1')
const loading = ref(true)
const formRef = ref(null)

onMounted(async () => {
  try { await store.fetchPeople() } catch (e) { notify.error(e.message) } finally { loading.value = false }
})

async function onCreate(fields) {
  try {
    const person = await store.createPerson(fields)
    formRef.value?.clearDraft()
    showForm.value = false
    notify.success(`Added ${person.name}`)
    const ret = typeof route.query.return === 'string' && route.query.return.startsWith('/') ? route.query.return : null
    router.push(ret || { name: 'person', params: { id: person.id } })
  } catch (e) {
    notify.error(e.message)
  }
}
</script>

<template>
  <main class="page">
    <h1>People</h1>

    <Button :label="showForm ? 'Cancel' : 'Add person'" :severity="showForm ? 'secondary' : undefined" :outlined="showForm" @click="showForm = !showForm" />

    <PersonForm v-if="showForm" ref="formRef" submit-label="Create" draft-key="person-new" @submit="onCreate" @cancel="showForm = false" />

    <div v-if="loading" class="card">
      <Skeleton v-for="i in 4" :key="i" height="1.5rem" class="skeleton-row" />
    </div>

    <EmptyState v-else-if="!store.people.length" icon="pi pi-users" message="No people yet — add travel companions here." cta-label="Add person" @cta="showForm = true" />

    <table v-else class="table">
      <thead>
        <tr><th>Name</th><th>Home city</th><th>Dietary</th></tr>
      </thead>
      <tbody>
        <tr v-for="person in store.people" :key="person.id">
          <td><router-link :to="{ name: 'person', params: { id: person.id } }">{{ person.name }}</router-link></td>
          <td>{{ person.home_city || '-' }}</td>
          <td><Tag v-if="person.dietary" :value="person.dietary" severity="secondary" /></td>
        </tr>
      </tbody>
    </table>
  </main>
</template>

<style scoped>
.skeleton-row { margin-bottom: 0.5rem; }
</style>
