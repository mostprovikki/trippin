import { describe, it, expect } from 'vitest'
import { parseTimeRange, buildTripIcs, slugify } from '../src/lib/ics.js'

describe('parseTimeRange', () => {
  it('parses en-dash and hyphen ranges', () => {
    expect(parseTimeRange('18:00–21:00')).toEqual({ start: '18:00', end: '21:00' })
    expect(parseTimeRange('09:05-10:00')).toEqual({ start: '09:05', end: '10:00' })
    expect(parseTimeRange(' 08:00 – 09:00 ')).toEqual({ start: '08:00', end: '09:00' })
  })
  it('returns null for missing/malformed/out-of-range input', () => {
    expect(parseTimeRange(null)).toBeNull()
    expect(parseTimeRange(undefined)).toBeNull()
    expect(parseTimeRange('')).toBeNull()
    expect(parseTimeRange('evening')).toBeNull()
    expect(parseTimeRange('25:00-26:00')).toBeNull()
    expect(parseTimeRange('18:00')).toBeNull()
  })
})

describe('slugify', () => {
  it('lowercases, hyphenates, strips punctuation', () => {
    expect(slugify('Goa Trip 2026!')).toBe('goa-trip-2026')
    expect(slugify('  Épic   Trip  ')).toBe('pic-trip')
    expect(slugify('')).toBe('trip')
    expect(slugify(null)).toBe('trip')
  })
})

describe('buildTripIcs', () => {
  const trip = { name: 'Goa Trip' }

  it('emits one VEVENT per item with parseable times as floating DTSTART/DTEND', () => {
    const days = [{ day_date: '2026-03-01', items: [
      { id: 'i1', title: 'Beach', time_range: '18:00–21:00', location: 'Baga', notes: null, link: null }
    ] }]
    const ics = buildTripIcs({ trip, days })
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('UID:i1@tripper')
    expect(ics).toContain('DTSTART:20260301T180000')
    expect(ics).toContain('DTEND:20260301T210000')
    expect(ics).toContain('SUMMARY:Beach')
    expect(ics).toContain('LOCATION:Baga')
    expect(ics).not.toContain('TZID')
  })

  it('falls back to an all-day VALUE=DATE event when time_range is unparseable', () => {
    const days = [{ day_date: '2026-03-02', items: [
      { id: 'i2', title: 'Free day', time_range: null, location: null, notes: null, link: null }
    ] }]
    const ics = buildTripIcs({ trip, days })
    expect(ics).toContain('DTSTART;VALUE=DATE:20260302')
    expect(ics).toContain('DTEND;VALUE=DATE:20260303')
  })

  it('escapes commas, semicolons and newlines per RFC5545', () => {
    const days = [{ day_date: '2026-03-01', items: [
      { id: 'i3', title: 'Lunch, then; walk\nrepeat', location: null, notes: null, link: null, time_range: null }
    ] }]
    const ics = buildTripIcs({ trip, days })
    expect(ics).toContain('SUMMARY:Lunch\\, then\\; walk\\nrepeat')
  })

  it('combines notes and link into DESCRIPTION when both present', () => {
    const days = [{ day_date: '2026-03-01', items: [
      { id: 'i4', title: 'Museum', time_range: null, location: null, notes: 'Bring ID', link: 'http://x.com' }
    ] }]
    const ics = buildTripIcs({ trip, days })
    expect(ics).toMatch(/DESCRIPTION:Bring ID\\n\\nhttp:\/\/x\.com/)
  })
})
