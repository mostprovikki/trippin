import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseIsoDate, toIsoDate, startOfToday, isExpiredIso } from './dates.js'

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
