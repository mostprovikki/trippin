import { wrap } from './_standalone.js'

const destinationSchema = {
  type: 'object',
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      minItems: 3,
      maxItems: 7,
      items: {
        type: 'object',
        required: ['name', 'rationale'],
        properties: {
          name: { type: 'string' },
          rationale: { type: 'string' },
          best_dates: { type: 'string' },
          est_budget_per_person: { type: 'number' },
          caveats: { type: 'string' },
        },
      },
    },
  },
}

const PRIVACY_RULE = 'Never invent or reference participant names, contact details, or medical information.'

function destinationParams(trip, prefSummary) {
  const vibe = (trip.vibe_tags || []).join(', ') || 'unspecified'

  const goals = (trip.goals || []).map((g) => {
    const constraints = []
    if (g.fixed_date) constraints.push(`fixed date: ${g.fixed_date}`)
    if (g.fixed_place) constraints.push(`fixed place: ${g.fixed_place}`)
    const suffix = constraints.length ? ` (constraint — ${constraints.join(', ')})` : ''
    return `- ${g.title}${suffix}`
  }).join('\n')

  const windows = (trip.windows || [])
    .map((w) => `${w.start_date} to ${w.end_date}${w.note ? ` (${w.note})` : ''}`)
    .join('; ')

  const dateInfo = trip.date_mode === 'confirmed' && trip.start_date && trip.end_date
    ? `Confirmed dates: ${trip.start_date} to ${trip.end_date}.`
    : windows
      ? `Candidate date windows / season to plan around: ${windows}.`
      : 'Dates are flexible or not yet set — suggest destinations with good general seasonal fit.'

  const prefsLines = [
    `Dietary needs: ${prefSummary.diet?.length ? prefSummary.diet.join(', ') : 'none specified'}`,
    `Pace preference: ${prefSummary.pace?.length ? prefSummary.pace.join(', ') : 'none specified'}`,
    `Budget band: ${prefSummary.budget_band?.length ? prefSummary.budget_band.join(', ') : 'none specified'}`,
    `Top interests: ${prefSummary.top_interests?.length ? prefSummary.top_interests.join(', ') : 'none specified'}`,
  ].join('\n')

  return { vibe, goals, dateInfo, prefsLines, currency: trip.currency || 'INR' }
}

// Pure prompt builder — no I/O. Never pass names/phones/emails/medical notes in here;
// `prefSummary` must already be aggregated counts-only (see destinations.routes.js#buildPrefSummary).
export function buildDestinationPrompt(trip, participantCount, prefSummary) {
  const { vibe, goals, dateInfo, prefsLines, currency } = destinationParams(trip, prefSummary)

  const prompt = `Suggest 3 to 7 destination candidates for a group trip, using ONLY the parameters below.

Vibe: ${vibe}
Goals:
${goals || 'none specified'}
${dateInfo}
Origin city: ${trip.origin_city || 'unspecified'}
Group size: ${participantCount} participant(s)
Currency: ${currency}

Aggregated group preferences (counts only — no personal details):
${prefsLines}

For each candidate return: a name, a short rationale tied to the vibe/goals/preferences above, a best_dates suggestion (season or month range), an estimated budget per person in ${currency}, and any caveats (visa, weather risk, long transit, etc).`

  return {
    system: `You are a meticulous trip-planning assistant. Propose destination candidates using only the trip parameters and aggregated group preferences supplied. ${PRIVACY_RULE}`,
    prompt,
    schema: destinationSchema,
  }
}

// Paste-ready single block for a bare chatbot (no system slot, no retry). Same arguments.
buildDestinationPrompt.standalone = function standaloneDestinationPrompt(trip, participantCount, prefSummary) {
  const { vibe, goals, dateInfo, prefsLines, currency } = destinationParams(trip, prefSummary)
  return wrap({
    role: 'You are a meticulous trip-planning assistant.',
    trip: [
      `Vibe: ${vibe}`,
      dateInfo,
      `Origin city: ${trip.origin_city || 'unspecified'}`,
      `Group size: ${participantCount} participant(s)`,
      `Currency: ${currency}`,
    ].join('\n'),
    constraints: [
      'Goals:',
      goals || 'none specified',
      'Aggregated group preferences (counts only — no personal details):',
      prefsLines,
    ].join('\n'),
    task: `Suggest 3 to 7 destination candidates for this group trip, using ONLY the parameters above. For each: a name, a short rationale tied to the vibe/goals/preferences, a best_dates suggestion (season or month range), an estimated budget per person in ${currency}, and any caveats (visa, weather risk, long transit, etc).`,
    schema: destinationSchema,
    rules: [PRIVACY_RULE],
  })
}
