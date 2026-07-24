import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripSettingsView from './TripSettingsView.vue'
import { useTripsStore } from '../../stores/trips.js'
import { useArchiveStore } from '../../stores/archive.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/settings', name: 'trip-settings', component: TripSettingsView }]
  })
  await router.push('/trips/t1/settings')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const trips = useTripsStore()
  trips.current = { id: 't1', name: 'Goa 2026', status: 'planning', description: '', origin_city: '', vibe_tags: [] }
  const archive = useArchiveStore()
  archive.fetchArchive = vi.fn().mockRejectedValue(Object.assign(new Error('not archived'), { code: 'NOT_ARCHIVED' }))
  const wrapper = mountWithBase(TripSettingsView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, trips }
}

beforeEach(() => { localStorage.clear() })

describe('TripSettingsView', () => {
  it('renders basics form seeded from trip and status control', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('h1').text()).toBe('Settings')
    expect(wrapper.find('#ts-name').element.value).toBe('Goa 2026')
    expect(wrapper.text()).toContain('Confirm trip')
  })

  it('restores unsaved basics draft after remount (same key as before)', async () => {
    localStorage.setItem('tripper:draft:trip:t1:basics', JSON.stringify({ name: 'Edited name', description: '', origin_city: '', vibe_tags: '' }))
    const { wrapper } = await mountView()
    expect(wrapper.find('#ts-name').element.value).toBe('Edited name')
  })
})
