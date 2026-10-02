import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import ConfirmDialog from 'primevue/confirmdialog'
import MultiSelect from 'primevue/multiselect'
import { mountWithBase } from '../../test-utils.js'
import TripSettingsView from './TripSettingsView.vue'
import { useTripsStore } from '../../stores/trips.js'
import { useArchiveStore } from '../../stores/archive.js'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/trips/:id/settings', name: 'trip-settings', component: TripSettingsView }]
  })
  await router.push('/trips/t1/settings')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const trips = useTripsStore()
  trips.current = { id: 't1', name: 'Goa 2026', status: 'planning', description: '', origin_city: '', vibe_tags: [] }
  const archive = useArchiveStore()
  archive.fetchArchive = vi.fn().mockRejectedValue(Object.assign(new Error('not archived'), { code: 'NOT_ARCHIVED' }))
  const wrapper = mountWithBase(TripSettingsView, { pinia, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, trips }
}

beforeEach(() => { localStorage.clear() })

describe('TripSettingsView', () => {
  it('required documents save with Basics (tripper.md §6 Missing, §5 one Save per section)', async () => {
    const { wrapper, trips } = await mountView()
    const ms = wrapper.findComponent(MultiSelect)
    expect(ms.exists()).toBe(true)
    expect(wrapper.find('label[for="ts-reqdocs"]').text()).toBe('Documents every participant needs')
    expect(ms.props('modelValue')).toEqual([])
    trips.updateTrip = vi.fn().mockImplementation(async (_id, body) => ({ ...trips.current, ...body }))
    ms.vm.$emit('update:modelValue', ['passport', 'visa'])
    await flushPromises()
    const save = wrapper.findAll('button').find((b) => b.text() === 'Save changes')
    await save.trigger('click')
    await flushPromises()
    expect(trips.updateTrip).toHaveBeenCalledTimes(1)
    expect(trips.updateTrip.mock.calls[0][1].required_doc_types).toEqual(['passport', 'visa'])
  })

  // D9 (2026-10-02): the header keeps only the chip; status changes live here
  it('renders basics form seeded from trip; Status section owns the next-status action', async () => {
    const { wrapper, trips } = await mountView()
    expect(wrapper.find('h1').text()).toBe('Settings')
    expect(wrapper.find('#ts-name').element.value).toBe('Goa 2026')
    expect(wrapper.text()).not.toContain('sidebar')
    trips.setStatus = vi.fn().mockResolvedValue({ ...trips.current, status: 'confirmed' })
    const btn = wrapper.findAll('button').find((b) => b.text() === 'Confirm trip')
    expect(btn).toBeTruthy()
    await btn.trigger('click')
    await flushPromises()
    expect(trips.setStatus).toHaveBeenCalledWith('t1', 'confirmed')
  })

  it('restores unsaved basics draft after remount (same key as before)', async () => {
    localStorage.setItem('tripper:draft:trip:t1:basics', JSON.stringify({ name: 'Edited name', description: '', origin_city: '', vibe_tags: '' }))
    const { wrapper } = await mountView()
    expect(wrapper.find('#ts-name').element.value).toBe('Edited name')
  })

  it('shows Unarchive in the archived state and calls the store action on confirm', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/trips/:id/settings', name: 'trip-settings', component: TripSettingsView }]
    })
    await router.push('/trips/t1/settings')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const trips = useTripsStore()
    trips.current = { id: 't1', name: 'Goa 2026', status: 'archived', description: '', origin_city: '', vibe_tags: [] }
    trips.fetchTrip = vi.fn().mockResolvedValue(trips.current)
    const archive = useArchiveStore()
    archive.fetchArchive = vi.fn().mockImplementation(async () => {
      archive.snapshot = { budget: { lines: [] }, itinerary: [], checklists: [] }
      archive.archived_at = '2026-01-01 00:00:00'
    })
    archive.unarchive = vi.fn().mockResolvedValue({ id: 't1', status: 'active' })
    const wrapper = mountWithBase(TripSettingsView, { pinia, global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('Unarchive trip')
    // App.vue owns the global ConfirmDialog — mount it alongside so
    // confirm.require()'s dialog actually renders, same pattern as
    // TripPeopleView.test.js's "keeps an aria-label on Remove" test.
    const dialogWrapper = mountWithBase(ConfirmDialog, { attachTo: document.body })
    await wrapper.find('button.unarchive-btn').trigger('click')
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('Unarchive trip')
    const acceptBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Unarchive')
    acceptBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(archive.unarchive).toHaveBeenCalledWith('t1')
    dialogWrapper.unmount()
  })

  // trip-planner-k2j: UX review found the archived Actuals section rendering
  // raw category keys ('primary_transport') and bare numbers, bypassing the
  // label()/formatMoney treatment BudgetTable already gives the same data
  // live. Assert the humanized label and a currency-symbol amount instead.
  it('renders archived Actuals rows with a humanized category label and formatMoney amounts', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/trips/:id/settings', name: 'trip-settings', component: TripSettingsView }]
    })
    await router.push('/trips/t1/settings')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const trips = useTripsStore()
    trips.current = { id: 't1', name: 'Goa 2026', status: 'archived', currency: 'THB', description: '', origin_city: '', vibe_tags: [] }
    const archive = useArchiveStore()
    archive.fetchArchive = vi.fn().mockImplementation(async () => {
      archive.snapshot = { budget: { lines: [{ category: 'primary_transport', estimate: 12000 }] }, itinerary: [], checklists: [] }
      archive.actuals = [{ category: 'primary_transport', amount: 15000 }]
      archive.archived_at = '2026-01-01 00:00:00'
    })
    const wrapper = mountWithBase(TripSettingsView, { pinia, global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('Primary Transport')
    expect(wrapper.text()).not.toContain('primary_transport')
    expect(wrapper.text()).toContain('฿12,000')
    expect(wrapper.text()).not.toMatch(/est\. 12000\b/)
  })

  // trip-planner-h3i.11: "Archived at: 2026-09-26 12:08:00" read as a raw
  // server stamp. Midday UTC so the local day is the 26th in any common zone.
  it('shows Archived at as a human date with no time', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/trips/:id/settings', name: 'trip-settings', component: TripSettingsView }]
    })
    await router.push('/trips/t1/settings')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const trips = useTripsStore()
    trips.current = { id: 't1', name: 'Goa 2026', status: 'archived', description: '', origin_city: '', vibe_tags: [] }
    const archive = useArchiveStore()
    archive.fetchArchive = vi.fn().mockImplementation(async () => {
      archive.snapshot = { budget: { lines: [] }, itinerary: [], checklists: [] }
      archive.archived_at = '2026-09-26 12:08:00'
    })
    const wrapper = mountWithBase(TripSettingsView, { pinia, global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('Archived at: 26 Sep 2026')
    expect(wrapper.text()).not.toContain('12:08')
  })

  // trip-planner-1ow, tripper.md §5 (D8): per-card management under the card's ⋯;
  // Save shows only when there is something to save.
  describe('Status card ⋯ (Archive + Clone) and Save-when-dirty', () => {
    const menuLabels = () => [...document.body.querySelectorAll('.p-menu-item')].map((el) => el.textContent.trim())
    async function pick(wrapper, text) {
      await wrapper.find('[aria-label="More actions"]').trigger('click')
      await flushPromises()
      ;[...document.body.querySelectorAll('.p-menu-item')].find((el) => el.textContent.includes(text)).querySelector('.p-menu-item-content').click()
      await flushPromises()
    }
    async function mountArchived() {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/trips/:id/settings', name: 'trip-settings', component: TripSettingsView }]
      })
      await router.push('/trips/t1/settings')
      await router.isReady()
      const pinia = createPinia()
      setActivePinia(pinia)
      const trips = useTripsStore()
      trips.current = { id: 't1', name: 'Goa 2026', status: 'archived', description: '', origin_city: '', vibe_tags: [] }
      const archive = useArchiveStore()
      archive.fetchArchive = vi.fn().mockImplementation(async () => {
        archive.snapshot = { budget: { lines: [] }, itinerary: [], checklists: [] }
        archive.archived_at = '2026-01-01 00:00:00'
      })
      const wrapper = mountWithBase(TripSettingsView, { pinia, global: { plugins: [router] }, attachTo: document.body })
      await flushPromises()
      return { wrapper, archive }
    }
    afterEach(() => { document.body.innerHTML = '' })

    it('live trip shows no Archive or Clone card; the Status card has a More actions button', async () => {
      const { wrapper } = await mountView()
      const headings = wrapper.findAll('h2').map((h) => h.text())
      expect(headings).not.toContain('Archive')
      expect(headings).not.toContain('Clone as new trip')
      const status = wrapper.findAll('section.card').find((s) => s.find('h2').text() === 'Status')
      expect(status.find('[aria-label="More actions"]').exists()).toBe(true)
      expect(wrapper.find('#ts-clone').exists()).toBe(false)
    })

    it('⋯ lists Clone and Archive on a live trip; Archive runs the existing confirm', async () => {
      const { wrapper, trips } = await mountView()
      const archive = useArchiveStore()
      archive.archive = vi.fn().mockResolvedValue()
      trips.fetchTrip = vi.fn().mockResolvedValue(trips.current)
      const dialogWrapper = mountWithBase(ConfirmDialog, { attachTo: document.body })
      await wrapper.find('[aria-label="More actions"]').trigger('click')
      await flushPromises()
      expect(menuLabels()).toEqual(['Clone as new trip…', 'Archive trip…'])
      ;[...document.body.querySelectorAll('.p-menu-item')].find((el) => el.textContent.includes('Archive trip…')).querySelector('.p-menu-item-content').click()
      await flushPromises()
      expect(document.body.textContent).toContain('Archive this trip? This will lock editing and revoke all participant links.')
      ;[...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Archive').click()
      await flushPromises()
      expect(archive.archive).toHaveBeenCalledWith('t1', { notes: null, photo_links: [] })
      dialogWrapper.unmount()
    })

    it('Clone opens a dialog with the name field and clones on click', async () => {
      const { wrapper } = await mountView()
      const archive = useArchiveStore()
      archive.clone = vi.fn().mockResolvedValue('t2')
      const router = wrapper.vm.$router
      const push = vi.spyOn(router, 'push').mockResolvedValue()
      await pick(wrapper, 'Clone as new trip…')
      const dialog = document.body.querySelector('.p-dialog')
      expect(dialog).toBeTruthy()
      expect(dialog.textContent).toContain('Copies vibe, origin city, currency')
      const input = dialog.querySelector('#ts-clone')
      expect(dialog.querySelector('label[for="ts-clone"]').textContent).toBe('Name for the new trip')
      const btn = [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Clone trip')
      expect(btn.disabled).toBe(true)
      input.value = 'Goa 2027'
      input.dispatchEvent(new Event('input'))
      await flushPromises()
      expect(btn.disabled).toBe(false)
      btn.click()
      await flushPromises()
      expect(archive.clone).toHaveBeenCalledWith('t1', 'Goa 2027')
      expect(push).toHaveBeenCalledWith({ name: 'trip-overview', params: { id: 't2' } })
    })

    it('archived trip: ⋯ offers Clone but not Archive; no Clone card', async () => {
      const { wrapper } = await mountArchived()
      expect(wrapper.findAll('h2').map((h) => h.text())).not.toContain('Clone as new trip')
      await wrapper.find('[aria-label="More actions"]').trigger('click')
      await flushPromises()
      expect(menuLabels()).toEqual(['Clone as new trip…'])
    })

    it('Basics Save changes is absent when clean and appears once dirty', async () => {
      const { wrapper } = await mountView()
      const save = () => wrapper.findAll('button').find((b) => b.text() === 'Save changes')
      expect(save()).toBeUndefined()
      await wrapper.find('#ts-name').setValue('Goa 2027')
      expect(save()).toBeTruthy()
      expect(save().attributes('disabled')).toBeUndefined()
    })
  })
})

