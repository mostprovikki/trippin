<script setup>
import { reactive, ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Button from 'primevue/button'
import { useParticipantStore } from '../stores/participant.js'

const store = useParticipantStore()

const dietaryOptions = [
  { label: '', value: '' },
  { label: 'Veg', value: 'veg' },
  { label: 'Non-veg', value: 'non_veg' },
  { label: 'Vegan', value: 'vegan' }
]
const paceOptions = [
  { label: '', value: '' },
  { label: 'Relaxed', value: 'relaxed' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Packed', value: 'packed' }
]
const budgetOptions = [
  { label: '', value: '' },
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

const form = reactive(blank())
const saving = ref(false)
const confirmed = ref(false)

function loadFrom(src) {
  const b = blank()
  for (const k of Object.keys(b)) {
    if (k === 'interests') form.interests = Array.isArray(src?.interests) ? src.interests.join(', ') : ''
    else form[k] = src?.[k] ?? ''
  }
}
loadFrom(store.person)
watch(() => store.person, (v) => loadFrom(v))

async function submit() {
  const fields = {
    name: form.name,
    phone: form.phone || null,
    email: form.email || null,
    emergency_contact: form.emergency_contact || null,
    dietary: form.dietary || null,
    allergies: form.allergies || null,
    medical_notes: form.medical_notes || null,
    pace: form.pace || null,
    interests: form.interests.split(',').map((s) => s.trim()).filter(Boolean),
    budget_band: form.budget_band || null,
    home_city: form.home_city || null
  }
  saving.value = true
  confirmed.value = false
  try {
    await store.saveProfile(fields)
    confirmed.value = true
  } catch {
    /* store.error surfaced by parent view */
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="card">
    <h2>Your details</h2>
    <form @submit.prevent="submit">
      <div class="field">
        <label for="pf-name">Name</label>
        <InputText id="pf-name" v-model="form.name" required fluid />
      </div>
      <div class="field">
        <label for="pf-phone">Phone</label>
        <InputText id="pf-phone" v-model="form.phone" fluid />
      </div>
      <div class="field">
        <label for="pf-email">Email</label>
        <InputText id="pf-email" type="email" v-model="form.email" fluid />
      </div>
      <div class="field">
        <label for="pf-emergency">Emergency contact</label>
        <InputText id="pf-emergency" v-model="form.emergency_contact" fluid />
      </div>
      <div class="field">
        <label for="pf-dietary">Dietary</label>
        <Select input-id="pf-dietary" v-model="form.dietary" :options="dietaryOptions" option-label="label" option-value="value" fluid />
      </div>
      <div class="field">
        <label for="pf-allergies">Allergies</label>
        <InputText id="pf-allergies" v-model="form.allergies" fluid />
      </div>
      <div class="field">
        <label for="pf-medical">Medical notes</label>
        <Textarea id="pf-medical" v-model="form.medical_notes" fluid auto-resize />
      </div>
      <div class="field">
        <label for="pf-pace">Preferred pace</label>
        <Select input-id="pf-pace" v-model="form.pace" :options="paceOptions" option-label="label" option-value="value" fluid />
      </div>
      <div class="field">
        <label for="pf-interests">Interests (comma-separated)</label>
        <InputText id="pf-interests" v-model="form.interests" placeholder="hiking, museums, food" fluid />
      </div>
      <div class="field">
        <label for="pf-budget">Budget band</label>
        <Select input-id="pf-budget" v-model="form.budget_band" :options="budgetOptions" option-label="label" option-value="value" fluid />
      </div>
      <div class="field">
        <label for="pf-city">Home city</label>
        <InputText id="pf-city" v-model="form.home_city" fluid />
      </div>
      <Button type="submit" :label="saving ? 'Saving…' : 'Save'" :disabled="saving" />
      <span v-if="confirmed" class="badge badge-ok pf-confirmed">Profile confirmed ✓</span>
    </form>
  </section>
</template>

<style scoped>
.pf-confirmed {
  margin-left: 0.75rem;
}
</style>
