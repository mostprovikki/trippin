<script setup>
import { computed, reactive, ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import RadioButton from 'primevue/radiobutton'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import { useParticipantStore } from '../stores/participant.js'

const store = useParticipantStore()

// Radios, not a Select: one tap instead of open-scan-tap (tripper.md §8
// Google Forms), and the three answers are visible without opening anything.
const dietaryOptions = [
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

// The fold's summary says how much is already in there, so a returning
// participant can see their answers weren't lost behind the closed fold.
const OPTIONAL = ['email', 'allergies', 'medical_notes', 'pace', 'interests', 'budget_band', 'home_city']
const optionalFilled = computed(() => OPTIONAL.filter((k) => String(form[k] ?? '').trim()).length)
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
  <form class="pf" @submit.prevent="submit">
    <!-- No card or heading of its own: ParticipantView's step card is the card,
         and its title already says "Your details" (trip-planner-0qh). A
         comment outside <form> would make the root a fragment. -->
    <p class="pf-legend"><span class="pf-req" aria-hidden="true">*</span> Needed before the trip</p>
    <!-- required questions first (tripper.md §3 "Google-Forms simple"); name is
         prefilled by the organizer, so it leads without a marker -->
    <div class="field">
      <label for="pf-name">Name</label>
      <InputText id="pf-name" v-model="form.name" autocomplete="name" required fluid />
    </div>
    <div class="field">
      <label for="pf-phone">Phone <span class="pf-req" aria-hidden="true">*</span></label>
      <InputText id="pf-phone" type="tel" v-model="form.phone" autocomplete="tel" aria-required="true" fluid />
    </div>
    <div class="field">
      <label for="pf-emergency">Emergency contact <span class="pf-req" aria-hidden="true">*</span></label>
      <InputText id="pf-emergency" v-model="form.emergency_contact" aria-required="true" fluid />
    </div>
    <fieldset id="pf-dietary" class="pf-choices" role="radiogroup" aria-required="true">
      <legend>Dietary <span class="pf-req" aria-hidden="true">*</span></legend>
      <!-- no inputId: the wrapping label is the tap target -->
      <label v-for="opt in dietaryOptions" :key="opt.value" class="pf-choice">
        <RadioButton v-model="form.dietary" name="dietary" :value="opt.value" />
        {{ opt.label }}
      </label>
    </fieldset>

    <details class="pf-more">
      <summary>
        <i class="pi pi-chevron-right" aria-hidden="true" />
        More about you (optional)<span v-if="optionalFilled" class="pf-filled">· {{ optionalFilled }} filled</span>
      </summary>
      <div class="field">
        <label for="pf-email">Email</label>
        <InputText id="pf-email" type="email" v-model="form.email" autocomplete="email" fluid />
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
        <InputText id="pf-city" v-model="form.home_city" autocomplete="address-level2" fluid />
      </div>
    </details>

    <Button type="submit" :label="saving ? 'Saving…' : 'Save'" :disabled="saving" fluid />
    <Tag v-if="saved && store.profileConfirmed" value="Profile confirmed ✓" severity="success" class="pf-confirmed" />
    <Message v-else-if="saved" severity="warn" :closable="false" class="pf-still">Saved. Still needed: {{ store.stillNeeded.join(', ') }}</Message>
  </form>
</template>

<style scoped>
/* Save is full width now, so the tag sits under it rather than beside it. */
.pf-confirmed {
  display: flex;
  width: fit-content;
  margin-top: 0.75rem;
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
.pf-choices {
  border: 0;
  padding: 0;
  margin: 0 0 1rem;
}
.pf-choices legend {
  padding: 0;
  margin-bottom: 0.25rem;
  font-weight: 600;
  font-size: 0.875rem;
}
.pf-choice {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 2.75rem;
  cursor: pointer;
}
.pf-more {
  margin: 0 0 1rem;
}
/* display:flex drops the native disclosure triangle, hence the chevron */
.pf-more summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  cursor: pointer;
  list-style: none;
  color: var(--app-primary);
  font-weight: 600;
}
.pf-more summary::-webkit-details-marker {
  display: none;
}
.pf-more summary .pi {
  font-size: 0.75rem;
  transition: transform 0.15s;
}
.pf-more[open] summary {
  margin-bottom: 0.5rem;
}
.pf-more[open] summary .pi {
  transform: rotate(90deg);
}
.pf-filled {
  color: var(--app-text-muted);
  font-weight: 400;
}
</style>
