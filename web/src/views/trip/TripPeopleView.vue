<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useTripsStore } from '../../stores/trips.js'
import { usePeopleStore } from '../../stores/people.js'
import { useNotify } from '../../composables/useNotify.js'
import SectionHeader from '../../components/SectionHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import QRCode from 'qrcode'
import { formatDayDate } from '../../utils/dates.js'

const route = useRoute()
const trips = useTripsStore()
const people = usePeopleStore()
const confirm = useConfirm()
const notify = useNotify()

const tripId = computed(() => route.params.id)
const newParticipantId = ref(null)
const revealedLink = ref(null)
const qrDataUrl = ref(null)
// Which people currently have their link history expanded — collapsed by
// default, per person, so opening one doesn't open all of them.
const expandedHistory = ref(new Set())
// window globals aren't reachable from template expression scope
const origin = location.origin

const availablePeople = computed(() => {
  if (!trips.current) return []
  const memberIds = new Set((trips.current.participants || []).map((p) => p.person_id))
  return people.people.filter((p) => !memberIds.has(p.id))
})

async function load() {
  // A half-picked "Add person" selection and a one-time link reveal both belong
  // to the trip they were made on. Only these two are cleared here: trips.links
  // used to be emptied by hand as well, but the store now drops another trip's
  // links itself when asked about this one.
  newParticipantId.value = null
  revealedLink.value = null
  try { await trips.fetchLinks(tripId.value) } catch (e) { notify.error(e.message) }
  try { await people.fetchPeople() } catch { /* select stays empty; non-critical */ }
}

onMounted(load)
// Belt and braces, not the mechanism. Trip-scoped stores now clear themselves
// when asked about a different trip, which empties trips.current and makes
// TripLayout fall back to its skeleton — that unmounts this view, so onMounted
// covers the common path today (verified in a browser: the skeleton really does
// appear on a param-only switch). Kept because the reuse it guards against is
// silent when it returns: the sidebar would say one trip and the body show
// another, with edits written to whichever id the view captured first.
watch(tripId, load)

async function addParticipant() {
  if (!newParticipantId.value) return
  try {
    await trips.addParticipant(tripId.value, newParticipantId.value)
    newParticipantId.value = null
  } catch (e) { notify.error(e.message) }
}

function removeParticipant(personId) {
  confirm.require({
    message: 'Remove this participant?',
    header: 'Remove participant',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Remove',
    acceptClass: 'p-button-danger',
    rejectLabel: 'Cancel',
    accept: async () => {
      try { await trips.removeParticipant(tripId.value, personId) } catch (e) { notify.error(e.message) }
    }
  })
}

async function mintLink(personId) {
  let result
  try {
    result = await trips.createLink(tripId.value, personId)
    revealedLink.value = { personId, url: result.url }
    qrDataUrl.value = null
    await trips.fetchLinks(tripId.value)
    notify.success('Link created')
  } catch (e) {
    notify.error(e.message)
    return
  }
  // Separate try/catch: a QR-rendering failure shouldn't look like the mint
  // itself failed, and mustn't leave the previous person's QR image showing
  // under this person's name (qrDataUrl was already cleared above).
  try {
    qrDataUrl.value = await QRCode.toDataURL(origin + result.url)
  } catch {
    notify.error('Could not generate a QR code — the link above still works')
  }
}

function createLink(personId, personName) {
  // Minting silently revokes any prior active link server-side (links.routes.js)
  // — same destructive effect as Revoke, so it needs the same consent gate.
  // First-time creation (no active link) stays one-click.
  if (!activeLink(personId)) {
    mintLink(personId)
    return
  }
  confirm.require({
    message: `${personName || 'This person'}'s current link stops working immediately — anyone using it loses access. A new link will be created.`,
    header: `Replace ${personName || 'this person'}'s link?`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Replace',
    acceptClass: 'p-button-danger',
    rejectLabel: 'Cancel',
    accept: () => mintLink(personId)
  })
}

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(location.origin + url)
    notify.success('Link copied')
  } catch {
    notify.error('Could not access clipboard — copy the link manually')
  }
}

function inviteMessage(personId) {
  if (!trips.current) return ''
  const tripName = trips.current.name || 'the trip'
  const { start_date: start, end_date: end } = trips.current
  let dates
  if (start && end) dates = `${formatDayDate(start)} – ${formatDayDate(end)}`
  else if (start) dates = `from ${formatDayDate(start)}`
  else dates = 'Dates TBD'
  const url = revealedLink.value && revealedLink.value.personId === personId
    ? origin + revealedLink.value.url : ''
  return `You're in for ${tripName}! 🎒 ${dates}. Tap to confirm your details: ${url}`
}

async function copyMessage(personId) {
  try {
    await navigator.clipboard.writeText(inviteMessage(personId))
    notify.success('Message copied')
  } catch {
    notify.error('Could not access clipboard — copy the message manually')
  }
}

