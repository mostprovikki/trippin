<script setup>
import { reactive, ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
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
const saved = ref(false)

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
  saved.value = false
  try {
    await store.saveProfile(fields)
    saved.value = true
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
    <p class="pf-legend"><span class="pf-req" aria-hidden="true">*</span> Needed before the trip</p>
    <form @submit.prevent="submit">
      <div class="field">
        <label for="pf-name">Name</label>
        <InputText id="pf-name" v-model="form.name" required fluid />
      </div>
      <div class="field">
        <label for="pf-phone">Phone <span class="pf-req" aria-hidden="true">*</span></label>
        <InputText id="pf-phone" v-model="form.phone" aria-required="true" fluid />
      </div>
      <div class="field">
        <label for="pf-email">Email</label>
        <InputText id="pf-email" type="email" v-model="form.email" fluid />
      </div>
      <div class="field">
        <label for="pf-emergency">Emergency contact <span class="pf-req" aria-hidden="true">*</span></label>
        <InputText id="pf-emergency" v-model="form.emergency_contact" aria-required="true" fluid />
      </div>
      <div class="field">
        <label for="pf-dietary">Dietary <span class="pf-req" aria-hidden="true">*</span></label>
        <Select label-id="pf-dietary" v-model="form.dietary" :options="dietaryOptions" option-label="label" option-value="value" :pt="{ label: { 'aria-required': 'true' } }" fluid />
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
        <Select label-id="pf-pace" v-model="form.pace" :options="paceOptions" option-label="label" option-value="value" fluid />
      </div>
      <div class="field">
        <label for="pf-interests">Interests (comma-separated)</label>
        <InputText id="pf-interests" v-model="form.interests" placeholder="hiking, museums, food" fluid />
      </div>
      <div class="field">
        <label for="pf-budget">Budget band</label>
        <Select label-id="pf-budget" v-model="form.budget_band" :options="budgetOptions" option-label="label" option-value="value" fluid />
      </div>
      <div class="field">
        <label for="pf-city">Home city</label>
        <InputText id="pf-city" v-model="form.home_city" fluid />
      </div>
      <Button type="submit" :label="saving ? 'Saving…' : 'Save'" :disabled="saving" />
      <Tag v-if="saved && store.profileConfirmed" value="Profile confirmed ✓" severity="success" class="pf-confirmed" />
      <Message v-else-if="saved" severity="warn" :closable="false" class="pf-still">Saved. Still needed: {{ store.stillNeeded.join(', ') }}</Message>
    </form>
  </section>
</template>

<style scoped>
.pf-confirmed {
  margin-left: 0.75rem;
}
.pf-still {
  margin-top: 0.75rem;
}
.pf-req {
  color: var(--app-danger);
}
.pf-legend {
  margin: 0 0 0.75rem;
  color: var(--app-text-muted);
  font-size: 0.875rem;
}
</style>
