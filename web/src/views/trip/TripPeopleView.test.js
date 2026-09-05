import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import ConfirmDialog from 'primevue/confirmdialog'
import { mountWithBase } from '../../test-utils.js'
import TripPeopleView from './TripPeopleView.vue'
import { useTripsStore } from '../../stores/trips.js'
import { usePeopleStore } from '../../stores/people.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/people', name: 'trip-people', component: TripPeopleView }]
  })
  await router.push('/trips/t1/people')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const trips = useTripsStore()
  const people = usePeopleStore()
  trips.current = { id: 't1', name: 'Goa 2026', participants: [{ person_id: 'p1', name: 'Asha' }] }
  trips.fetchLinks = vi.fn().mockResolvedValue()
  people.fetchPeople = vi.fn().mockResolvedValue()
  const wrapper = mountWithBase(TripPeopleView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, trips }
}

describe('TripPeopleView', () => {
  it('lists participants with actions', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('h1').text()).toBe('People')
    expect(wrapper.text()).toContain('Asha')
    expect(wrapper.text()).toContain('Create link')
  })

  it('keeps an aria-label on Remove and actually confirms before removing', async () => {
    const { wrapper, trips } = await mountView()
    trips.removeParticipant = vi.fn().mockResolvedValue()
    const removeBtn = wrapper.find('[aria-label="Remove Asha"]')
    expect(removeBtn.exists()).toBe(true)
    // TripPeopleView renders no <ConfirmDialog/> of its own (App.vue owns the
    // global one) — mount it alongside so confirm.require()'s dialog actually
    // renders, same pattern as DayCard.test.js.
    const dialogWrapper = mountWithBase(ConfirmDialog, { attachTo: document.body })
    await removeBtn.trigger('click')
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('Remove this participant?')
    const acceptBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Remove')
    acceptBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(trips.removeParticipant).toHaveBeenCalledWith('t1', 'p1')
    dialogWrapper.unmount()
  })
})
