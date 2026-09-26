import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripDestinationView from './TripDestinationView.vue'
import { useTripsStore } from '../../stores/trips.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/destination', name: 'trip-destination', component: TripDestinationView }]
  })
  await router.push('/trips/t1/destination')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useTripsStore()
  store.current = { id: 't1', name: 'Goa 2026', goals: [{ id: 'g1', title: 'Sunburn festival' }] }
  store.candidates = []
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
