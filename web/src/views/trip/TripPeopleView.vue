<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import Menu from 'primevue/menu'
import { useTripsStore } from '../../stores/trips.js'
import { usePeopleStore } from '../../stores/people.js'
import { useReadinessStore } from '../../stores/readiness.js'
import { missingRows } from '../../utils/overview.js'
import { useNotify } from '../../composables/useNotify.js'
import { useCopyLink } from '../../composables/useCopyLink.js'
import SectionHeader from '../../components/SectionHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import QRCode from 'qrcode'
import { formatDayDate } from '../../utils/dates.js'

const route = useRoute()
const trips = useTripsStore()
const people = usePeopleStore()
const readiness = useReadinessStore()
const confirm = useConfirm()
const notify = useNotify()
const { copy, resolve } = useCopyLink()

const tripId = computed(() => route.params.id)
const newParticipantId = ref(null)
// { personId, dataUrl } — one QR open at a time, under its own row
const qr = ref(null)
// personId → that row's ⋯ Menu
const menus = {}
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

// §6 one number, one place: the same rows as the People badge and the
// Overview's Who's missing what. Readiness held for another trip counts as none.
const missingByPerson = computed(() => {
  const ps = readiness.lastTripId === tripId.value ? readiness.data?.participants || [] : []
  return new Map(missingRows(ps, trips.current?.end_date || null).rows.map((r) => [r.personId, r]))
})
const missingFor = (personId) => missingByPerson.value.get(personId)
const refreshReadiness = () => readiness.fetch(tripId.value).catch(() => { /* badge refreshes on next section change */ })

async function load() {
  // A half-picked "Add person" selection and an open QR both belong to the
  // trip they were made on. Only these two are cleared here: trips.links
  // used to be emptied by hand as well, but the store now drops another trip's
  // links itself when asked about this one.
  newParticipantId.value = null
  qr.value = null
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
    refreshReadiness()
  } catch (e) { notify.error(e.message) }
}

function removeParticipant(personId, name) {
  confirm.require({
    message: `Remove ${name || 'this person'} from this trip?`,
    header: 'Remove from trip',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Remove',
    acceptClass: 'p-button-danger',
    rejectLabel: 'Cancel',
    accept: async () => {
      try { await trips.removeParticipant(tripId.value, personId) } catch (e) { notify.error(e.message); return }
      refreshReadiness()
    }
  })
}

// The WhatsApp text that goes with a person's link.
function linkMessage(url) {
  const tripName = trips.current?.name || 'the trip'
  const { start_date: start, end_date: end } = trips.current || {}
  let dates
  if (start && end) dates = `${formatDayDate(start)} – ${formatDayDate(end)}`
  else if (start) dates = `from ${formatDayDate(start)}`
  else dates = 'Dates TBD'
  return `You're in for ${tripName}! 🎒 ${dates}. Tap to confirm your details: ${url}`
}

async function reloadLinks() {
  try { await trips.fetchLinks(tripId.value) } catch (e) { notify.error(e.message) }
}

// Copy, message and QR re-read the person's link and mint only when there is
// none (tripper.md §9 D1: copying never revokes). A mint changes the link
// list, so History and Replace's "is there one to revoke?" must see it.
async function withLink(p, act) {
  const had = activeLink(p.person_id)
  const url = await act({ hasActiveLink: had })
  if (url && !had) await reloadLinks()
  return url
}
const copyLink = (p) => withLink(p, (o) => copy(tripId.value, p.person_id, p.name, o))
const copyMessage = (p) => withLink(p, (o) => copy(tripId.value, p.person_id, p.name, { ...o, compose: linkMessage }))
async function showQr(p) {
  qr.value = null
  const url = await withLink(p, (o) => resolve(tripId.value, p.person_id, p.name, o))
  if (!url) return
  try { qr.value = { personId: p.person_id, dataUrl: await QRCode.toDataURL(url) } }
  catch { notify.error(`Could not generate a QR code — copy ${p.name}'s link instead`) }
}
async function replaceLink(p) {
  // re-read first: a link minted by Copy moments ago is still one to ask about
  await reloadLinks()
  if (!(await copy(tripId.value, p.person_id, p.name, { hasActiveLink: activeLink(p.person_id), replace: true }))) return
  await reloadLinks()
  refreshReadiness()
}

// tripper.md §5 / D8: management actions live under the row's ⋯.
function menuItems(p) {
  return [
    ...(activeLink(p.person_id) ? [{ label: 'Replace link', icon: 'pi pi-refresh', command: () => replaceLink(p) }] : []),
    { label: 'Copy message', icon: 'pi pi-comment', command: () => copyMessage(p) },
    { label: 'Show QR code', icon: 'pi pi-qrcode', command: () => showQr(p) },
    { separator: true },
    { label: 'Remove from trip', icon: 'pi pi-trash', class: 'menu-danger', command: () => removeParticipant(p.person_id, p.name) }
  ]
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
    <SectionHeader title="People" description="Who's coming, and each person's link.">
      <template #actions>
        <Select input-id="tp-new-participant" name="tp-new-participant" v-model="newParticipantId" :options="availablePeople" option-label="name" option-value="id" placeholder="Add person…" filter />
        <Button label="Add" icon="pi pi-plus" :disabled="!newParticipantId" @click="addParticipant" />
      </template>
    </SectionHeader>

    <EmptyState
      v-if="!(trips.current?.participants || []).length"
      icon="pi pi-users"
      message="No participants yet — add people, then copy each person's link."
    />

    <div v-for="p in trips.current?.participants || []" :key="p.person_id" class="card participant-card">
      <div class="participant-row">
        <div class="participant-id">
          <span class="participant-name">{{ p.name }}</span>
          <Tag v-if="missingFor(p.person_id)" data-missing value="Missing" :severity="missingFor(p.person_id).severity" />
        </div>
        <div class="participant-actions">
          <Button size="small" outlined icon="pi pi-copy" :label="`Copy ${p.name}'s link`" @click="copyLink(p)" />
          <Button
            icon="pi pi-ellipsis-h" severity="secondary" text rounded
            :aria-label="`More actions for ${p.name}`" aria-haspopup="true" :aria-controls="`pm-${p.person_id}`"
            @click="menus[p.person_id].toggle($event)"
          />
          <Menu :id="`pm-${p.person_id}`" :ref="(el) => { if (el) menus[p.person_id] = el }" :model="menuItems(p)" popup />
        </div>
      </div>

      <p v-if="missingFor(p.person_id)" class="participant-reason">{{ missingFor(p.person_id).reasons.join(' · ') }}</p>

      <div v-if="qr && qr.personId === p.person_id" class="link-qr">
        <img :src="qr.dataUrl" :alt="`QR code for ${p.name}'s link`" />
        <Button label="Close" size="small" text @click="qr = null" />
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
.participant-reason { margin: 0.25rem 0 0; color: var(--app-text-muted); font-size: 0.875rem; }
.history-toggle { margin-top: 0.25rem; padding-left: 0; padding-right: 0; }
.link-qr { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.5rem; }
.link-qr img { width: 8rem; height: 8rem; }
.links-list { list-style: none; padding: 0; margin: 0.75rem 0 0; }
.links-list li { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; }
.link-meta { color: var(--app-text-muted); font-size: 0.8125rem; }
/* §4 / D7: every control on a row is a 44px target on a phone */
@media (max-width: 639px) {
  .participant-card :deep(.p-button) { min-height: 44px; }
  .participant-card :deep(.p-button-icon-only) { min-width: 44px; }
}
</style>
