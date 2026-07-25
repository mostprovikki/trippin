<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Stepper from 'primevue/stepper'
import StepList from 'primevue/steplist'
import Step from 'primevue/step'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import RadioButton from 'primevue/radiobutton'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useTripsStore } from '../stores/trips.js'
import { usePeopleStore } from '../stores/people.js'
import { useDraft } from '../composables/useDraft.js'
import { useNotify } from '../composables/useNotify.js'
import DateField from './DateField.vue'
import DateWindowsEditor from './DateWindowsEditor.vue'

const router = useRouter()
const route = useRoute()
const store = useTripsStore()
const people = usePeopleStore()
const notify = useNotify()

const { draft, clear } = useDraft('trip-new', () => ({
  step: 1,
  name: '',
  description: '',
  origin_city: '',
  vibe_tags: '',
  date_mode: 'broad',
  start_date: '',
  end_date: '',
  flex_days: '',
  destination_mode: 'open',
  destination: '',
  participant_ids: [],
  windows: []
}), { urlFields: ['step'], router, route })

const stepErrors = ref([])
const submitting = ref(false)

// Floor for the end-date picker so it can't offer a day before the start date.
// Parsed in local time to match DateField. This is a UI hint only — validateStep()
// remains the authority, since the draft can be rehydrated with any pair of dates.
const startDate = computed(() => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(draft.start_date || '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
})

// No route-leave guard on purpose: the draft persists across navigation,
// which is what makes the "Add new person" round trip safe.

onMounted(async () => {
  try { await people.fetchPeople() } catch (e) { notify.error(e.message) }
})

function validateStep(s) {
  const errs = []
  if (s === 1 && !draft.name.trim()) errs.push('Name is required')
  if (s === 2) {
    if (draft.date_mode === 'confirmed' && draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
      errs.push('End date must be on or after start date')
    }
    if (draft.date_mode === 'slight' && draft.flex_days !== '' && Number(draft.flex_days) < 0) {
      errs.push('Flex days must be 0 or more')
    }
  }
  stepErrors.value = errs
  return errs.length === 0
}

function next() { if (draft.step < 4 && validateStep(draft.step)) draft.step++ }
function back() { if (draft.step > 1) { stepErrors.value = []; draft.step-- } }

function toggleParticipant(id) {
  const idx = draft.participant_ids.indexOf(id)
  if (idx === -1) draft.participant_ids.push(id)
  else draft.participant_ids.splice(idx, 1)
}

function onWindowsSave(list) { draft.windows = list }

const addPersonTo = computed(() => ({ path: '/people', query: { new: '1', return: '/trips/new?step=4' } }))

