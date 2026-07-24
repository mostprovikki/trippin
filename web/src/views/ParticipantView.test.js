import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import ParticipantView from './ParticipantView.vue'
import { useParticipantStore } from '../stores/participant.js'

async function mountView(state) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/p/:token', name: 'participant', component: ParticipantView }]
  })
  await router.push('/p/tok1')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useParticipantStore()
  store.load = vi.fn().mockImplementation(async () => Object.assign(store, state))
  const wrapper = mountWithBase(ParticipantView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper }
}

describe('ParticipantView', () => {
  it('renders trip hero and three step cards with completion state', async () => {
    const { wrapper } = await mountView({
      trip: { name: 'Goa 2026', status: 'confirmed', destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05', vibe_tags: [], goals: [] },
      person: { name: 'Asha' },
      profileConfirmed: true,
      documents: [],
      packing: [{ id: 'i1', done: 0 }],
      tasks: []
    })
    const steps = wrapper.findAll('.step-card')
    expect(steps).toHaveLength(3)
    expect(steps[0].classes()).toContain('step-done')      // profile confirmed
    expect(steps[1].classes()).not.toContain('step-done')  // no documents
    expect(wrapper.text()).toContain('Goa 2026')
  })
})
