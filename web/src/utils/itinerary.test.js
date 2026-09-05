import { describe, it, expect } from 'vitest'
import { CATEGORY_ICONS, categoryIcon } from './itinerary.js'

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
