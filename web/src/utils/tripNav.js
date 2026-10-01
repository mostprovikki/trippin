// Trip-section registry + readiness-derived nav hints. Pure functions, no Vue.

import { missingRows } from './overview.js'

// Trip nav per docs/design/tripper.md §5: five one-click tabs, then the rare
// admin edits behind Details ▾. Goals folded into Destination; Readiness was cut
// (its job moved to the Overview) — both old routes redirect in router.js.
export const TRIP_TABS = [
  { name: 'trip-overview', label: 'Overview', icon: 'pi pi-home' },
  { name: 'trip-itinerary', label: 'Itinerary', icon: 'pi pi-list-check' },
  { name: 'trip-budget', label: 'Budget', icon: 'pi pi-wallet' },
  { name: 'trip-checklists', label: 'Checklists', icon: 'pi pi-check-square' },
  { name: 'trip-people', label: 'People', icon: 'pi pi-users' }
]

export const TRIP_DETAILS = [
  { name: 'trip-dates', label: 'Dates', icon: 'pi pi-calendar' },
  { name: 'trip-destination', label: 'Destination', icon: 'pi pi-map-marker' },
  { name: 'trip-settings', label: 'Settings', icon: 'pi pi-cog' }
]

// Every trip page with a nav entry — AppNav's breadcrumb looks labels up here.
export const TRIP_SECTIONS = [...TRIP_TABS, ...TRIP_DETAILS]

// tripper.md §6 "one number, one place": the People and Checklists badges are
// the Overview's own numbers — people missing anything (Who's missing what)
// and open checklist items (Checklists card) — never a second count.
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export function sectionHints(data) {
  if (!data) return {}
  const d = data.decisions || {}
  const hints = {
    'trip-dates': { ok: !!d.dates_confirmed },
    'trip-destination': { ok: !!d.destination_decided }
  }
  const missing = missingRows(data.participants || [], null).rows.length
  if (missing > 0) hints['trip-people'] = { count: missing, label: `${plural(missing, 'person', 'people')} missing details or documents` }
  const c = data.checklists || {}
  const open = Math.max(0, (c.total_items || 0) - (c.done_items || 0))
  if (open > 0) hints['trip-checklists'] = { count: open, label: plural(open, 'open checklist item', 'open checklist items') }
  return hints
}
