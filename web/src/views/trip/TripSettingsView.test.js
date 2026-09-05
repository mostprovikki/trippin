import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import ConfirmDialog from 'primevue/confirmdialog'
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
  it('renders basics form seeded from trip and a read-only status (advance moved to the sidebar)', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('h1').text()).toBe('Settings')
    expect(wrapper.find('#ts-name').element.value).toBe('Goa 2026')
    expect(wrapper.findAll('button').some((b) => b.text().match(/Advance|Confirm trip|Activate|Start planning/))).toBe(false)
    expect(wrapper.text()).not.toContain('Confirm trip')
    expect(wrapper.text()).toContain('quick action in the sidebar')
  })

  it('restores unsaved basics draft after remount (same key as before)', async () => {
    localStorage.setItem('tripper:draft:trip:t1:basics', JSON.stringify({ name: 'Edited name', description: '', origin_city: '', vibe_tags: '' }))
    const { wrapper } = await mountView()
    expect(wrapper.find('#ts-name').element.value).toBe('Edited name')
  })

  it('shows Unarchive in the archived state and calls the store action on confirm', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/trips/:id/settings', name: 'trip-settings', component: TripSettingsView }]
    })
    await router.push('/trips/t1/settings')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const trips = useTripsStore()
    trips.current = { id: 't1', name: 'Goa 2026', status: 'archived', description: '', origin_city: '', vibe_tags: [] }
    trips.fetchTrip = vi.fn().mockResolvedValue(trips.current)
    const archive = useArchiveStore()
    archive.fetchArchive = vi.fn().mockImplementation(async () => {
      archive.snapshot = { budget: { lines: [] }, itinerary: [], checklists: [] }
      archive.archived_at = '2026-01-01 00:00:00'
    })
    archive.unarchive = vi.fn().mockResolvedValue({ id: 't1', status: 'active' })
    const wrapper = mountWithBase(TripSettingsView, { pinia, global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('Unarchive trip')
    // App.vue owns the global ConfirmDialog — mount it alongside so
    // confirm.require()'s dialog actually renders, same pattern as
    // TripPeopleView.test.js's "keeps an aria-label on Remove" test.
    const dialogWrapper = mountWithBase(ConfirmDialog, { attachTo: document.body })
    await wrapper.find('button.unarchive-btn').trigger('click')
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('Unarchive trip')
    const acceptBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Unarchive')
    acceptBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(archive.unarchive).toHaveBeenCalledWith('t1')
    dialogWrapper.unmount()
  })
})
