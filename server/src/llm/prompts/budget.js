export const CATEGORIES = ['primary_transport', 'secondary_transport', 'stay', 'food', 'activities', 'shopping', 'leisure', 'misc']

export function buildBudgetPrompt(trip, participantCount) {
  const dates = trip.start_date ? `${trip.start_date} to ${trip.end_date}` : 'dates not final (assume typical season)'
  const vibeTags = (() => {
    try { return JSON.parse(trip.vibe_tags || '[]') } catch { return [] }
  })()
  return {
    system: 'You are a travel budget estimator. Output JSON only.',
    prompt: `Estimate a per-trip group budget in ${trip.currency || 'INR'} for:
Destination: ${trip.destination || 'not decided'} | From: ${trip.origin_city || 'unknown'} | Dates: ${dates}
Group size: ${participantCount} | Vibe: ${vibeTags.join(', ') || 'general'}
Return one line per category (exactly these 8: primary_transport, secondary_transport, stay, food, activities, shopping, leisure, misc), each with a numeric total-group "estimate" and a one-line "basis" explaining the math.`,
    schema: {
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
    },
  }
}
