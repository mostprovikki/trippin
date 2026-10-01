import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import ConfirmDialog from 'primevue/confirmdialog'
import { mountWithBase } from '../../test-utils.js'
import TripPeopleView from './TripPeopleView.vue'
import { useTripsStore } from '../../stores/trips.js'
import { usePeopleStore } from '../../stores/people.js'
import { useReadinessStore } from '../../stores/readiness.js'
import QRCode from 'qrcode'

const copySpy = vi.fn()
const resolveSpy = vi.fn()
vi.mock('../../composables/useCopyLink.js', async (orig) => ({ ...(await orig()), useCopyLink: () => ({ copy: copySpy, resolve: resolveSpy }) }))

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ZmFrZQ==') } }))

const ok = { profile_confirmed: 1, doc_warnings: [], missing_fields: [], missing_docs: [] }

async function mountView({
  participants = [{ person_id: 'p1', name: 'Asha' }],
  readinessParticipants = [{ ...ok, person_id: 'p1', name: 'Asha' }],
  readinessTrip = 't1'
} = {}) {
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
  trips.current = { id: 't1', name: 'Goa 2026', participants }
  const readiness = useReadinessStore()
  readiness.data = { participants: readinessParticipants }
  readiness.lastTripId = readinessTrip
  readiness.fetch = vi.fn().mockResolvedValue()
  trips.fetchLinks = vi.fn().mockResolvedValue()
  people.fetchPeople = vi.fn().mockResolvedValue()
  const wrapper = mountWithBase(TripPeopleView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, trips, readiness }
}

