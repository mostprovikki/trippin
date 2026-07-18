<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePeopleStore } from '../stores/people.js'
import PersonForm from '../components/PersonForm.vue'
import DocumentList from '../components/DocumentList.vue'

const route = useRoute()
const router = useRouter()
const store = usePeopleStore()

onMounted(() => store.fetchPerson(route.params.id))

async function onSave(fields) {
  await store.updatePerson(route.params.id, fields)
}

async function onDelete() {
  if (!confirm(`Delete ${store.current?.name}?`)) return
  try {
    await store.deletePerson(route.params.id)
    router.push({ name: 'people' })
  } catch {
    // error surfaced via store.error below
  }
}
</script>

<template>
  <main class="page">
    <h1>Person Detail</h1>
    <div v-if="store.error" class="card">{{ store.error }}</div>

    <PersonForm v-if="store.current" :initial="store.current" submit-label="Save" @submit="onSave" @cancel="() => {}" />

    <button class="btn" @click="onDelete">Delete person</button>

    <DocumentList v-if="store.current" :person-id="route.params.id" />
  </main>
</template>
