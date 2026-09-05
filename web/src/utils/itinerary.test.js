import { describe, it, expect } from 'vitest'
import { CATEGORY_ICONS, categoryIcon, parseTimeRange } from './itinerary.js'

describe('categoryIcon', () => {
  it('maps every known category', () => {
    expect(categoryIcon('travel')).toBe('✈️')
    expect(categoryIcon('food')).toBe('🍽️')
    expect(categoryIcon('activity')).toBe('🎟️')
    expect(categoryIcon('rest')).toBe('🛌')
    expect(categoryIcon('logistics')).toBe('🧳')
  })
  it('falls back to a bullet for unknown/missing categories', () => {
    expect(categoryIcon('nope')).toBe('•')
    expect(categoryIcon(undefined)).toBe('•')
  })
  it('exposes the map so callers can iterate it', () => {
    expect(Object.keys(CATEGORY_ICONS)).toEqual(['travel', 'food', 'activity', 'rest', 'logistics'])
  })
})

describe('parseTimeRange', () => {
  it('parses an en-dash range', () => {
    expect(parseTimeRange('18:00–21:00')).toEqual({ start: '18:00', end: '21:00' })
  })
  it('parses a hyphen range', () => {
    expect(parseTimeRange('09:00-10:30')).toEqual({ start: '09:00', end: '10:30' })
  })
  it('returns null for a single time with no range', () => {
    expect(parseTimeRange('18:00')).toBeNull()
  })
  it('returns null for free text', () => {
    expect(parseTimeRange('all day')).toBeNull()
    expect(parseTimeRange('morning-ish')).toBeNull()
  })
  it('returns null for garbage / empty input', () => {
    expect(parseTimeRange('')).toBeNull()
    expect(parseTimeRange(null)).toBeNull()
    expect(parseTimeRange(undefined)).toBeNull()
    expect(parseTimeRange('25:00–26:00')).toBeNull() // out-of-range hours rejected, not accepted as text
  })
  it('tolerates surrounding whitespace', () => {
    expect(parseTimeRange(' 08:00 – 09:15 ')).toEqual({ start: '08:00', end: '09:15' })
  })
})
