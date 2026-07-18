// Pure function — no db/network access. PRIVACY: only trip parameters (destination,
// month/season, duration, vibe tags) go in. Never names, phone numbers, emails,
// document numbers/files, or medical notes.
export function buildPackingPrompt(trip, durationDays, checklistName) {
  const vibeTags = Array.isArray(trip?.vibe_tags)
    ? trip.vibe_tags
    : JSON.parse(trip?.vibe_tags || '[]')
  const destination = trip?.destination || 'unspecified'
  const month = trip?.start_date
    ? new Date(trip.start_date).toLocaleString('en-US', { month: 'long' })
    : 'unspecified'
  const duration = durationDays != null ? `${durationDays} day(s)` : 'unspecified'
  const vibe = vibeTags.length ? vibeTags.join(', ') : 'none specified'

  return [
    'Suggest a packing checklist for a trip. Return a draft list of item titles only.',
    `Destination: ${destination}`,
    `Month/season: ${month}`,
    `Duration: ${duration}`,
    `Vibe/trip type tags: ${vibe}`,
    `Checklist name: ${checklistName}`,
    'PRIVACY: no participant names, phone numbers, emails, document numbers, or medical notes were provided and none should appear in your answer.',
    'Respond with JSON only: {"items": [{"title": "..."}]}',
  ].join('\n')
}
