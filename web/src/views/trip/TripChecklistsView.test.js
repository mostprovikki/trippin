import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripChecklistsView from './TripChecklistsView.vue'
import { useChecklistsStore } from '../../stores/checklists.js'
import { useTripsStore } from '../../stores/trips.js'
import { api } from '../../api/client.js'

async function mountView(checklists = [], status = 'planning') {
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
  useTripsStore().current = { id: 't1', name: 'Goa', status }
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

  // tripper.md §2 Archived (D11): the server refuses every write, so offer none.
  const TASKS = [{ id: 'c1', name: 'Jobs', kind: 'tasks', items: [{ id: 'i1', title: 'Visa', done: 0, assignee_person_id: null, due_date: '2026-08-01' }] }]
  function editControls(wrapper) {
    return {
      newChecklist: wrapper.find('[data-test="new-checklist"]').exists(),
      more: wrapper.find('[aria-label="More Jobs actions"]').exists(),
      del: wrapper.find('[aria-label="Delete Visa"]').exists(),
      add: wrapper.find('form.checklist-add').exists(),
      assignee: wrapper.find('[aria-label="Assignee"]').exists(),
      tickEnabled: !wrapper.find('#cl-item-i1').element.disabled
    }
  }
  it('archived trip shows no add or delete controls', async () => {
    const { wrapper } = await mountView(TASKS, 'archived')
    expect(editControls(wrapper)).toEqual({ newChecklist: false, more: false, del: false, add: false, assignee: false, tickEnabled: false })
    expect(wrapper.text()).toContain('Visa')
    expect(wrapper.text()).toContain('Unassigned')
  })
  it('live trip keeps its add and delete controls', async () => {
    const { wrapper } = await mountView(TASKS)
    expect(editControls(wrapper)).toEqual({ newChecklist: true, more: true, del: true, add: true, assignee: true, tickEnabled: true })
  })
})
