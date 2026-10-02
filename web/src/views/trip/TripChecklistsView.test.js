import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripChecklistsView from './TripChecklistsView.vue'
import { useChecklistsStore } from '../../stores/checklists.js'
import { api } from '../../api/client.js'

async function mountView(checklists = []) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/checklists', name: 'trip-checklists', component: TripChecklistsView }]
  })
  await router.push('/trips/t1/checklists')
  await router.isReady()
  vi.spyOn(api, 'get').mockResolvedValue({ trip: { participants: [] } })
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useChecklistsStore()
  store.fetchForTrip = vi.fn(async () => { store.checklists = checklists; store.lastTripId = 't1' })
  store.fetchTemplates = vi.fn(async () => { store.templates = [{ id: 'tp1', name: 'Beach' }] })
  store.createChecklist = vi.fn().mockResolvedValue()
  const wrapper = mountWithBase(TripChecklistsView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, store }
}

beforeEach(() => { vi.restoreAllMocks() })

// tripper.md §5 one primary at rest, §4 lists first on a phone (trip-planner-jjp).
describe('TripChecklistsView', () => {
  it('at rest shows one "New checklist" button and no create form above the lists', async () => {
    const { wrapper } = await mountView([{ id: 'c1', name: 'Bags', kind: 'packing', items: [] }])
    const btn = wrapper.find('[data-test="new-checklist"]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('#checklist-name').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Template"]').exists()).toBe(false)
  })

  it('New checklist opens Create + From template; a create closes it again', async () => {
    const { wrapper, store } = await mountView()
    await wrapper.find('[data-test="new-checklist"]').trigger('click')
    expect(wrapper.find('[data-test="new-checklist"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('[aria-label="Template"]').exists()).toBe(true)
    await wrapper.find('#checklist-name').setValue('Bags')
    await wrapper.find('form.new-checklist-form').trigger('submit')
    await flushPromises()
    expect(store.createChecklist).toHaveBeenCalledWith({ kind: 'packing', name: 'Bags', trip_id: 't1' })
    expect(wrapper.find('#checklist-name').exists()).toBe(false)
  })
})
