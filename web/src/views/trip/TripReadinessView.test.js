import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripReadinessView from './TripReadinessView.vue'
import { useReadinessStore } from '../../stores/readiness.js'

const SECTIONS = ['trip-dates', 'trip-destination', 'trip-budget', 'trip-itinerary', 'trip-people', 'trip-checklists']

async function mountView(data) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/trips/:id/readiness', name: 'trip-readiness', component: TripReadinessView },
      ...SECTIONS.map((name) => ({ path: `/trips/:id/${name.slice(5)}`, name, component: { template: '<div/>' } }))
    ]
  })
  await router.push('/trips/t1/readiness')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useReadinessStore()
  store.fetch = async () => { store.data = data }
  await store.fetch('t1')
  const wrapper = mountWithBase(TripReadinessView, { pinia, global: { plugins: [router] } })
  return { wrapper }
}

describe('TripReadinessView', () => {
  it('links decision chips, participant tags, and overdue items to the section that fixes them', async () => {
    const { wrapper } = await mountView({
      decisions: { dates_confirmed: 0, destination_decided: 1, budget_drafted: 0, itinerary_days: 0 },
      participants: [{ person_id: 'p1', name: 'Asha', profile_confirmed: 0, docs_count: 1, doc_warnings: [{ doc_type: 'passport', level: 'expired', expiry_date: '2026-01-01' }], has_active_link: true }],
      checklists: { total_items: 2, done_items: 0, overdue: [{ title: 'Book flights', due_date: '2026-01-01' }] }
    })
    const links = wrapper.findAll('a')
    expect(links.some((a) => a.attributes('href') === '/trips/t1/dates')).toBe(true)
    expect(links.some((a) => a.attributes('href') === '/trips/t1/destination')).toBe(true)
    expect(links.some((a) => a.attributes('href') === '/trips/t1/budget')).toBe(true)
    expect(links.some((a) => a.attributes('href') === '/trips/t1/itinerary')).toBe(true)
    // the profile tag and the doc-warning tag both point at People
    expect(links.filter((a) => a.attributes('href') === '/trips/t1/people').length).toBeGreaterThanOrEqual(2)
    expect(links.some((a) => a.attributes('href') === '/trips/t1/checklists')).toBe(true)
  })

  it('gives readiness links a contextual accessible name, not a bare glyph', async () => {
    const { wrapper } = await mountView({
      decisions: { dates_confirmed: 0, destination_decided: 1, budget_drafted: 0, itinerary_days: 0 },
      participants: [{ person_id: 'p1', name: 'Asha', profile_confirmed: 0, docs_count: 1, doc_warnings: [{ doc_type: 'passport', level: 'expired', expiry_date: '2026-01-01' }], has_active_link: true }],
      checklists: { total_items: 2, done_items: 0, overdue: [{ title: 'Book flights', due_date: '2026-01-01' }] }
    })
    const links = wrapper.findAll('a.tag-link')
    const profileLink = links.find((a) => a.attributes('href') === '/trips/t1/people' && a.attributes('aria-label')?.includes('Asha'))
    expect(profileLink).toBeTruthy()
    expect(profileLink.attributes('aria-label')).toContain('profile')

    const docWarningLink = links.find((a) => a.attributes('aria-label')?.toLowerCase().includes('passport'))
    expect(docWarningLink).toBeTruthy()

    const overdueLink = links.find((a) => a.attributes('aria-label')?.includes('Book flights'))
    expect(overdueLink).toBeTruthy()
  })
})