function revokeLink(linkId, personName) {
  confirm.require({
    message: `Revoke this link? ${personName || 'This person'} will immediately lose access to the trip, and the link cannot be restored — you'd have to create a new one.`,
    header: 'Revoke link',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Revoke',
    acceptClass: 'p-button-danger',
    rejectLabel: 'Cancel',
    accept: async () => {
      try { await trips.revokeLink(linkId) } catch (e) { notify.error(e.message) }
    }
  })
}

function linksFor(personId) {
  return trips.links.filter((l) => l.person_id === personId)
}

function activeLink(personId) {
  return linksFor(personId).some((l) => !l.revoked_at)
}

function isHistoryOpen(personId) {
  return expandedHistory.value.has(personId)
}

function toggleHistory(personId) {
  // Reassign (not mutate in place) so the Set change is seen by Vue's
  // reactivity — a plain .add()/.delete() on the same object wouldn't trigger.
  const next = new Set(expandedHistory.value)
  if (next.has(personId)) next.delete(personId)
  else next.add(personId)
  expandedHistory.value = next
}
</script>

<template>
  <div>
    <SectionHeader title="People" description="Who's coming, and their personal share links.">
      <template #actions>
        <Select input-id="tp-new-participant" name="tp-new-participant" v-model="newParticipantId" :options="availablePeople" option-label="name" option-value="id" placeholder="Add person…" filter />
        <Button label="Add" icon="pi pi-plus" :disabled="!newParticipantId" @click="addParticipant" />
      </template>
    </SectionHeader>

    <EmptyState
      v-if="!(trips.current?.participants || []).length"
      icon="pi pi-users"
      message="No participants yet — add people so you can send them their trip link."
    />

    <div v-for="p in trips.current?.participants || []" :key="p.person_id" class="card participant-card">
      <div class="participant-row">
        <div class="participant-id">
          <span class="participant-name">{{ p.name }}</span>
          <Tag v-if="activeLink(p.person_id)" value="link active" severity="success" />
          <Tag v-else value="no link" severity="secondary" />
          <Tag v-if="!p.profile_confirmed" value="profile unconfirmed" severity="warn" />
        </div>
        <div class="participant-actions">
          <Button :label="activeLink(p.person_id) ? 'Replace link' : 'Create link'" size="small" outlined icon="pi pi-link" @click="createLink(p.person_id, p.name)" />
          <Button icon="pi pi-trash" size="small" severity="secondary" text rounded class="icon-danger-btn" :aria-label="`Remove ${p.name || 'this person'}`" @click="removeParticipant(p.person_id)" />
        </div>
      </div>

      <div v-if="revealedLink && revealedLink.personId === p.person_id" class="link-reveal">
        <p><strong>Shown only once — copy it now:</strong></p>
        <code>{{ origin + revealedLink.url }}</code>
        <Button label="Copy" size="small" icon="pi pi-copy" @click="copyLink(revealedLink.url)" />
        <textarea readonly class="invite-message" aria-label="Invite message" :value="inviteMessage(p.person_id)"></textarea>
        <Button label="Copy message" size="small" outlined icon="pi pi-copy" @click="copyMessage(p.person_id)" />
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR code for invite link" class="invite-qr" />
      </div>

      <Button
        v-if="linksFor(p.person_id).length"
        :label="`History (${linksFor(p.person_id).length})`"
        size="small"
        text
        class="history-toggle"
        :icon="isHistoryOpen(p.person_id) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
        :aria-expanded="isHistoryOpen(p.person_id)"
        @click="toggleHistory(p.person_id)"
      />

      <ul v-if="linksFor(p.person_id).length && isHistoryOpen(p.person_id)" class="links-list">
        <li v-for="link in linksFor(p.person_id)" :key="link.id">
          <span class="link-meta">created {{ link.created_at }}</span>
          <Tag v-if="link.revoked_at" value="revoked" severity="warn" />
          <Button v-else icon="pi pi-times" size="small" severity="secondary" text rounded class="icon-danger-btn" :aria-label="`Revoke link for ${p.name || 'this person'}`" @click="revokeLink(link.id, p.name)" />
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.participant-card { padding: 0.625rem 0.75rem; }
.participant-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
.participant-id { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.participant-name { font-weight: 600; }
.participant-actions { display: flex; gap: 0.25rem; }
.history-toggle { margin-top: 0.25rem; padding-left: 0; padding-right: 0; }
.link-reveal {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border-radius: var(--app-radius-sm);
  background: var(--app-accent-soft);
  border: 1px solid var(--app-accent);
  overflow-wrap: anywhere;
}
.link-reveal code { display: block; margin: 0.25rem 0 0.5rem; font-size: 0.8125rem; }
.invite-message {
  display: block;
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  font: inherit;
  font-size: 0.9375rem;
  background: var(--app-surface);
  color: var(--app-text);
  resize: vertical;
  min-height: 4rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.invite-message:focus {
  outline: none;
  border-color: var(--app-primary);
  box-shadow: 0 0 0 3px var(--app-focus-ring);
}
.invite-qr { display: block; margin-top: 0.5rem; width: 8rem; height: 8rem; }
.links-list { list-style: none; padding: 0; margin: 0.75rem 0 0; }
.links-list li { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; }
.link-meta { color: var(--app-text-muted); font-size: 0.8125rem; }
</style>