// tripper.md §2 Archived (D11): Basics are read-only; the archive cards stay editable.
describe('TripSettingsView — archived trip is read-only', () => {
  async function mountStatus(status) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/trips/:id/settings', name: 'trip-settings', component: TripSettingsView }]
    })
    await router.push('/trips/t1/settings')
    await router.isReady()
    const pinia = createPinia()
    setActivePinia(pinia)
    const trips = useTripsStore()
    trips.current = { id: 't1', name: 'Goa 2026', status, description: 'Beach week', origin_city: 'Chennai', vibe_tags: ['beach'], required_doc_types: ['passport'] }
    const archive = useArchiveStore()
    archive.fetchArchive = status === 'archived'
      ? vi.fn().mockImplementation(async () => {
        archive.snapshot = { budget: { lines: [{ category: 'stay', estimate: 100 }] }, itinerary: [], checklists: [] }
        archive.archived_at = '2026-01-01 00:00:00'
        archive.actuals = []
      })
      : vi.fn().mockRejectedValue(Object.assign(new Error('not archived'), { code: 'NOT_ARCHIVED' }))
    const wrapper = mountWithBase(TripSettingsView, { pinia, global: { plugins: [router] } })
    await flushPromises()
    const labels = wrapper.findAll('button').map((b) => b.text())
    return {
      wrapper,
      controls: {
        basicsInputs: wrapper.find('#ts-name').exists() || wrapper.find('#ts-desc').exists() || wrapper.find('#ts-origin').exists(),
        saveChanges: labels.includes('Save changes'),
        archiveCards: labels.includes('Save notes & links') && labels.includes('Save actuals') && labels.includes('Unarchive trip')
      }
    }
  }
  it('archived trip shows Basics as text with no Save changes, and keeps notes, actuals and Unarchive', async () => {
    const { wrapper, controls } = await mountStatus('archived')
    expect(controls).toEqual({ basicsInputs: false, saveChanges: false, archiveCards: true })
    const basics = wrapper.find('[data-test="basics-readonly"]').text()
    expect(basics).toContain('Goa 2026')
    expect(basics).toContain('Chennai')
    expect(wrapper.find('#ts-notes').exists()).toBe(true)
  })
  it('live trip keeps its Basics form', async () => {
    const { controls } = await mountStatus('planning')
    // Save changes stays hidden until an edit (D8, trip-planner-1ow); the form itself is there.
    expect(controls).toEqual({ basicsInputs: true, saveChanges: false, archiveCards: false })
  })
})
