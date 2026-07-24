import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripOverviewView from './TripOverviewView.vue'
import { useTripsStore } from '../../stores/trips.js'
import { useReadinessStore } from '../../stores/readiness.js'
import { useBudgetStore } from '../../stores/budget.js'

const SECTIONS = ['trip-dates', 'trip-destination', 'trip-budget', 'trip-itinerary', 'trip-people', 'trip-checklists', 'trip-readiness']

async function mountView({ readiness }) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/trips/:id', name: 'trip-overview', component: TripOverviewView },
      ...SECTIONS.map((name) => ({ path: `/trips/:id/${name.slice(5)}`, name, component: { template: '<div/>' } }))
    ]
  })
  await router.push('/trips/t1')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const trips = useTripsStore()
  trips.current = { id: 't1', name: 'Goa 2026', status: 'planning', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05', vibe_tags: ['beach'], participants: [{ person_id: 'p1', name: 'Asha' }] }
  const r = useReadinessStore()
  r.data = readiness
  r.lastTripId = 't1'
  r.fetch = vi.fn().mockResolvedValue()
  const budget = useBudgetStore()
  budget.fetchBudget = vi.fn().mockResolvedValue()
  const wrapper = mountWithBase(TripOverviewView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper }
}

describe('TripOverviewView', () => {
  it('shows hero, status stepper, stat cards, and next actions', async () => {
    const { wrapper } = await mountView({
      readiness: {
        decisions: { dates_confirmed: 1, destination_decided: 0, budget_drafted: 0, itinerary_days: 0 },
        participants: [{ profile_confirmed: 0 }],
        checklists: { total_items: 2, done_items: 1, overdue: [] }
      }
    })
    expect(wrapper.text()).toContain('Goa 2026')
    expect(wrapper.findAll('.status-step')).toHaveLength(4)
    expect(wrapper.find('.status-step-current').text()).toBe('planning')
    expect(wrapper.text()).toContain('Decide the destination')
    expect(wrapper.text()).toContain('Readiness')
  })

  it('shows all-set message when nothing is pending', async () => {
    const { wrapper } = await mountView({
      readiness: {
        decisions: { dates_confirmed: 1, destination_decided: 1, budget_drafted: 1, itinerary_days: 2 },
        participants: [{ profile_confirmed: 1 }],
        checklists: { total_items: 2, done_items: 2, overdue: [] }
      }
    })
    expect(wrapper.text()).toContain('All set')
  })
})
