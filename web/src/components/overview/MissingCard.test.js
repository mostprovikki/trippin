import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mountWithBase } from '../../test-utils.js'
import MissingCard from './MissingCard.vue'

const ok = { profile_confirmed: 1, doc_warnings: [], missing_fields: [], missing_docs: [] }

async function mountCard(props, slots) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/trips/:id', name: 'trip-overview', component: { template: '<div/>' } },
      { path: '/trips/:id/people', name: 'trip-people', component: { template: '<div/>' } }
    ]
  })
  await router.push('/trips/t1')
  await router.isReady()
  return mountWithBase(MissingCard, { props, slots, global: { plugins: [router] } })
}

describe('MissingCard', () => {
  it('renders N of M, one row per incomplete person, pills with data-doc-level, complete line', async () => {
    const w = await mountCard({ tripEnd: '2026-11-15', participants: [
      { ...ok, person_id: 'a', name: 'Asha' },
      { ...ok, person_id: 'p', name: 'Priya', doc_warnings: [
        { doc_type: 'passport', level: 'expired', expiry_date: '2026-06-30' },
        { doc_type: 'visa', level: 'warning', expiry_date: '2026-12-31' }
      ] }
    ] })
    expect(w.find('h2').text()).toBe("Who's missing what · 1 of 2 people")
    expect(w.findAll('[data-person-row]')).toHaveLength(1)
    expect(w.find('[data-doc-level="expired"]').classes()).toContain('p-tag-danger')
    expect(w.find('[data-doc-level="expired"]').text()).toBe('Passport expires 30 Jun 2026')
    expect(w.find('[data-doc-level="warning"]').classes()).toContain('p-tag-warn')
    expect(w.find('[data-person-row]').classes()).toContain('sev-danger')
    expect(w.text()).toContain('Passport expires before the trip ends')
    expect(w.text()).toContain('Asha is complete.')
  })

  it('everyone complete: says so, no rows, no complete-names line', async () => {
    const w = await mountCard({ tripEnd: null, participants: [{ ...ok, person_id: 'a', name: 'Asha' }] })
    expect(w.find('h2').text()).toBe("Who's missing what · 0 of 1 people")
    expect(w.findAll('[data-person-row]')).toHaveLength(0)
    expect(w.text()).toContain("Everyone's details are in.")
    expect(w.text()).not.toContain('is complete.')
  })

  it('no participants: points to People', async () => {
    const w = await mountCard({ tripEnd: null, participants: [] })
    expect(w.text()).toContain('No participants yet')
    expect(w.find('a').attributes('href')).toBe('/trips/t1/people')
  })

  it('row-action slot receives the person', async () => {
    const w = await mountCard(
      { tripEnd: null, participants: [{ ...ok, person_id: 'm', name: 'Meena', missing_fields: ['dietary'] }] },
      { 'row-action': '<template #row-action="{ personId, name }"><i class="act">{{ personId }}:{{ name }}</i></template>' }
    )
    expect(w.find('.act').text()).toBe('m:Meena')
  })
})