describe('TripPeopleView', () => {
  afterEach(() => {
    copySpy.mockReset()
    resolveSpy.mockReset()
    document.body.innerHTML = ''
    // Undo the getter-only override below so it doesn't leak into other
    // test files' navigator — deleting the own property restores happy-dom's
    // prototype accessor.
    delete navigator.clipboard
  })

  it('lists participants with actions', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('h1').text()).toBe('People')
    expect(wrapper.text()).toContain('Asha')
    expect(wrapper.text()).toContain("Copy Asha's link")
  })

  // §6 one number, one place (trip-planner-27f.2)
  it("tags exactly the Overview's Missing people, with its reason; complete people untagged", async () => {
    const { wrapper } = await mountView({
      participants: [{ person_id: 'a', name: 'Asha' }, { person_id: 'm', name: 'Meena' }],
      readinessParticipants: [{ ...ok, person_id: 'a', name: 'Asha' }, { ...ok, person_id: 'm', name: 'Meena', missing_fields: ['dietary'] }]
    })
    const rows = wrapper.findAll('.participant-card')
    expect(rows[0].find('[data-missing]').exists()).toBe(false)
    expect(rows[1].find('[data-missing]').text()).toBe('Missing')
    expect(rows[1].find('.participant-reason').text()).toBe('No dietary preference')
  })

  it('drops the link-state and profile-unconfirmed tags', async () => {
    const { wrapper } = await mountView({ readinessParticipants: [{ ...ok, person_id: 'p1', name: 'Asha', profile_confirmed: 0 }] })
    expect(wrapper.text()).not.toMatch(/link active|no link|profile unconfirmed/)
    expect(wrapper.find('[data-missing]').exists()).toBe(true)
  })

  it('ignores readiness held for another trip', async () => {
    const { wrapper } = await mountView({ readinessTrip: 't2', readinessParticipants: [{ ...ok, person_id: 'p1', name: 'Asha', missing_fields: ['phone'] }] })
    expect(wrapper.find('[data-missing]').exists()).toBe(false)
  })

  // ⋯ menus teleport to <body>: open the row's menu, click the item.
  async function pick(wrapper, name, label) {
    await wrapper.find(`[aria-label="More actions for ${name}"]`).trigger('click')
    await flushPromises()
    const item = [...document.body.querySelectorAll('.p-menu-item')].find((el) => el.textContent.trim() === label)
    if (!item) throw new Error(`no "${label}" in ${name}'s menu`)
    item.querySelector('.p-menu-item-content').click()
    await flushPromises()
  }
  const button = (wrapper, text) => wrapper.findAll('button').find((b) => b.text() === text)

  it("one click copies the person's link through useCopyLink, never minting here", async () => {
    const { wrapper, trips } = await mountView()
    trips.createLink = vi.fn()
    copySpy.mockResolvedValue('http://x/p/T')
    await button(wrapper, "Copy Asha's link").trigger('click')
    expect(copySpy).toHaveBeenCalledWith('t1', 'p1', 'Asha', { hasActiveLink: false })
    expect(trips.createLink).not.toHaveBeenCalled()
  })

  it('passes hasActiveLink from the link list', async () => {
    const { wrapper, trips } = await mountView()
    trips.links = [{ id: 'l1', person_id: 'p1', created_at: '2026-01-01', revoked_at: null }]
    await wrapper.vm.$nextTick()
    await button(wrapper, "Copy Asha's link").trigger('click')
    expect(copySpy).toHaveBeenCalledWith('t1', 'p1', 'Asha', { hasActiveLink: true })
  })

  it('at rest a row has Copy and ⋯ only — no Replace, Create or Remove buttons', async () => {
    const { wrapper } = await mountView()
    const labels = wrapper.findAll('.participant-actions button').map((b) => b.text() || b.attributes('aria-label'))
    expect(labels).toEqual(["Copy Asha's link", 'More actions for Asha'])
  })

  it('Replace link (⋯) copies with replace:true, then refreshes links and readiness', async () => {
    const { wrapper, trips, readiness } = await mountView()
    trips.links = [{ id: 'l1', person_id: 'p1', created_at: '2026-01-01', revoked_at: null }]
    await wrapper.vm.$nextTick()
    copySpy.mockResolvedValue('http://x/p/NEW')
    trips.fetchLinks.mockClear()
    await pick(wrapper, 'Asha', 'Replace link')
    expect(copySpy).toHaveBeenCalledWith('t1', 'p1', 'Asha', { hasActiveLink: true, replace: true })
    expect(trips.fetchLinks).toHaveBeenCalledWith('t1')
    expect(readiness.fetch).toHaveBeenCalledWith('t1')
  })

  // Replace decides "ask first?" from a fresh link list, not the one loaded with
  // the page: here the link was revoked elsewhere meanwhile, so nothing to ask.
  it('Replace re-reads the link list before deciding whether to ask', async () => {
    const { wrapper, trips } = await mountView()
    trips.links = [{ id: 'l1', person_id: 'p1', created_at: '2026-01-01', revoked_at: null }]
    await wrapper.vm.$nextTick()
    trips.fetchLinks.mockImplementation(async () => { trips.links = [{ id: 'l1', person_id: 'p1', created_at: '2026-01-01', revoked_at: '2026-01-02' }] })
    copySpy.mockResolvedValue(null)
    await pick(wrapper, 'Asha', 'Replace link')
    expect(copySpy).toHaveBeenCalledWith('t1', 'p1', 'Asha', { hasActiveLink: false, replace: true })
  })

  // review #2: a Copy that minted must update the list, or a later Replace
  // would think there is nothing to revoke and skip the question (D1)
  it('a minting Copy refreshes the link list', async () => {
    const { wrapper, trips } = await mountView()
    trips.fetchLinks.mockClear()
    copySpy.mockResolvedValue('http://x/p/T')
    await button(wrapper, "Copy Asha's link").trigger('click')
    await flushPromises()
    expect(trips.fetchLinks).toHaveBeenCalledWith('t1')
  })

  // review #5
  it('no Replace link in the menu without an active link', async () => {
    const { wrapper } = await mountView()
    await wrapper.find('[aria-label="More actions for Asha"]').trigger('click')
    await flushPromises()
    const items = [...document.body.querySelectorAll('.p-menu-item')].map((el) => el.textContent.trim())
    expect(items).toEqual(['Copy message', 'Show QR code', 'Remove from trip'])
  })

  it('Replace link cancelled refreshes nothing else', async () => {
    const { wrapper, trips, readiness } = await mountView()
    trips.links = [{ id: 'l1', person_id: 'p1', created_at: '2026-01-01', revoked_at: null }]
    await wrapper.vm.$nextTick()
    copySpy.mockResolvedValue(null)
    trips.fetchLinks.mockClear()
    await pick(wrapper, 'Asha', 'Replace link')
    expect(trips.fetchLinks).toHaveBeenCalledTimes(1) // the pre-read only
    expect(readiness.fetch).not.toHaveBeenCalled()
  })

  it('Copy message composes the trip line and the link, dates via formatDayDate', async () => {
    const { wrapper, trips } = await mountView()
    trips.current = { ...trips.current, start_date: '2026-11-06', end_date: '2026-11-15' }
    copySpy.mockResolvedValue('http://x/p/T')
    await pick(wrapper, 'Asha', 'Copy message')
    const opts = copySpy.mock.calls[0][3]
    expect(opts.hasActiveLink).toBe(false)
    expect(opts.compose('http://x/p/T')).toBe("You're in for Goa 2026! 🎒 Fri 6 Nov – Sun 15 Nov. Tap to confirm your details: http://x/p/T")
  })

  it('Copy message: "from <date>" with only a start date; "the trip" with no name', async () => {
    const { wrapper, trips } = await mountView()
    trips.current = { ...trips.current, name: null, start_date: '2026-11-06' }
    await pick(wrapper, 'Asha', 'Copy message')
    const text = copySpy.mock.calls[0][3].compose('U')
    expect(text).toContain("You're in for the trip!")
    expect(text).toContain('from Fri 6 Nov')
  })

  it('Show QR code renders the QR of the resolved link under the row; Close hides it', async () => {
    const { wrapper } = await mountView()
    resolveSpy.mockResolvedValue('http://x/p/T')
    await pick(wrapper, 'Asha', 'Show QR code')
    expect(resolveSpy).toHaveBeenCalledWith('t1', 'p1', 'Asha', { hasActiveLink: false })
    expect(QRCode.toDataURL).toHaveBeenCalledWith('http://x/p/T')
    // happy-dom's selector parser chokes on the apostrophe, so read alt directly
    const img = wrapper.find('.link-qr img')
    expect(img.attributes('alt')).toBe("QR code for Asha's link")
    expect(img.attributes('src')).toBe('data:image/png;base64,ZmFrZQ==')
    await button(wrapper, 'Close').trigger('click')
    expect(wrapper.find('.link-qr').exists()).toBe(false)
  })

  it('Show QR code: nothing resolved, no QR; QR failure shows no image', async () => {
    const { wrapper } = await mountView()
    resolveSpy.mockResolvedValue(null)
    await pick(wrapper, 'Asha', 'Show QR code')
    expect(wrapper.find('.link-qr').exists()).toBe(false)
    resolveSpy.mockResolvedValue('http://x/p/T')
    QRCode.toDataURL.mockRejectedValueOnce(new Error('boom'))
    await pick(wrapper, 'Asha', 'Show QR code')
    expect(wrapper.find('.link-qr').exists()).toBe(false)
  })

  it('Remove from trip (⋯) confirms, removes, refreshes readiness', async () => {
    const { wrapper, trips, readiness } = await mountView()
    trips.removeParticipant = vi.fn().mockResolvedValue()
    const dialog = mountWithBase(ConfirmDialog, { attachTo: document.body })
    await pick(wrapper, 'Asha', 'Remove from trip')
    expect(document.body.textContent).toContain('Remove Asha from this trip?')
    expect(trips.removeParticipant).not.toHaveBeenCalled()
    ;[...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Remove').click()
    await flushPromises()
    expect(trips.removeParticipant).toHaveBeenCalledWith('t1', 'p1')
    expect(readiness.fetch).toHaveBeenCalledWith('t1')
    dialog.unmount()
  })

  it('no "invite" anywhere: text, aria-labels, alt', async () => {
    const { wrapper } = await mountView()
    resolveSpy.mockResolvedValue('http://x/p/T')
    await pick(wrapper, 'Asha', 'Show QR code')
    const attrs = [...wrapper.element.querySelectorAll('*')].flatMap((el) => [el.getAttribute('aria-label'), el.getAttribute('alt')]).filter(Boolean)
    expect([wrapper.text(), ...attrs].join(' ')).not.toMatch(/invite/i)
  })

  it('keeps link history collapsed by default, behind a History (N) toggle', async () => {
    const { wrapper, trips } = await mountView()
    trips.links = [
      { id: 'l1', person_id: 'p1', created_at: '2026-01-01', revoked_at: '2026-01-02' },
      { id: 'l2', person_id: 'p1', created_at: '2026-01-03', revoked_at: null }
    ]
    await wrapper.vm.$nextTick()
    const toggle = wrapper.findAll('button').find((b) => b.text().includes('History (2)'))
    expect(toggle).toBeTruthy()
    expect(wrapper.find('.links-list').exists()).toBe(false)
  })

  it('reveals the link history rows when the History toggle is clicked', async () => {
    const { wrapper, trips } = await mountView()
    trips.links = [
      { id: 'l1', person_id: 'p1', created_at: '2026-01-01', revoked_at: '2026-01-02' },
      { id: 'l2', person_id: 'p1', created_at: '2026-01-03', revoked_at: null }
    ]
    await wrapper.vm.$nextTick()
    const toggle = wrapper.findAll('button').find((b) => b.text().includes('History (2)'))
    await toggle.trigger('click')
    const list = wrapper.find('.links-list')
    expect(list.exists()).toBe(true)
    expect(list.text()).toContain('created 2026-01-01')
    expect(list.text()).toContain('revoked')
    expect(list.text()).toContain('created 2026-01-03')
  })
})
