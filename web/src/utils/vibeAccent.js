// Deterministic accent color for a trip card, drawn from its first vibe tag.
// Not a status indicator — the trips-list group heading already says that —
// this is a texture that makes same-vibe trips recognizable at a glance in a
// grid where every card is otherwise the same white rectangle.
const PALETTE = ['var(--app-primary)', 'var(--app-accent-strong)', 'var(--app-success)', 'var(--app-text-muted)']

export function vibeAccentColor(vibeTags) {
  const raw = (vibeTags || [])[0]
  const tag = raw && raw.trim().toLowerCase()
  if (!tag) return null
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}