async function submit() {
  if (!validateStep(1) || !validateStep(2)) { draft.step = !draft.name.trim() ? 1 : 2; return }
  submitting.value = true
  try {
    const payload = {
      name: draft.name,
      description: draft.description || undefined,
      origin_city: draft.origin_city || undefined,
      vibe_tags: draft.vibe_tags.split(',').map((s) => s.trim()).filter(Boolean),
      date_mode: draft.date_mode,
      destination_mode: draft.destination_mode,
      participant_ids: draft.participant_ids
    }
    if (draft.date_mode === 'confirmed') {
      payload.start_date = draft.start_date || undefined
      payload.end_date = draft.end_date || undefined
    } else if (draft.date_mode === 'slight') {
      payload.start_date = draft.start_date || undefined
      payload.flex_days = draft.flex_days ? Number(draft.flex_days) : undefined
    }
    if (draft.destination_mode === 'decided') payload.destination = draft.destination || undefined

    const trip = await store.createTrip(payload)
    if (draft.date_mode === 'broad' && draft.windows.length) {
      await store.saveWindows(trip.id, draft.windows)
    }
    clear()
    notify.success(`Trip "${trip.name}" created`)
    router.push({ name: 'trip-overview', params: { id: trip.id } })
  } catch (e) {
    notify.error(e.message)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="trip-wizard card" @submit.prevent="submit">
    <Stepper :value="draft.step" linear>
      <StepList>
        <Step :value="1">Basics</Step>
        <Step :value="2">Dates</Step>
        <Step :value="3">Destination</Step>
        <Step :value="4">Participants</Step>
      </StepList>
    </Stepper>

    <div v-if="draft.step === 1">
      <div class="field"><label for="w-name">Name</label><InputText id="w-name" v-model="draft.name" fluid /></div>
      <div class="field"><label for="w-desc">Description</label><Textarea id="w-desc" v-model="draft.description" fluid auto-resize /></div>
      <div class="field"><label for="w-origin">Origin city</label><InputText id="w-origin" v-model="draft.origin_city" fluid /></div>
      <div class="field"><label for="w-vibe">Vibe tags (comma-separated)</label><InputText id="w-vibe" v-model="draft.vibe_tags" placeholder="beach, relaxed" fluid /></div>
    </div>

    <div v-else-if="draft.step === 2">
      <div class="field">
        <label>Date mode</label>
        <div class="radio-row"><RadioButton v-model="draft.date_mode" input-id="dm-confirmed" value="confirmed" /><label for="dm-confirmed">Confirmed</label></div>
        <div class="radio-row"><RadioButton v-model="draft.date_mode" input-id="dm-slight" value="slight" /><label for="dm-slight">Slight flex</label></div>
        <div class="radio-row"><RadioButton v-model="draft.date_mode" input-id="dm-broad" value="broad" /><label for="dm-broad">Broad</label></div>
      </div>
      <template v-if="draft.date_mode === 'confirmed'">
        <div class="field"><label for="w-start">Start date</label><DateField v-model="draft.start_date" input-id="w-start" /></div>
        <div class="field"><label for="w-end">End date</label><DateField v-model="draft.end_date" input-id="w-end" :min-date="startDate" /></div>
      </template>
      <template v-else-if="draft.date_mode === 'slight'">
        <div class="field"><label for="w-anchor">Anchor date</label><DateField v-model="draft.start_date" input-id="w-anchor" /></div>
        <div class="field"><label for="w-flex">Flex days</label><input id="w-flex" type="number" v-model="draft.flex_days" /></div>
      </template>
      <template v-else>
        <DateWindowsEditor :windows="draft.windows" @save="onWindowsSave" />
      </template>
    </div>

    <div v-else-if="draft.step === 3">
      <div class="field">
        <label>Destination mode</label>
        <div class="radio-row"><RadioButton v-model="draft.destination_mode" input-id="dsm-decided" value="decided" /><label for="dsm-decided">Decided</label></div>
        <div class="radio-row"><RadioButton v-model="draft.destination_mode" input-id="dsm-open" value="open" /><label for="dsm-open">Open</label></div>
      </div>
      <div class="field" v-if="draft.destination_mode === 'decided'">
        <label for="w-destination">Destination</label>
        <InputText id="w-destination" v-model="draft.destination" fluid />
      </div>
    </div>

    <div v-else-if="draft.step === 4">
      <p>Select participants:</p>
      <ul class="wizard-participants">
        <li v-for="p in people.people" :key="p.id">
          <Checkbox :model-value="draft.participant_ids.includes(p.id)" :input-id="`wp-${p.id}`" binary @update:model-value="toggleParticipant(p.id)" />
          <label :for="`wp-${p.id}`">{{ p.name }}</label>
        </li>
      </ul>
      <RouterLink :to="addPersonTo" class="wizard-add-link" data-test="add-person-link"><i class="pi pi-plus" aria-hidden="true" /> Add new person</RouterLink>
    </div>

    <Message v-for="e in stepErrors" :key="e" severity="error" :closable="false">{{ e }}</Message>

    <div class="wizard-nav">
      <Button v-if="draft.step > 1" type="button" label="Back" severity="secondary" outlined @click="back" />
      <Button v-if="draft.step < 4" type="button" label="Next" data-test="wizard-next" @click="next" />
      <Button v-if="draft.step === 4" type="submit" label="Create trip" :loading="submitting" />
    </div>
  </form>
</template>

<style scoped>
.wizard-nav { display: flex; gap: 0.5rem; margin-top: 1rem; }
.wizard-add-link {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  text-decoration: none;
  color: var(--app-text);
  font-size: 0.875rem;
  font-weight: 500;
}
.wizard-add-link:hover { border-color: var(--app-primary); color: var(--app-primary); }
.wizard-participants { list-style: none; padding: 0; }
.wizard-participants li { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; }
.radio-row { display: flex; align-items: center; gap: 0.5rem; margin: 0.25rem 0; }
</style>
