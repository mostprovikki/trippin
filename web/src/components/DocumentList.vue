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
import { fetchDocumentBlob, triggerBlobDownload, getDocUrl } from '../utils/downloadDoc.js'

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

// A Set, not a single flag: several rows can each be downloading independently.
const downloadingIds = ref(new Set())

async function download(doc) {
  // Was a plain same-origin `<a href>` — that alone works for cookie auth, but a
  // presigned Stratus URL behind a 302 only preserves the document's original
  // filename if the client fetches it as a blob (see downloadDoc.js).
  if (downloadingIds.value.has(doc.id)) return // in-flight guard: a double-click must not double-download
  downloadingIds.value.add(doc.id)
  try {
    const { url, direct } = await store.getDocumentUrl(doc.id)
    const blob = await fetchDocumentBlob({ url, direct })
    triggerBlobDownload(blob, doc.original_name)
  } catch (e) {
    notify.error(e.message)
  } finally {
    downloadingIds.value.delete(doc.id)
  }
}

// Secondary action: view the file inline instead of saving it. Same {url,
// direct} step as download() (getDocUrl below — no second fetch-the-url path
// to maintain); getDocUrl appends `?inline=1` on the local driver's same-origin
// path so /file answers with `content-disposition: inline` instead of
// `attachment` (see documents.routes.js sendDoc) — otherwise "open in new tab"
// just re-triggered a download and the tab closed itself. direct:true's `url`
// (a presigned Stratus link) already renders inline via its own contentType.
const openingIds = ref(new Set())

async function openInTab(doc) {
  if (openingIds.value.has(doc.id)) return // same in-flight guard as download()
  openingIds.value.add(doc.id)
  // window.open() must run synchronously, before any await — called after one
  // it's lost the click event's user-activation and gets popup-blocked in
  // Safari/Firefox. Open a blank placeholder now and navigate it once the URL
  // resolves. `.opener = null` (set by hand, not via a 'noopener' window
  // feature) keeps the reverse-tabnabbing protection without losing the
  // reference — most browsers hand back null for the reference itself when
  // 'noopener' is passed to window.open, and step 2 needs that reference.
  const w = window.open('about:blank')
  if (w) w.opener = null
  if (!w) {
    openingIds.value.delete(doc.id)
    notify.error('Your browser blocked the pop-up. Allow pop-ups for this site and try again.')
    return
  }
  try {
    const url = await getDocUrl(store, doc.id)
    w.location = url
  } catch (e) {
    w.close()
    notify.error(e.message)
  } finally {
    openingIds.value.delete(doc.id)
  }
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
          <td data-label="File"><a href="#" :aria-disabled="downloadingIds.has(doc.id)" @click.prevent="download(doc)">{{ doc.original_name }}</a></td>
          <td>
            <div class="doc-actions">
              <Button type="button" icon="pi pi-external-link" :loading="openingIds.has(doc.id)" severity="secondary" text rounded class="icon-muted-btn" :aria-label="`Open ${doc.original_name} in new tab`" @click="openInTab(doc)" />
              <Button type="button" icon="pi pi-trash" severity="secondary" text rounded class="icon-danger-btn" :aria-label="`Delete ${doc.original_name}`" @click="remove(doc)" />
            </div>
          </td>
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

<style scoped>
/* Two icon-only row actions side by side (open-in-tab, delete) — same gap as
   the .field rows below them, tight enough to still read as one action group. */
.doc-actions {
  display: flex;
  gap: 0.25rem;
}
</style>
