<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { usePeopleStore } from '../stores/people.js'
import { useNotify } from '../composables/useNotify.js'
import PersonForm from '../components/PersonForm.vue'
import DocumentList from '../components/DocumentList.vue'

const route = useRoute()
const router = useRouter()
const store = usePeopleStore()
const confirm = useConfirm()
const notify = useNotify()

const loading = ref(true)
const formRef = ref(null)

onMounted(async () => {
  try { await store.fetchPerson(route.params.id) } catch (e) { notify.error(e.message) } finally { loading.value = false }
})

async function onSave(fields) {
  try {
    await store.updatePerson(route.params.id, fields)
    formRef.value?.clearDraft()
    notify.success('Person saved')
  } catch (e) {
    notify.error(e.message)
  }
}

function onDelete() {
  confirm.require({
    message: `Delete ${store.current?.name}? This cannot be undone.`,
    header: 'Delete person',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    rejectLabel: 'Cancel',
    accept: async () => {
      try {
        await store.deletePerson(route.params.id)
        notify.success('Person deleted')
        router.push({ name: 'people' })
      } catch (e) {
        notify.error(e.message)
      }
    }
  })
}
</script>

<template>
  <main class="page">
    <div class="list-head">
      <h1>{{ store.current?.name || 'Person' }}</h1>
      <Button v-if="store.current" label="Delete person" severity="danger" outlined @click="onDelete" />
    </div>

    <ProgressSpinner v-if="loading" style="width: 2.5rem; height: 2.5rem" />

    <template v-else-if="store.current">
      <PersonForm ref="formRef" :initial="store.current" submit-label="Save" :draft-key="`person:${route.params.id}:edit`" @submit="onSave" @cancel="() => {}" />
      <DocumentList :person-id="route.params.id" />
    </template>
  </main>
</template>

<style scoped>
.list-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.list-head h1 { margin: 0; }
</style>
