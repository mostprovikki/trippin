<script setup>
import { ref } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
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
  return !!doc.expiry_date && new Date(doc.expiry_date) < new Date()
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
            <span :class="['badge', isExpired(doc) ? 'badge-warn' : '']">{{ doc.expiry_date || '-' }}</span>
          </td>
          <td><a href="#" @click.prevent="download(doc)">{{ doc.original_name }}</a></td>
          <td><button type="button" class="btn" @click="remove(doc)">Delete</button></td>
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
        <select id="doc-type" v-model="docType">
          <option v-for="t in DOC_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
      </div>
      <div class="field">
        <label for="doc-number">Number (optional)</label>
        <input id="doc-number" v-model="docNumber" />
      </div>
      <div class="field">
        <label for="doc-expiry">Expiry (optional)</label>
        <input id="doc-expiry" type="date" v-model="expiryDate" />
      </div>
      <button type="submit" class="btn btn-primary" :disabled="uploading">{{ uploading ? 'Uploading…' : 'Upload' }}</button>
    </form>
  </section>
</template>
