// Turns a raw search hit into something renderable and navigable.
//
// The API deliberately returns `kind` + ids rather than URLs — routing is the
// client's business — so this is the single place that knows a person lives at
// /people/:id and an itinerary hit opens the trip's itinerary section. Both the
// palette and the full results page use it, so they can never drift into
// linking the same result to two different destinations.
const ICONS = {
  trip: 'pi pi-map',
  person: 'pi pi-user',
  document: 'pi pi-file',
  itinerary: 'pi pi-list',
  template: 'pi pi-check-square',
  archive: 'pi pi-box'
}

const DOC_TYPE_LABELS = {
  passport: 'Passport',
  visa: 'Visa',
  national_id: 'National ID',
  driving_license: 'Driving licence',
  vaccination: 'Vaccination',
  other: 'Document'
}

// The rest of the app renders ISO dates verbatim (TripOverview, ParticipantView,
// and the picker's yy-mm-dd format), so search matches that rather than
// introducing a second date style.
function dateRange(start, end) {
  if (!start && !end) return null
  if (start && end) return `${start} – ${end}`
  return start || end
}

// A one-line summary under the title. Kept short: the palette is a narrow
// overlay and a wrapped subtitle costs a whole row of results.
function subtitleFor(kind, r) {
  if (kind === 'trip') {
    return [r.destination, dateRange(r.start_date, r.end_date)].filter(Boolean).join(' · ') || 'No destination yet'
  }
  if (kind === 'person') {
    return [r.home_city, r.email].filter(Boolean).join(' · ') || 'No contact details'
  }
  if (kind === 'document') {
    const type = DOC_TYPE_LABELS[r.doc_type] || r.doc_type
    const expiry = r.expiry_date ? `expires ${r.expiry_date}` : null
    return [r.person_name, type, expiry].filter(Boolean).join(' · ')
  }
  if (kind === 'itinerary') {
    return [r.trip_name, r.day_date, r.location].filter(Boolean).join(' · ')
  }
  if (kind === 'template') {
    const n = r.item_count ?? 0
    return [r.kind === 'packing' ? 'Packing' : 'Tasks', `${n} item${n === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
  }
  if (kind === 'archive') {
    // The notes ARE the reason this row matched, so show them rather than a label.
    const notes = (r.notes || '').replace(/\s+/g, ' ').trim()
    return notes ? (notes.length > 90 ? notes.slice(0, 89) + '…' : notes) : 'Archived trip'
  }
  return ''
}

// Where clicking the result should land. Every trip-scoped kind deep-links to
// the relevant SECTION rather than the trip root, so a hit on an itinerary item
// does not dump you on the overview to hunt for it again.
function routeFor(kind, r) {
  switch (kind) {
    case 'trip': return `/trips/${r.id}`
    case 'person': return `/people/${r.id}`
    // Documents live on their owner's detail page; there is no document route.
    case 'document': return `/people/${r.person_id}`
    case 'itinerary': return `/trips/${r.trip_id}/itinerary`
    // Templates are managed from a trip's checklists section; without a trip in
    // hand the best we can do is the checklists of the trip the user picks, so
    // this returns null and the UI renders it as non-navigable context.
    case 'template': return null
    case 'archive': return `/trips/${r.id}/settings`
    default: return null
  }
}

// A short right-aligned tag: status, doc expiry state, category.
function badgeFor(kind, r) {
  if (kind === 'trip') return r.archived_at ? 'archived' : r.status || null
  if (kind === 'itinerary') return r.category || null
  if (kind === 'template') return 'template'
  if (kind === 'archive') return 'archived'
  return null
}

export function decorate(kind, r) {
  return {
    ...r,
    kind,
    icon: ICONS[kind] || 'pi pi-circle',
    title: r.title || '(untitled)',
    subtitle: subtitleFor(kind, r),
    badge: badgeFor(kind, r),
    to: routeFor(kind, r)
  }
}

// Flatten the grouped API response into the order the list actually renders, so
// keyboard navigation can index into ONE array instead of tracking a
// group/result coordinate pair. Group headers stay available for display.
export function flatten(groups) {
  const out = []
  for (const g of groups || []) {
    for (const r of g.results || []) out.push({ ...decorate(g.kind, r), groupLabel: g.label })
  }
  return out
}
