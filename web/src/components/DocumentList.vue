<script setup>
import { ref } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import DateField from './DateField.vue'
import { isExpiredIso } from '../utils/dates.js'
import { usePeopleStore } from '../stores/people.js'
import { useNotify } from '../composables/useNotify.js'

const props = defineProps({ personId: { type: String, required: true } })
const store = usePeopleStore()
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
    await store.uploadDocument(props.personId, fd)
    docNumber.value = ''
    expiryDate.value = ''
    file.value = null
    // Clear the DOM input too: it otherwise keeps showing the uploaded
    // filename, and re-picking that same file fires no change event, so the
    // next Upload silently does nothing.
    if (fileInput.value) fileInput.value.value = ''
  } catch (e) {
    // Without this the rejection escaped as an unhandled pageerror and the
    // upload just appeared to do nothing. Matches remove() below.
    notify.error(e.message)
  } finally {
    uploading.value = false
  }
}

function remove(doc) {
  confirm.require({
    message: `Delete document "${doc.original_name}"?`, header: 'Delete document', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Delete', acceptClass: 'p-button-danger', rejectLabel: 'Cancel',
    accept: async () => { try { await store.deleteDocument(doc.id) } catch (e) { notify.error(e.message) } }
  })
}

function isExpired(doc) {
  // Was `new Date(doc.expiry_date)` — a UTC-midnight parse, so a document
  // expiring today showed as expired for anyone west of Greenwich.
  return isExpiredIso(doc.expiry_date)
}
</script>

<template>
  <div class="card">
    <h2>Documents</h2>
    <table class="table" v-if="store.documents.length">
      <thead>
        <tr><th>Type</th><th>Number</th><th>Expiry</th><th>File</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="doc in store.documents" :key="doc.id">
          <!-- data-label carries the header text into the row: under 40rem
               main.css hides the thead and stacks the cells, so without it a
               passport number and an expiry date are two bare strings. The
               action cell is left unlabelled on purpose — the button says what
               it does, and a "Delete" prefix in front of it would just be
               noise. -->
          <td data-label="Type">{{ doc.doc_type }}</td>
          <td data-label="Number">{{ doc.doc_number || '-' }}</td>
          <td data-label="Expiry">
            <Tag :severity="isExpired(doc) ? 'warn' : 'secondary'" :value="doc.expiry_date || '-'" />
          </td>
          <td data-label="File"><a :href="`/api/documents/${doc.id}/file`" target="_blank">{{ doc.original_name }}</a></td>
          <td><Button type="button" label="Delete" severity="danger" outlined @click="remove(doc)" /></td>
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
        <Select label-id="doc-type" v-model="docType" :options="DOC_TYPES" fluid />
      </div>
      <div class="field">
        <label for="doc-number">Number (optional)</label>
        <InputText id="doc-number" v-model="docNumber" fluid />
      </div>
      <div class="field">
        <label for="doc-expiry">Expiry (optional)</label>
        <!-- typeable: you read this off the passport in your hand, so typing
             beats 6 clicks through a calendar to 2035. -->
        <DateField v-model="expiryDate" input-id="doc-expiry" typeable />
      </div>
      <Button type="submit" :loading="uploading" :label="uploading ? 'Uploading…' : 'Upload'" />
    </form>
  </div>
</template>
