import { wrap } from './_standalone.js'

export const CATEGORIES = ['primary_transport', 'secondary_transport', 'stay', 'food', 'activities', 'shopping', 'leisure', 'misc']

const budgetSchema = {
  type: 'object',
  required: ['lines'],
  properties: {
    lines: {
      type: 'array',
      minItems: 8,
      maxItems: 8,
      items: {
        type: 'object',
        required: ['category', 'estimate', 'basis'],
        properties: {
          category: { enum: CATEGORIES },
          estimate: { type: 'number', minimum: 0 },
          basis: { type: 'string' },
        },
      },
    },
  },
}

function budgetParams(trip) {
  const dates = trip.start_date ? `${trip.start_date} to ${trip.end_date}` : 'dates not final (assume typical season)'
  const vibeTags = (() => {
    try { return JSON.parse(trip.vibe_tags || '[]') } catch { return [] }
  })()
  return { dates, vibe: vibeTags.join(', ') || 'general', currency: trip.currency || 'INR' }
}

export function buildBudgetPrompt(trip, participantCount) {
  const { dates, vibe, currency } = budgetParams(trip)
  return {
    system: 'You are a travel budget estimator. Output JSON only.',
    prompt: `Estimate a per-trip group budget in ${currency} for:
Destination: ${trip.destination || 'not decided'} | From: ${trip.origin_city || 'unknown'} | Dates: ${dates}
Group size: ${participantCount} | Vibe: ${vibe}
Return one line per category (exactly these 8: primary_transport, secondary_transport, stay, food, activities, shopping, leisure, misc), each with a numeric total-group "estimate" and a one-line "basis" explaining the math.`,
    schema: budgetSchema,
  }
}

// Paste-ready single block for a bare chatbot (no system slot, no retry). Same arguments.
buildBudgetPrompt.standalone = function standaloneBudgetPrompt(trip, participantCount) {
  const { dates, vibe, currency } = budgetParams(trip)
  return wrap({
    role: 'You are a travel budget estimator.',
    trip: [
      `Destination: ${trip.destination || 'not decided'}`,
      `From: ${trip.origin_city || 'unknown'}`,
      `Dates: ${dates}`,
      `Group size: ${participantCount}`,
      `Vibe: ${vibe}`,
    ].join('\n'),
    constraints: [
      `Currency: ${currency} — every estimate is in ${currency}.`,
      `Estimates are totals for the whole group of ${participantCount}, not per person.`,
      `Exactly these 8 categories, one line each: ${CATEGORIES.join(', ')}.`,
    ].join('\n'),
    task: 'Estimate a per-trip group budget. For each category give a numeric total-group "estimate" and a one-line "basis" explaining the math.',
    schema: budgetSchema,
    rules: ['Return all 8 categories exactly once each — no extras, no omissions.'],
  })
}
