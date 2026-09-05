import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import ConfirmDialog from 'primevue/confirmdialog'
import { mountWithBase } from '../../test-utils.js'
import TripPeopleView from './TripPeopleView.vue'
import { useTripsStore } from '../../stores/trips.js'
import { usePeopleStore } from '../../stores/people.js'
import QRCode from 'qrcode'

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ZmFrZQ==') } }))

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
  afterEach(() => {
    // Undo the getter-only override below so it doesn't leak into other
    // test files' navigator — deleting the own property restores happy-dom's
    // prototype accessor.
    delete navigator.clipboard
  })

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

  it('reveals a copyable invite message and a QR code alongside a newly created link', async () => {
    const { wrapper, trips } = await mountView()
    trips.createLink = vi.fn().mockResolvedValue({ url: '/p/tok123' })
    await wrapper.findAll('button').find((b) => b.text().includes('Create link')).trigger('click')
    await flushPromises()
    const textarea = wrapper.find('textarea')
    expect(textarea.exists()).toBe(true)
    expect(textarea.element.value).toContain('Goa 2026')
    expect(textarea.element.value).toContain('/p/tok123')
    const img = wrapper.find('img[alt="QR code for invite link"]')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('data:image/png;base64,ZmFrZQ==')
  })

  it('copies the invite message via clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue()
    // navigator.clipboard is a getter-only accessor in happy-dom (mirrors real
    // browsers) — Object.assign can't set it; defineProperty can.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true })
    const { wrapper, trips } = await mountView()
    trips.createLink = vi.fn().mockResolvedValue({ url: '/p/tok123' })
    await wrapper.findAll('button').find((b) => b.text().includes('Create link')).trigger('click')
    await flushPromises()
    const copyMsgBtn = wrapper.findAll('button').find((b) => b.text().includes('Copy message'))
    await copyMsgBtn.trigger('click')
    expect(writeText).toHaveBeenCalled()
    expect(writeText.mock.calls[0][0]).toContain('Goa 2026')
  })

  it('still reveals the link and refreshes link status when QR generation fails', async () => {
    QRCode.toDataURL.mockRejectedValueOnce(new Error('boom'))
    const { wrapper, trips } = await mountView()
    trips.createLink = vi.fn().mockResolvedValue({ url: '/p/tok123' })
    await wrapper.findAll('button').find((b) => b.text().includes('Create link')).trigger('click')
    await flushPromises()
    expect(wrapper.find('img[alt="QR code for invite link"]').exists()).toBe(false)
    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('code').text()).toContain('/p/tok123')
    // fetchLinks runs before QR generation, so a QR failure doesn't skip it
    expect(trips.fetchLinks).toHaveBeenCalledTimes(2) // once on mount, once after createLink
  })

  it('formats the invite message dates with formatDayDate, not raw ISO', async () => {
    const { wrapper, trips } = await mountView()
    trips.current = { ...trips.current, start_date: '2026-11-06', end_date: '2026-11-15' }
    trips.createLink = vi.fn().mockResolvedValue({ url: '/p/tok123' })
    await wrapper.findAll('button').find((b) => b.text().includes('Create link')).trigger('click')
    await flushPromises()
    expect(wrapper.find('textarea').element.value).toContain('Fri 6 Nov – Sun 15 Nov')
  })

  it('says "from <date>" in the invite message when only a start date is known', async () => {
    const { wrapper, trips } = await mountView()
    trips.current = { ...trips.current, start_date: '2026-11-06' }
    trips.createLink = vi.fn().mockResolvedValue({ url: '/p/tok123' })
    await wrapper.findAll('button').find((b) => b.text().includes('Create link')).trigger('click')
    await flushPromises()
    expect(wrapper.find('textarea').element.value).toContain('from Fri 6 Nov')
  })

  it('falls back to "the trip" in the invite message when the trip has no name', async () => {
    const { wrapper, trips } = await mountView()
    trips.current = { ...trips.current, name: null }
    trips.createLink = vi.fn().mockResolvedValue({ url: '/p/tok123' })
    await wrapper.findAll('button').find((b) => b.text().includes('Create link')).trigger('click')
    await flushPromises()
    expect(wrapper.find('textarea').element.value).toContain('You\'re in for the trip!')
  })
})
