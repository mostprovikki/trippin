import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import PeopleListView from './PeopleListView.vue'
import { usePeopleStore } from '../stores/people.js'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/people', component: PeopleListView },
      { path: '/trips/new', component: { template: '<div>wizard</div>' } },
      { path: '/people/:id', name: 'person', component: { template: '<div>person</div>' } }
    ]
  })
}

async function mountAt(url) {
  const router = makeRouter()
  await router.push(url)
  await router.isReady()
  // Stub BEFORE mount — onMounted fires during mount.
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = usePeopleStore()
  store.fetchPeople = vi.fn().mockResolvedValue()
  const wrapper = mountWithBase(PeopleListView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router, store }
}

beforeEach(() => { localStorage.clear() })

describe('PeopleListView', () => {
  it('opens create form when query.new=1', async () => {
    const { wrapper } = await mountAt('/people?new=1')
    expect(wrapper.find('#pf-name').exists()).toBe(true)
  })

  it('routes back to query.return after successful create', async () => {
    const { wrapper, router, store } = await mountAt('/people?new=1&return=%2Ftrips%2Fnew%3Fstep%3D4')
    store.createPerson = vi.fn().mockResolvedValue({ id: 'p1', name: 'Ada' })
    await wrapper.find('#pf-name').setValue('Ada')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/trips/new?step=4')
  })

  it('ignores absolute-URL return values', async () => {
    const { wrapper, router, store } = await mountAt('/people?new=1&return=https%3A%2F%2Fevil.example')
    store.createPerson = vi.fn().mockResolvedValue({ id: 'p1', name: 'Ada' })
    await wrapper.find('#pf-name').setValue('Ada')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('person')
  })
})
