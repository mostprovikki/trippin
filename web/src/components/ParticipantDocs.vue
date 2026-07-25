<script setup>
import { ref } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import DateField from './DateField.vue'
import { isExpiredIso } from '../utils/dates.js'
import { useParticipantStore } from '../stores/participant.js'
import { useNotify } from '../composables/useNotify.js'

const store = useParticipantStore()
const confirm = useConfirm()
const notify = useNotify()

const DOC_TYPES = ['passport', 'visa', 'national_id', 'driving_license', 'vaccination', 'other']

const docType = ref('passport')
const docNumber = ref('')
const expiryDate = ref('')
const file = ref(null)
const fileInput = ref(null)
const uploading = ref(false)

function onFileChange(e) {
  file.value = e.target.files[0] || null
}

async function upload() {
  if (!file.value) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file.value)
    fd.append('doc_type', docType.value)
    if (docNumber.value) fd.append('doc_number', docNumber.value)
    if (expiryDate.value) fd.append('expiry_date', expiryDate.value)
    await store.uploadDocument(fd)
    docNumber.value = ''
    expiryDate.value = ''
    file.value = null
    // Clear the DOM input too: it otherwise keeps showing the uploaded
    // filename, and re-picking that same file fires no change event, so the
    // next Upload silently does nothing.
    if (fileInput.value) fileInput.value.value = ''
  } catch {
    /* store.error surfaced by parent view */
  } finally {
    uploading.value = false
  }
}

function remove(doc) {
  confirm.require({
    message: `Delete document "${doc.original_name}"?`, header: 'Delete document', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Delete', acceptClass: 'p-button-danger', rejectLabel: 'Cancel',
    accept: async () => {
      try {
        await store.deleteDocument(doc.id)
      } catch (e) {
        notify.error(e.message)
      }
    }
  })
}

function isExpired(doc) {
  // Was `new Date(doc.expiry_date)` — a UTC-midnight parse, so a document
  // expiring today showed as expired for anyone west of Greenwich.
  return isExpiredIso(doc.expiry_date)
}

async function download(doc) {
  const res = await fetch(`/api/participant/documents/${doc.id}/file`, {
    headers: { Authorization: `Bearer ${store.token}` }
  })
  if (!res.ok) return
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = doc.original_name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="card">
    <h2>Your documents</h2>
    <table class="table" v-if="store.documents.length">
      <thead>
        <tr><th>Type</th><th>Number</th><th>Expiry</th><th>File</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="doc in store.documents" :key="doc.id">
          <td>{{ doc.doc_type }}</td>
          <td>{{ doc.doc_number || '-' }}</td>
          <td>
            <Tag :value="doc.expiry_date || '-'" :severity="isExpired(doc) ? 'warn' : 'secondary'" />
          </td>
          <td><a href="#" @click.prevent="download(doc)">{{ doc.original_name }}</a></td>
          <td><Button label="Delete" size="small" severity="danger" text @click="remove(doc)" /></td>
        </tr>
      </tbody>
    </table>
    <p v-else>No documents yet.</p>

    <form @submit.prevent="upload">
      <div class="field">
        <label for="doc-file">File</label>
        <input id="doc-file" ref="fileInput" type="file" @change="onFileChange" required />
      </div>
      <div class="field">
        <label for="doc-type">Type</label>
        <Select input-id="doc-type" v-model="docType" :options="DOC_TYPES" fluid />
      </div>
      <div class="field">
        <label for="doc-number">Number (optional)</label>
        <input id="doc-number" v-model="docNumber" />
      </div>
      <div class="field">
        <label for="doc-expiry">Expiry (optional)</label>
        <!-- typeable: you read this off the passport in your hand, so typing
             beats 6 clicks through a calendar to 2035. -->
        <DateField v-model="expiryDate" input-id="doc-expiry" typeable />
      </div>
      <Button type="submit" :label="uploading ? 'Uploading…' : 'Upload'" :disabled="uploading" />
    </form>
  </section>
</template>

<style scoped>
/* This page is used one-handed on a phone, so every control here gets a 44px
   tap target — not just the date field. (The global `.field input` rule in
   main.css re-pads inputs inside `.field` down to ~36px; a lone 44px date
   field beside 36px siblings reads as a mistake rather than as care.) */
.field :deep(input),
.field :deep(.p-select) {
  min-height: 2.75rem;
}
</style>
