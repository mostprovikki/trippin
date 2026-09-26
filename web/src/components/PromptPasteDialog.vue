<script setup>
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import { api } from '../api/client.js'
import { useNotify } from '../composables/useNotify.js'

// BYO-AI path (trip-planner-d5d): show the server-built prompt to copy into
// the user's own AI tool, take the JSON reply back, and POST it to the
// matching .../import endpoint. One dialog for every AI site; the parent owns
// what a successful import means (set a draft, or refetch candidates).
const props = defineProps({
  visible: { type: Boolean, default: false },
  header: { type: String, default: 'Draft with your own AI' },
  promptUrl: { type: String, required: true },
  importUrl: { type: String, required: true }
})
const emit = defineEmits(['update:visible', 'imported'])
const notify = useNotify()

const prompt = ref('')
const promptError = ref(null)
const loadingPrompt = ref(false)
const reply = ref('')
const error = ref(null)
const busy = ref(false)

async function loadPrompt() {
  prompt.value = ''
  promptError.value = null
  reply.value = ''
  error.value = null
  loadingPrompt.value = true
  try { prompt.value = (await api.get(props.promptUrl)).prompt } catch (e) { promptError.value = e.message } finally { loadingPrompt.value = false }
}
watch(() => props.visible, (v) => { if (v) loadPrompt() }, { immediate: true })

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(prompt.value)
    notify.success('Prompt copied')
  } catch {
    notify.error('Could not access clipboard — select the prompt and copy it manually')
  }
}

async function submit() {
  if (!reply.value.trim() || busy.value) return
  busy.value = true
  error.value = null
  try {
    const res = await api.post(props.importUrl, { text: reply.value })
    emit('imported', res)
    emit('update:visible', false)
  } catch (e) {
    // Only the message changes: the textarea is patched, not rebuilt, so the
    // pasted reply and its caret survive for the user to fix.
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible" modal :header="header" :style="{ width: '40rem' }" :breakpoints="{ '640px': '95vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="paste-step">
      <div class="paste-step-head">
        <label for="paste-prompt">1. Copy this prompt into your AI tool</label>
        <Button type="button" data-test="paste-copy" label="Copy" icon="pi pi-copy" size="small" severity="secondary" outlined :disabled="!prompt" @click="copyPrompt" />
      </div>
      <p v-if="loadingPrompt" class="paste-muted">Building prompt…</p>
      <p v-else-if="promptError" class="paste-error" role="alert">{{ promptError }}</p>
      <Textarea v-else id="paste-prompt" data-test="paste-prompt" :model-value="prompt" readonly rows="8" fluid class="paste-mono" />
    </div>
    <div class="paste-step">
      <label for="paste-reply">2. Paste its JSON reply here</label>
      <Textarea id="paste-reply" v-model="reply" data-test="paste-reply" rows="8" fluid class="paste-mono" :invalid="!!error" aria-describedby="paste-error" />
      <p v-if="error" id="paste-error" class="paste-error" data-test="paste-error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <Button type="button" label="Cancel" severity="secondary" outlined @click="emit('update:visible', false)" />
      <Button type="button" data-test="paste-import" :label="busy ? 'Checking…' : 'Import draft'" :disabled="!reply.trim() || busy" @click="submit" />
    </template>
  </Dialog>
</template>

<style scoped>
.paste-step { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
.paste-step-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.paste-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8125rem; }
.paste-muted { color: var(--app-text-muted); margin: 0; }
.paste-error { color: var(--app-danger, #c0392b); font-size: 0.875rem; margin: 0; }
</style>
