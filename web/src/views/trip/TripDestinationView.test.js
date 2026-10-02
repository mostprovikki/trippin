import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripDestinationView from './TripDestinationView.vue'
import { useTripsStore } from '../../stores/trips.js'

async function mountView(status = 'planning') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/destination', name: 'trip-destination', component: TripDestinationView }]
  })
  await router.push('/trips/t1/destination')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useTripsStore()
  store.current = { id: 't1', name: 'Goa 2026', status, goals: [{ id: 'g1', title: 'Sunburn festival' }], emergency_info: 'Police 100' }
  store.candidates = [{ id: 'c1', name: 'Hampi', source: 'manual', decided: 0 }]
  store.fetchCandidates = vi.fn().mockResolvedValue([])
  store.addGoal = vi.fn().mockResolvedValue({})
  store.deleteGoal = vi.fn().mockResolvedValue({})
  const wrapper = mountWithBase(TripDestinationView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, store }
}

// Goals no longer has a tab (docs/design/tripper.md §5); it is edited here.
describe('TripDestinationView — Goals folded in', () => {
  it('renders the trip goals in a Goals section under Destination', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('h1').text()).toBe('Destination')
    expect(wrapper.find('#trip-goals-heading').text()).toBe('Goals')
    expect(wrapper.findComponent({ name: 'GoalsEditor' }).props('goals')).toEqual([{ id: 'g1', title: 'Sunburn festival' }])
  })

  it('adds and deletes goals through the trips store for this trip', async () => {
    const { wrapper, store } = await mountView()
    const editor = wrapper.findComponent({ name: 'GoalsEditor' })
    editor.vm.$emit('add', { title: 'Beach day' })
    editor.vm.$emit('delete', 'g1')
    await flushPromises()
    expect(store.addGoal).toHaveBeenCalledWith('t1', { title: 'Beach day' })
    expect(store.deleteGoal).toHaveBeenCalledWith('g1')
  })
})

// The during-trip Overview's Quick reference shows these (tripper.md §2; owner D4)
describe('TripDestinationView — local emergency numbers', () => {
  it('seeds from the trip, saves with its own Save, disabled until changed', async () => {
    const { wrapper, store } = await mountView()
    store.updateTrip = vi.fn().mockImplementation(async (_id, body) => ({ ...store.current, ...body }))
    const label = wrapper.findAll('label').find((l) => l.text() === 'Local emergency numbers')
    const ta = wrapper.find(`#${label.attributes('for')}`)
    expect(ta.element.value).toBe('Police 100')
    const save = wrapper.findAll('button').find((b) => b.text() === 'Save emergency numbers')
    expect(save.attributes('disabled')).toBeDefined()
    await ta.setValue('Police 113 · Ambulance 115')
    expect(save.attributes('disabled')).toBeUndefined()
    await save.trigger('click')
    await flushPromises()
    expect(store.updateTrip).toHaveBeenCalledWith('t1', { emergency_info: 'Police 113 · Ambulance 115' })
  })
  it('clearing it saves null', async () => {
    const { wrapper, store } = await mountView()
    store.updateTrip = vi.fn().mockResolvedValue({})
    const label = wrapper.findAll('label').find((l) => l.text() === 'Local emergency numbers')
    await wrapper.find(`#${label.attributes('for')}`).setValue('  ')
    await wrapper.findAll('button').find((b) => b.text() === 'Save emergency numbers').trigger('click')
    await flushPromises()
    expect(store.updateTrip).toHaveBeenCalledWith('t1', { emergency_info: null })
  })
})

// tripper.md §2 Archived (D11): the server refuses every write, so offer none.
describe('TripDestinationView — archived trip is read-only', () => {
  function destinationControls(wrapper) {
    const labels = wrapper.findAll('button').map((b) => b.text())
    return {
      more: wrapper.find('[aria-label="More destination actions"]').exists(),
      decide: labels.includes('Mark decided'),
      delCandidate: wrapper.find('[aria-label="Delete Hampi"]').exists(),
      addCandidate: wrapper.find('form.dest-add-form').exists(),
      editGoal: labels.includes('Edit'),
      delGoal: wrapper.find('[aria-label="Delete Sunburn festival"]').exists(),
      addGoal: wrapper.find('form.goal-add-form').exists(),
      emergencyInput: wrapper.find('#trip-emergency').exists()
    }
  }
  it('archived trip shows candidates, goals and emergency numbers with no edit controls', async () => {
    const { wrapper } = await mountView('archived')
    expect(destinationControls(wrapper)).toEqual({ more: false, decide: false, delCandidate: false, addCandidate: false, editGoal: false, delGoal: false, addGoal: false, emergencyInput: false })
    expect(wrapper.text()).toContain('Hampi')
    expect(wrapper.text()).toContain('Sunburn festival')
    expect(wrapper.find('[data-test="emergency-text"]').text()).toBe('Police 100')
  })
  it('live trip keeps its destination and goal edit controls', async () => {
    const { wrapper } = await mountView()
    expect(destinationControls(wrapper)).toEqual({ more: true, decide: true, delCandidate: true, addCandidate: true, editGoal: true, delGoal: true, addGoal: true, emergencyInput: true })
  })
})
