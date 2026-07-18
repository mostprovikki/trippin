const CATEGORIES = ['travel', 'food', 'activity', 'rest', 'logistics']

const itemSchema = {
  type: 'object',
  required: ['title', 'category'],
  properties: {
    title: { type: 'string' },
    time_range: { type: 'string' },
    location: { type: 'string' },
    category: { type: 'string', enum: CATEGORIES },
    est_cost: { type: 'number' },
    notes: { type: 'string' },
  },
}

export const draftSchema = {
  type: 'object',
  required: ['days'],
  properties: {
    days: {
      type: 'array',
      items: {
        type: 'object',
        required: ['day_date', 'items'],
        properties: {
          day_date: { type: 'string' },
          items: { type: 'array', items: itemSchema },
        },
      },
    },
  },
}

export const dayRegenSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: { type: 'array', items: itemSchema },
  },
}

const SYSTEM = 'You are a precise trip-planning assistant. You output ONLY JSON matching the requested schema. Never invent participant names or personal details — you are given only aggregated trip parameters.'

function goalLines(goals) {
  if (!goals || !goals.length) return 'No fixed goals.'
  return goals.map((g) => {
    if (g.fixed_date) {
      return `NON-NEGOTIABLE: ${g.title} on ${g.fixed_date}${g.fixed_place ? ` at ${g.fixed_place}` : ''}.`
    }
    return `Goal: ${g.title}${g.fixed_place ? ` (near ${g.fixed_place})` : ''}${g.notes ? ` — ${g.notes}` : ''}.`
  }).join('\n')
}

function tripLines(trip) {
  const lines = []
  lines.push(`Trip: ${trip.name || 'Untitled trip'}`)
  if (trip.destination) lines.push(`Destination: ${trip.destination}`)
  if (trip.start_date && trip.end_date) lines.push(`Dates: ${trip.start_date} to ${trip.end_date}`)
  const vibeTags = Array.isArray(trip.vibe_tags) ? trip.vibe_tags : (typeof trip.vibe_tags === 'string' ? JSON.parse(trip.vibe_tags || '[]') : [])
  if (vibeTags.length) lines.push(`Vibe: ${vibeTags.join(', ')}`)
  if (trip.paceSummary) lines.push(`Group pace: ${trip.paceSummary}`)
  return lines.join('\n')
}

/**
 * Build the prompt for a full-trip itinerary AI draft.
 * Pure function — receives only aggregated/derived data, never person records.
 * @param {object} trip - trip row (name, destination, start_date, end_date, vibe_tags, optional paceSummary)
 * @param {Array<{title,fixed_date,fixed_place,notes}>} goals
 * @param {string} dietSummary - e.g. "2 veg, 1 vegan, 3 non_veg of 6 total"
 * @param {string[]} days - ISO date strings for each day in the trip
 */
export function buildItineraryPrompt(trip, goals, dietSummary, days) {
  const prompt = [
    tripLines(trip),
    '',
    goalLines(goals),
    '',
    `Dietary needs across the group: ${dietSummary || 'no data'} — every food stop needs an option covering these counts.`,
    '',
    `Draft a day-by-day itinerary for exactly these dates: ${days.join(', ')}.`,
    'For each day, propose 3-6 items covering travel, food, activities, rest and logistics as appropriate.',
    'Respect any NON-NEGOTIABLE goal above by placing it on its exact date.',
    'Return ONLY JSON: { "days": [ { "day_date": "YYYY-MM-DD", "items": [ { "title", "time_range", "location", "category", "est_cost", "notes" } ] } ] }',
  ].join('\n')
  return { system: SYSTEM, prompt, schema: draftSchema }
}

/**
 * Build the prompt to regenerate a single day's itinerary.
 * Pure function — receives only the day's own items (no participant PII).
 * @param {object} trip
 * @param {{id,day_date,position}} day
 * @param {Array<{title,time_range,location,category,est_cost,notes}>} currentItems
 * @param {string|null} instruction - e.g. "more relaxed"
 */
export function buildDayRegenPrompt(trip, day, currentItems, instruction) {
  const currentLines = (currentItems && currentItems.length)
    ? currentItems.map((it) => `- ${it.title}${it.time_range ? ` (${it.time_range})` : ''} [${it.category}]`).join('\n')
    : '(no items yet)'
  const prompt = [
    tripLines(trip),
    '',
    `Regenerate ONLY the itinerary for ${day.day_date}.`,
    'Current items for this day:',
    currentLines,
    '',
    instruction ? `Instruction: ${instruction}` : 'Instruction: refine and improve this day.',
    'Return ONLY JSON: { "items": [ { "title", "time_range", "location", "category", "est_cost", "notes" } ] }',
  ].join('\n')
  return { system: SYSTEM, prompt, schema: dayRegenSchema }
}
