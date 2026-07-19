<script setup>
import { ref } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
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
  return !!doc.expiry_date && new Date(doc.expiry_date) < new Date()
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
          <td>{{ doc.doc_type }}</td>
          <td>{{ doc.doc_number || '-' }}</td>
          <td>
            <Tag :severity="isExpired(doc) ? 'warn' : 'secondary'" :value="doc.expiry_date || '-'" />
          </td>
          <td><a :href="`/api/documents/${doc.id}/file`" target="_blank">{{ doc.original_name }}</a></td>
          <td><Button type="button" label="Delete" severity="danger" outlined @click="remove(doc)" /></td>
        </tr>
      </tbody>
    </table>
    <p v-else>No documents yet.</p>

    <form @submit.prevent="upload">
      <div class="field">
        <label for="doc-file">File</label>
        <input id="doc-file" type="file" @change="onFileChange" required />
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
        <InputText id="doc-expiry" type="date" v-model="expiryDate" fluid />
      </div>
      <Button type="submit" :loading="uploading" :label="uploading ? 'Uploading…' : 'Upload'" />
    </form>
  </div>
</template>
