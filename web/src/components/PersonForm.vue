<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
  initial: { type: Object, default: () => ({}) },
  submitLabel: { type: String, default: 'Save' }
})
const emit = defineEmits(['submit', 'cancel'])

function blank() {
  return {
    name: '', phone: '', email: '', emergency_contact: '', dietary: '',
    allergies: '', medical_notes: '', pace: '', interests: '', budget_band: '', home_city: ''
  }
}

const form = reactive(blank())

function loadFrom(src) {
  const b = blank()
  for (const k of Object.keys(b)) {
    if (k === 'interests') form.interests = Array.isArray(src?.interests) ? src.interests.join(', ') : ''
    else form[k] = src?.[k] ?? ''
  }
}
loadFrom(props.initial)
watch(() => props.initial, (v) => loadFrom(v))

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
      <select id="pf-dietary" v-model="form.dietary">
        <option value=""></option>
        <option value="veg">Veg</option>
        <option value="non_veg">Non-veg</option>
        <option value="vegan">Vegan</option>
      </select>
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
      <select id="pf-pace" v-model="form.pace">
        <option value=""></option>
        <option value="relaxed">Relaxed</option>
        <option value="moderate">Moderate</option>
        <option value="packed">Packed</option>
      </select>
    </div>
    <div class="field">
      <label for="pf-interests">Interests (comma-separated)</label>
      <input id="pf-interests" v-model="form.interests" placeholder="hiking, museums, food" />
    </div>
    <div class="field">
      <label for="pf-budget">Budget band</label>
      <select id="pf-budget" v-model="form.budget_band">
        <option value=""></option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
    </div>
    <div class="field">
      <label for="pf-city">Home city</label>
      <input id="pf-city" v-model="form.home_city" />
    </div>
    <button type="submit" class="btn btn-primary">{{ submitLabel }}</button>
    <button type="button" class="btn" @click="emit('cancel')">Cancel</button>
  </form>
</template>
