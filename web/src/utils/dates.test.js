import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseIsoDate, toIsoDate, startOfToday, isExpiredIso, formatDayDate, dayHeader, tripCountdown } from './dates.js'

afterEach(() => { vi.useRealTimers() })

describe('parseIsoDate', () => {
  it('parses in local time, not UTC', () => {
    const d = parseIsoDate('2026-01-01')
    // The UTC-parsing bug shows up as Dec 31 of the previous year west of
    // Greenwich; asserting the parts catches it in any timezone.
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 0, 1])
    expect(d.getHours()).toBe(0)
  })

  it('rejects impossible dates instead of rolling them over', () => {
    expect(parseIsoDate('2026-02-31')).toBeNull()
    expect(parseIsoDate('2026-13-01')).toBeNull()
    expect(parseIsoDate('2026-00-10')).toBeNull()
    expect(parseIsoDate('2026-01-00')).toBeNull()
    expect(parseIsoDate('2027-02-29')).toBeNull()
  })

  it('accepts a real leap day', () => {
    expect(toIsoDate(parseIsoDate('2028-02-29'))).toBe('2028-02-29')
  })

  it('rejects malformed input', () => {
    for (const bad of ['', null, undefined, 'nope', '2026-1-1', '26-01-01', '2026/01/01']) {
      expect(parseIsoDate(bad), `${bad} should not parse`).toBeNull()
    }
  })
})

describe('toIsoDate', () => {
  it('zero-pads and round-trips', () => {
    expect(toIsoDate(new Date(2026, 6, 5))).toBe('2026-07-05')
    expect(toIsoDate(parseIsoDate('2035-04-30'))).toBe('2035-04-30')
  })

  it('returns empty for non-dates', () => {
    expect(toIsoDate(null)).toBe('')
    expect(toIsoDate(new Date('nope'))).toBe('')
  })
})

describe('isExpiredIso', () => {
  it('treats a document expiring today as still valid', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 25, 13, 30))
    expect(isExpiredIso('2026-07-25')).toBe(false)
    expect(isExpiredIso('2026-07-24')).toBe(true)
    expect(isExpiredIso('2026-07-26')).toBe(false)
  })

  it('is false for missing or malformed dates', () => {
    expect(isExpiredIso('')).toBe(false)
    expect(isExpiredIso(null)).toBe(false)
    expect(isExpiredIso('2026-02-31')).toBe(false)
  })
})

describe('startOfToday', () => {
  it('is local midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 25, 23, 59, 59))
    const t = startOfToday()
    expect([t.getFullYear(), t.getMonth(), t.getDate()]).toEqual([2026, 6, 25])
    expect([t.getHours(), t.getMinutes(), t.getSeconds()]).toEqual([0, 0, 0])
  })
})

describe('formatDayDate', () => {
  it('renders weekday, day, month — no year, no leading zero', () => {
    expect(formatDayDate('2026-11-06')).toBe('Fri 6 Nov')
    expect(formatDayDate('2026-01-01')).toBe('Thu 1 Jan')
  })
  it('falls back to the raw string for malformed input', () => {
    expect(formatDayDate('nope')).toBe('nope')
    expect(formatDayDate('')).toBe('')
  })
})

describe('dayHeader', () => {
  it('appends a 1-based day index', () => {
    expect(dayHeader('2026-11-06', 1)).toBe('Fri 6 Nov · Day 1')
    expect(dayHeader('2026-11-07', 2)).toBe('Sat 7 Nov · Day 2')
  })
  it('omits the day index when none is given', () => {
    expect(dayHeader('2026-11-06')).toBe('Fri 6 Nov')
  })
})

describe('tripCountdown', () => {
  const T = (y, m, d) => new Date(y, m, d)

  it('is null for idea/planning status regardless of dates', () => {
    expect(tripCountdown({ status: 'idea', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 10, 1))).toBeNull()
    expect(tripCountdown({ status: 'planning', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 10, 1))).toBeNull()
  })
  it('is null with no dates, even if confirmed', () => {
    expect(tripCountdown({ status: 'confirmed' }, T(2026, 10, 1))).toBeNull()
  })
  it('counts down before the trip starts', () => {
    expect(tripCountdown({ status: 'confirmed', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 9, 5))).toEqual({ label: '32 days to go' })
  })
  it('says "Starts tomorrow" exactly one day out', () => {
    expect(tripCountdown({ status: 'confirmed', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 10, 5))).toEqual({ label: 'Starts tomorrow' })
  })
  it('shows Day N of M on the start day and through the trip', () => {
    expect(tripCountdown({ status: 'active', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 10, 6))).toEqual({ label: 'Day 1 of 5' })
    expect(tripCountdown({ status: 'active', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 10, 8))).toEqual({ label: 'Day 3 of 5' })
    expect(tripCountdown({ status: 'active', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 10, 10))).toEqual({ label: 'Day 5 of 5' })
  })
  it('says "Ended" the day after end_date', () => {
    expect(tripCountdown({ status: 'active', start_date: '2026-11-06', end_date: '2026-11-10' }, T(2026, 10, 11))).toEqual({ label: 'Ended' })
  })
})
