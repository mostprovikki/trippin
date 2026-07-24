import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../../test-utils.js'
import TripBudgetView from './TripBudgetView.vue'
import { useBudgetStore } from '../../stores/budget.js'
import { api } from '../../api/client.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/budget', name: 'trip-budget', component: TripBudgetView }]
  })
  await router.push('/trips/t1/budget')
  await router.isReady()
  // Stub BEFORE mount — the view's onMounted fires during mount.
  vi.spyOn(api, 'get').mockResolvedValue({ trip: { name: 'Goa 2026', participants: [] } })
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useBudgetStore()
  store.fetchBudget = vi.fn().mockResolvedValue()
  const wrapper = mountWithBase(TripBudgetView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, store }
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('TripBudgetView', () => {
  it('restores unsaved line edits after remount', async () => {
    localStorage.setItem('tripper:draft:trip:t1:budget-lines', JSON.stringify({ lines: [{ category: 'stay', amount: 500 }] }))
    const { wrapper } = await mountView()
    expect(wrapper.findComponent({ name: 'BudgetTable' }).props('modelValue')).toEqual([{ category: 'stay', amount: 500 }])
  })

  it('shows section header', async () => {
    const { wrapper } = await mountView()
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('Budget')
  })
})
