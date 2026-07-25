<script setup>
import { reactive, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Select from 'primevue/select'
import { useDraft, confirmDiscard } from '../composables/useDraft.js'

const props = defineProps({
  initial: { type: Object, default: () => ({}) },
  submitLabel: { type: String, default: 'Save' },
  draftKey: { type: String, default: '' }
})
const emit = defineEmits(['submit', 'cancel'])

const DIETARY_OPTIONS = [
  { label: '—', value: '' },
  { label: 'Veg', value: 'veg' },
  { label: 'Non-veg', value: 'non_veg' },
  { label: 'Vegan', value: 'vegan' }
]
const PACE_OPTIONS = [
  { label: '—', value: '' },
  { label: 'Relaxed', value: 'relaxed' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Packed', value: 'packed' }
]
const BUDGET_BAND_OPTIONS = [
  { label: '—', value: '' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' }
]

function blank() {
  return {
    name: '', phone: '', email: '', emergency_contact: '', dietary: '',
    allergies: '', medical_notes: '', pace: '', interests: '', budget_band: '', home_city: ''
  }
}

function mapped(src) {
  const b = blank()
  const out = {}
  for (const k of Object.keys(b)) {
    if (k === 'interests') out.interests = Array.isArray(src?.interests) ? src.interests.join(', ') : ''
    else out[k] = src?.[k] ?? ''
  }
  return out
}

const confirm = useConfirm()
const router = useRouter()
const route = useRoute()

// Draft-backed when draftKey given; plain reactive otherwise.
const draftApi = props.draftKey
  ? useDraft(props.draftKey, blank, { router, route })
  : null
const form = draftApi ? draftApi.draft : reactive(blank())

if (draftApi) {
  draftApi.load(mapped(props.initial))
  watch(() => props.initial, (v) => draftApi.load(mapped(v)))
  onBeforeRouteLeave(async () => {
    if (!draftApi.isDirty.value) return true
    const ok = await confirmDiscard(confirm)
    if (ok) draftApi.clear()
    return ok
  })
} else {
  Object.assign(form, mapped(props.initial))
  watch(() => props.initial, (v) => Object.assign(form, mapped(v)))
}

function clearDraft() { draftApi?.clear() }
defineExpose({ clearDraft })

function submit() {
  const fields = {
    name: form.name,
    phone: form.phone || null,
    email: form.email || null,
    emergency_contact: form.emergency_contact || null,
    dietary: form.dietary || null,
    allergies: form.allergies || null,
    medical_notes: form.medical_notes || null,
    pace: form.pace || null,
    interests: form.interests.split(',').map(s => s.trim()).filter(Boolean),
    budget_band: form.budget_band || null,
    home_city: form.home_city || null
  }
  emit('submit', fields)
}

function onCancel() {
  // Restore BEFORE clearing, and assign the draft directly rather than going
  // through draftApi.load(): load() deliberately refuses to overwrite a dirty
  // draft (it only re-baselines), which is right when `initial` changes under a
  // half-typed form and wrong here. Without this, Cancel dropped the stored
  // draft and re-baselined isDirty to the EDITED values — so the fields kept the
  // edits, the form reported itself clean, and the unsaved-changes guard no
  // longer fired, silently discarding the changes on the next navigation.
  Object.assign(form, mapped(props.initial))
  clearDraft()
  emit('cancel')
}
</script>

<template>
  <form class="card" @submit.prevent="submit">
    <div class="field">
      <label for="pf-name">Name</label>
      <input id="pf-name" v-model="form.name" required />
    </div>
    <div class="field">
      <label for="pf-phone">Phone</label>
      <input id="pf-phone" v-model="form.phone" />
    </div>
    <div class="field">
      <label for="pf-email">Email</label>
      <input id="pf-email" type="email" v-model="form.email" />
    </div>
    <div class="field">
      <label for="pf-emergency">Emergency contact</label>
      <input id="pf-emergency" v-model="form.emergency_contact" />
    </div>
    <div class="field">
      <label for="pf-dietary">Dietary</label>
      <Select input-id="pf-dietary" v-model="form.dietary" :options="DIETARY_OPTIONS" option-label="label" option-value="value" fluid />
    </div>
    <div class="field">
      <label for="pf-allergies">Allergies</label>
      <input id="pf-allergies" v-model="form.allergies" />
    </div>
    <div class="field">
      <label for="pf-medical">Medical notes</label>
      <textarea id="pf-medical" v-model="form.medical_notes"></textarea>
    </div>
    <div class="field">
      <label for="pf-pace">Pace</label>
      <Select input-id="pf-pace" v-model="form.pace" :options="PACE_OPTIONS" option-label="label" option-value="value" fluid />
    </div>
    <div class="field">
      <label for="pf-interests">Interests (comma-separated)</label>
      <input id="pf-interests" v-model="form.interests" placeholder="hiking, museums, food" />
    </div>
    <div class="field">
      <label for="pf-budget">Budget band</label>
      <Select input-id="pf-budget" v-model="form.budget_band" :options="BUDGET_BAND_OPTIONS" option-label="label" option-value="value" fluid />
    </div>
    <div class="field">
      <label for="pf-city">Home city</label>
      <input id="pf-city" v-model="form.home_city" />
    </div>
    <Button type="submit" :label="submitLabel" />
    <Button type="button" label="Cancel" severity="secondary" outlined @click="onCancel" />
  </form>
</template>
