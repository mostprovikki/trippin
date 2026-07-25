<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Message from 'primevue/message'
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
const loadError = ref(null)
const formRef = ref(null)
const personId = computed(() => route.params.id)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    await store.fetchPerson(personId.value)
  } catch (e) {
    // Kept on the page as well as in a toast. A toast fades, and what it used to
    // leave behind was a bare "Person" heading over an empty body — which reads
    // as "this person has no details" rather than "this failed to load".
    loadError.value = e.message
    notify.error(e.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)
// This view is reused when only :id changes (a search-palette jump between two
// people), so mounting once is not enough — without this the previous person
// stays on screen under the new id.
watch(personId, load)

async function onSave(fields) {
  try {
    await store.updatePerson(personId.value, fields)
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
        await store.deletePerson(personId.value)
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

    <div v-else-if="loadError" class="person-error">
      <Message severity="error" :closable="false">{{ loadError }}</Message>
      <div class="person-error-actions">
        <Button label="Try again" icon="pi pi-refresh" outlined @click="load" />
        <Button label="Back to people" icon="pi pi-arrow-left" text @click="router.push({ name: 'people' })" />
      </div>
    </div>

    <template v-else-if="store.current">
      <PersonForm ref="formRef" :initial="store.current" submit-label="Save" :draft-key="`person:${personId}:edit`" @submit="onSave" @cancel="() => {}" />
      <DocumentList :person-id="personId" />
    </template>
  </main>
</template>

<style scoped>
/* .list-head itself now lives in main.css — including the wrapping this copy
   introduced, which the other two lacked. */
.person-error-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }
</style>
