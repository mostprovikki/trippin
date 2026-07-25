import { describe, it, expect } from 'vitest'
import { decorate, flatten } from './searchResults.js'

describe('decorate', () => {
  it('routes a trip hit to the trip, and a person hit to the person', () => {
    expect(decorate('trip', { id: 't1', title: 'Goa' }).to).toBe('/trips/t1')
    expect(decorate('person', { id: 'p1', title: 'Asha' }).to).toBe('/people/p1')
  })

  // There is no /documents/:id route; a document is reached through its owner.
  it('routes a document to its OWNER, not to its own id', () => {
    const d = decorate('document', { id: 'd1', person_id: 'p9', title: 'scan.pdf' })
    expect(d.to).toBe('/people/p9')
  })

  // Deep-linking to the section is the point: landing on the trip overview would
  // mean hunting for the matched item all over again.
  it('routes an itinerary hit to its trip’s itinerary section', () => {
    expect(decorate('itinerary', { id: 'i1', trip_id: 't7', title: 'Sunset' }).to)
      .toBe('/trips/t7/itinerary')
  })

  it('routes an archive hit to the trip’s settings, where the archive lives', () => {
    expect(decorate('archive', { id: 't3', title: 'Ladakh' }).to).toBe('/trips/t3/settings')
  })

  it('marks a template as non-navigable rather than inventing a route', () => {
    expect(decorate('template', { id: 'c1', title: 'Beach packing' }).to).toBeNull()
  })

  it('summarises a trip with destination and date range', () => {
    const t = decorate('trip', {
      id: 't1', title: 'Goa', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-08'
    })
    expect(t.subtitle).toBe('Goa · 2026-08-01 – 2026-08-08')
  })

  it('falls back to a readable subtitle when a trip has nothing set', () => {
    expect(decorate('trip', { id: 't1', title: 'Untitled' }).subtitle).toBe('No destination yet')
  })

  it('shows the owner, a human doc type and the expiry on a document', () => {
    const d = decorate('document', {
      id: 'd1', person_id: 'p1', person_name: 'Asha Kumar',
      doc_type: 'national_id', expiry_date: '2035-04-30'
    })
    expect(d.subtitle).toBe('Asha Kumar · National ID · expires 2035-04-30')
  })

  it('omits the expiry clause when a document has no expiry', () => {
    const d = decorate('document', { id: 'd1', person_id: 'p1', person_name: 'Asha', doc_type: 'visa' })
    expect(d.subtitle).toBe('Asha · Visa')
  })

  it('shows archive notes as the subtitle, since the notes are why it matched', () => {
    const a = decorate('archive', { id: 't1', title: 'Ladakh', notes: 'Book  the\n Nubra permits' })
    expect(a.subtitle).toBe('Book the Nubra permits')
  })

  it('truncates a long archive note instead of wrapping the row', () => {
    const a = decorate('archive', { id: 't1', title: 'X', notes: 'y'.repeat(200) })
    expect(a.subtitle).toHaveLength(90)
    expect(a.subtitle.endsWith('…')).toBe(true)
  })

  it('pluralises the template item count', () => {
    expect(decorate('template', { id: 'c1', title: 'T', kind: 'packing', item_count: 1 }).subtitle)
      .toBe('Packing · 1 item')
    expect(decorate('template', { id: 'c1', title: 'T', kind: 'tasks', item_count: 3 }).subtitle)
      .toBe('Tasks · 3 items')
  })

  it('badges an archived trip as archived rather than by status', () => {
    const t = decorate('trip', { id: 't1', title: 'X', status: 'archived', archived_at: '2026-01-01' })
    expect(t.badge).toBe('archived')
    expect(decorate('trip', { id: 't2', title: 'Y', status: 'planning' }).badge).toBe('planning')
  })

  it('gives every kind an icon and never an empty title', () => {
    for (const kind of ['trip', 'person', 'document', 'itinerary', 'template', 'archive']) {
      const d = decorate(kind, { id: 'x' })
      expect(d.icon).toMatch(/^pi pi-/)
      expect(d.title).toBe('(untitled)')
    }
  })
})

describe('flatten', () => {
  const groups = [
    { kind: 'trip', label: 'Trips', results: [{ id: 't1', title: 'Goa' }, { id: 't2', title: 'Goa 2' }] },
    { kind: 'person', label: 'People', results: [{ id: 'p1', title: 'Asha' }] }
  ]

  it('produces one flat list in group order, tagged with its group label', () => {
    const flat = flatten(groups)
    expect(flat.map((r) => r.id)).toEqual(['t1', 't2', 'p1'])
    expect(flat.map((r) => r.groupLabel)).toEqual(['Trips', 'Trips', 'People'])
    expect(flat[2].to).toBe('/people/p1')
  })

  it('handles missing or empty input without throwing', () => {
    expect(flatten(undefined)).toEqual([])
    expect(flatten([])).toEqual([])
    expect(flatten([{ kind: 'trip', label: 'Trips' }])).toEqual([])
  })
})
