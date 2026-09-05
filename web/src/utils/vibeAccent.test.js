import { describe, it, expect } from 'vitest'
import { vibeAccentColor } from './vibeAccent.js'

describe('vibeAccentColor', () => {
  it('is deterministic for the same first tag', () => {
    expect(vibeAccentColor(['beach'])).toBe('var(--app-text-muted)')
    expect(vibeAccentColor(['beach'])).toBe(vibeAccentColor(['beach']))
  })
  it('spot-checks two other tags land on different palette entries', () => {
    expect(vibeAccentColor(['relax'])).toBe('var(--app-primary)')
    expect(vibeAccentColor(['foodie'])).toBe('var(--app-success)')
  })
  it('is null with no vibe tags', () => {
    expect(vibeAccentColor([])).toBeNull()
    expect(vibeAccentColor(undefined)).toBeNull()
  })
  it('only the first tag matters', () => {
    expect(vibeAccentColor(['beach', 'relax'])).toBe(vibeAccentColor(['beach']))
  })
})
