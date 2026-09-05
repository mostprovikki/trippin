// Shared with DayCard.vue (organizer itinerary) and ParticipantItinerary.vue
// (guest read-only view) — one map so the emoji for "food" can't drift
// between the two renders of the same category.
export const CATEGORY_ICONS = { travel: '✈️', food: '🍽️', activity: '🎟️', rest: '🛌', logistics: '🧳' }
export function categoryIcon(cat) { return CATEGORY_ICONS[cat] || '•' }

// "HH:MM–HH:MM" (en dash) or "HH:MM-HH:MM" (hyphen) only — anything else
// (a single time, prose like "all day") is free text and stays free text;
// callers must not guess at it.
export function parseTimeRange(str) {
  const s = String(str ?? '').trim()
  const m = /^(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return null
  const [, h1, m1, h2, m2] = m
  const valid = (h, mi) => Number(h) >= 0 && Number(h) <= 23 && Number(mi) >= 0 && Number(mi) <= 59
  if (!valid(h1, m1) || !valid(h2, m2)) return null
  const pad = (n) => n.padStart(2, '0')
  return { start: `${pad(h1)}:${m1}`, end: `${pad(h2)}:${m2}` }
}
