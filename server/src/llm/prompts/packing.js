import { wrap } from './_standalone.js'

// Same shape checklists.routes.js validates inline for the LLM draft route.
export const packingSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } },
    },
  },
}

const PRIVACY = 'PRIVACY: no participant names, phone numbers, emails, document numbers, or medical notes were provided and none should appear in your answer.'

function packingParams(trip, durationDays) {
  const vibeTags = Array.isArray(trip?.vibe_tags)
    ? trip.vibe_tags
    : JSON.parse(trip?.vibe_tags || '[]')
  return {
    destination: trip?.destination || 'unspecified',
    month: trip?.start_date
      ? new Date(trip.start_date).toLocaleString('en-US', { month: 'long' })
      : 'unspecified',
    duration: durationDays != null ? `${durationDays} day(s)` : 'unspecified',
    vibe: vibeTags.length ? vibeTags.join(', ') : 'none specified',
  }
}

// Pure function — no db/network access. PRIVACY: only trip parameters (destination,
// month/season, duration, vibe tags) go in. Never names, phone numbers, emails,
// document numbers/files, or medical notes.
export function buildPackingPrompt(trip, durationDays, checklistName) {
  const { destination, month, duration, vibe } = packingParams(trip, durationDays)

  return [
    'Suggest a packing checklist for a trip. Return a draft list of item titles only.',
    `Destination: ${destination}`,
    `Month/season: ${month}`,
    `Duration: ${duration}`,
    `Vibe/trip type tags: ${vibe}`,
    `Checklist name: ${checklistName}`,
    PRIVACY,
    'Respond with JSON only: {"items": [{"title": "..."}]}',
  ].join('\n')
}

// Paste-ready single block for a bare chatbot (no system slot, no retry). Same arguments.
buildPackingPrompt.standalone = function standalonePackingPrompt(trip, durationDays, checklistName) {
  const { destination, month, duration, vibe } = packingParams(trip, durationDays)
  return wrap({
    role: 'You are a practical travel packing assistant.',
    trip: [
      `Destination: ${destination}`,
      `Month/season: ${month}`,
      `Duration: ${duration}`,
      `Vibe/trip type tags: ${vibe}`,
    ].join('\n'),
    constraints: [
      `Checklist name: ${checklistName}`,
      PRIVACY,
    ].join('\n'),
    task: 'Suggest a packing checklist for this trip as a draft list of short item titles only (one physical item or task per title).',
    schema: packingSchema,
    rules: ['Never include participant names, phone numbers, emails, document numbers, or medical notes.'],
  })
}
