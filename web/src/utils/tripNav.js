// Trip-section registry + readiness-derived nav hints. Pure functions, no Vue.

export const TRIP_SECTIONS = [
  { name: 'trip-overview', label: 'Overview', icon: 'pi pi-home', group: null },
  { name: 'trip-dates', label: 'Dates', icon: 'pi pi-calendar', group: 'Plan' },
  { name: 'trip-destination', label: 'Destination', icon: 'pi pi-map-marker', group: 'Plan' },
  { name: 'trip-goals', label: 'Goals', icon: 'pi pi-flag', group: 'Plan' },
  { name: 'trip-people', label: 'People', icon: 'pi pi-users', group: 'People' },
  { name: 'trip-budget', label: 'Budget', icon: 'pi pi-wallet', group: 'Logistics' },
  { name: 'trip-itinerary', label: 'Itinerary', icon: 'pi pi-list-check', group: 'Logistics' },
  { name: 'trip-checklists', label: 'Checklists', icon: 'pi pi-check-square', group: 'Logistics' },
  { name: 'trip-readiness', label: 'Readiness', icon: 'pi pi-gauge', group: null },
  { name: 'trip-settings', label: 'Settings', icon: 'pi pi-cog', group: null }
]

function parts(data) {
  const d = data?.decisions || {}
  const participants = data?.participants || []
  const checklists = data?.checklists || {}
  const unconfirmed = participants.filter((p) => !p.profile_confirmed).length
  return { d, participants, checklists, unconfirmed, overdue: (checklists.overdue || []).length }
}

// count badges across sections (People, Checklists) are all "items needing
// attention" counts, never totals — trip-dates/trip-destination use a
// separate ok:boolean shape for done/not-done, so there's no total-count
// precedent to switch People to. Disambiguate instead: carry a label
// alongside count so the badge's accessible name (title/aria-label in
// TripLayout.vue) states what's being counted, wording reused from
// nextActions below so the sidebar and the guided next-step list agree.
function unconfirmedLabel(n) {
  return `${n} participant profile${n === 1 ? '' : 's'} unconfirmed`
}
function overdueLabel(n) {
  return `${n} overdue checklist item${n === 1 ? '' : 's'}`
}

export function sectionHints(data) {
  if (!data) return {}
  const { d, unconfirmed, overdue } = parts(data)
  const hints = {
    'trip-dates': { ok: !!d.dates_confirmed },
    'trip-destination': { ok: !!d.destination_decided },
    'trip-readiness': { text: `${readinessPercent(data)}%` }
  }
  if (unconfirmed > 0) hints['trip-people'] = { count: unconfirmed, label: unconfirmedLabel(unconfirmed) }
  if (overdue > 0) hints['trip-checklists'] = { count: overdue, label: overdueLabel(overdue) }
  return hints
}

// Equal-weight average over applicable components: the 4 decisions always
// count; participant confirmation and checklist completion count only when
// non-empty (so a fresh trip reads 0%, not 50%).
export function readinessPercent(data) {
  if (!data) return 0
  const { d, participants, checklists } = parts(data)
  const components = [
    d.dates_confirmed ? 1 : 0,
    d.destination_decided ? 1 : 0,
    d.budget_drafted ? 1 : 0,
    (d.itinerary_days || 0) > 0 ? 1 : 0
  ]
  if (participants.length) {
    components.push(participants.filter((p) => p.profile_confirmed).length / participants.length)
  }
  if (checklists.total_items) {
    components.push((checklists.done_items || 0) / checklists.total_items)
  }
  return Math.round((components.reduce((a, b) => a + b, 0) / components.length) * 100)
}

export function nextActions(data) {
  if (!data) return []
  const { d, participants, unconfirmed, overdue } = parts(data)
  const actions = []
  if (!d.dates_confirmed) actions.push({ label: 'Confirm the dates', to: 'trip-dates' })
  if (!d.destination_decided) actions.push({ label: 'Decide the destination', to: 'trip-destination' })
  if (!d.budget_drafted) actions.push({ label: 'Draft a budget', to: 'trip-budget' })
  if (!(d.itinerary_days > 0)) actions.push({ label: 'Build the itinerary', to: 'trip-itinerary' })
  if (!participants.length) actions.push({ label: 'Add participants', to: 'trip-people' })
  if (unconfirmed > 0) actions.push({ label: unconfirmedLabel(unconfirmed), to: 'trip-people' })
  if (overdue > 0) actions.push({ label: overdueLabel(overdue), to: 'trip-checklists' })
  return actions
}
