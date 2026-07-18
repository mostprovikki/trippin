<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePeopleStore } from '../stores/people.js'
import PersonForm from '../components/PersonForm.vue'

const store = usePeopleStore()
const router = useRouter()
const showForm = ref(false)

onMounted(() => store.fetchPeople())

async function onCreate(fields) {
  const person = await store.createPerson(fields)
  showForm.value = false
  router.push({ name: 'person', params: { id: person.id } })
}
</script>

<template>
  <main class="page">
    <h1>People</h1>
    <div v-if="store.error" class="card">{{ store.error }}</div>

    <button class="btn btn-primary" @click="showForm = !showForm">
      {{ showForm ? 'Cancel' : 'Add person' }}
    </button>

    <PersonForm v-if="showForm" submit-label="Create" @submit="onCreate" @cancel="showForm = false" />

    <table class="table">
      <thead>
        <tr><th>Name</th><th>Home city</th><th>Dietary</th></tr>
      </thead>
      <tbody>
        <tr v-for="person in store.people" :key="person.id">
          <td><router-link :to="{ name: 'person', params: { id: person.id } }">{{ person.name }}</router-link></td>
          <td>{{ person.home_city || '-' }}</td>
          <td><span v-if="person.dietary" class="badge">{{ person.dietary }}</span></td>
        </tr>
      </tbody>
    </table>
  </main>
</template>
