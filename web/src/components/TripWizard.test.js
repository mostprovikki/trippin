import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import TripWizard from './TripWizard.vue'
import { usePeopleStore } from '../stores/people.js'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/trips/new', component: { template: '<div/>' } },
      { path: '/people', component: { template: '<div/>' } },
      { path: '/trips/:id', name: 'trip', component: { template: '<div/>' } }
    ]
  })
}

async function mountWizard(url = '/trips/new') {
  const router = makeRouter()
  await router.push(url)
  await router.isReady()
  // Stub BEFORE mount — onMounted fires during mount.
  const pinia = createPinia()
  setActivePinia(pinia)
  const people = usePeopleStore()
  people.fetchPeople = vi.fn().mockResolvedValue()
  const wrapper = mountWithBase(TripWizard, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => { localStorage.clear() })

describe('TripWizard', () => {
  it('cannot advance past Basics without a name', async () => {
    const { wrapper } = await mountWizard()
    await wrapper.find('[data-test="wizard-next"]').trigger('click')
    expect(wrapper.text()).toContain('Name is required')
    expect(wrapper.find('#w-name').exists()).toBe(true) // still on step 1
  })

  it('restores step + fields from URL + storage after remount', async () => {
    localStorage.setItem('tripper:draft:trip-new', JSON.stringify({
      name: 'Goa', description: '', origin_city: '', vibe_tags: 'beach',
      date_mode: 'broad', start_date: '', end_date: '', flex_days: '',
      destination_mode: 'open', destination: '', participant_ids: [], windows: []
    }))
    const { wrapper } = await mountWizard('/trips/new?step=4')
    expect(wrapper.text()).toContain('Select participants')
    expect(wrapper.find('[data-test="add-person-link"]').attributes('href'))
      .toContain('/people?new=1&return=')
  })

  it('rejects end date before start date on step 2', async () => {
    localStorage.setItem('tripper:draft:trip-new', JSON.stringify({
      name: 'X', description: '', origin_city: '', vibe_tags: '',
      date_mode: 'confirmed', start_date: '2026-08-10', end_date: '2026-08-01',
      flex_days: '', destination_mode: 'open', destination: '', participant_ids: [], windows: []
    }))
    const { wrapper } = await mountWizard('/trips/new?step=2')
    await wrapper.find('[data-test="wizard-next"]').trigger('click')
    expect(wrapper.text()).toContain('End date must be on or after start date')
  })
})
