// Shared with DayCard.vue (organizer itinerary) and ParticipantItinerary.vue
// (guest read-only view) — one map so the emoji for "food" can't drift
// between the two renders of the same category.
export const CATEGORY_ICONS = { travel: '✈️', food: '🍽️', activity: '🎟️', rest: '🛌', logistics: '🧳' }
export function categoryIcon(cat) { return CATEGORY_ICONS[cat] || '•' }
