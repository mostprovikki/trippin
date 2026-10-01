import { describe, it, expect } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithBase } from '../../test-utils.js'
import { cardRouter } from './cardTestRouter.js'
import TodayCard from './TodayCard.vue'
import QuickRefCard from './QuickRefCard.vue'
import TomorrowCard from './TomorrowCard.vue'
import BeforeTomorrowCard from './BeforeTomorrowCard.vue'

const mount = async (C, props, opts = {}) => mountWithBase(C, { props, global: { plugins: [await cardRouter()] }, ...opts })

describe('TodayCard (tripper.md §2 during, §1 job 5)', () => {
  const items = [
    { id: 'a', title: 'Breakfast', time_range: '08:00–09:00', location: 'Hotel' },
    { id: 'b', title: 'Taxi to Ba Na Hills', time_range: '10:30', location: 'Ba Na Hills, Da Nang', booking_ref: 'CT-4471' },
    { id: 'c', title: 'Dinner', time_range: '19:00' }
  ]
  it('done rows dimmed and labelled, the next row marked with timing, ref and Map', async () => {
    const w = await mount(TodayCard, { dayIso: '2026-11-10', items, nowMinutes: 600 })
    expect(w.find('h2').text()).toBe('Today · Tue 10 Nov')
    const rows = w.findAll('li')
    expect(rows[0].classes()).toContain('is-done')
    expect(rows[0].text()).toContain('Done')
    expect(rows[1].classes()).toContain('is-next')
    expect(rows[1].text()).toContain('Next · in 30 min')
    expect(rows[1].text()).toContain('ref CT-4471')
    const map = rows[1].find('a.map-link')
    expect(map.attributes('href')).toBe('https://www.google.com/maps/search/?api=1&query=Ba%20Na%20Hills%2C%20Da%20Nang')
    expect(map.attributes('target')).toBe('_blank')
    expect(rows[2].classes()).not.toContain('is-done')
  })
  it('an hour or more reads in h and min', async () => {
    const w = await mount(TodayCard, { dayIso: '2026-11-10', items, nowMinutes: 550 })
    expect(w.find('.is-next').text()).toContain('Next · in 1 h 20 min')
  })
  it('starting now', async () => {
    const w = await mount(TodayCard, { dayIso: '2026-11-10', items, nowMinutes: 630 })
    expect(w.find('.is-next').text()).toContain('Next · now')
  })
  it('empty day', async () => {
    const w = await mount(TodayCard, { dayIso: '2026-11-10', items: [], nowMinutes: 600 })
    expect(w.text()).toContain('Nothing planned today — open the itinerary to add something')
    expect(w.find('a').attributes('href')).toBe('/trips/t1/itinerary')
  })
})

describe('QuickRefCard', () => {
  const stay = { id: 's', title: 'Anantara Hoi An Resort', location: '1 Pham Hong Thai, Hoi An', booking_ref: 'ANT-4471', phone: '+84 235 3914 555', category: 'stay' }
  it("tonight's stay with ref, Call and Map; today's phone items; emergency numbers", async () => {
    const w = await mount(QuickRefCard, {
      stay,
      todayItems: [{ id: 'g', title: 'Guide: Minh', phone: '+84 90 111 2222' }, { id: 'x', title: 'No phone' }],
      emergencyInfo: 'Police 113\nAmbulance 115'
    })
    expect(w.find('h2').text()).toBe('Quick reference')
    expect(w.text()).toContain('Tonight: Anantara Hoi An Resort')
    expect(w.text()).toContain('ref ANT-4471')
    const tels = w.findAll('a[href^="tel:"]').map((a) => [a.text(), a.attributes('href')])
    expect(tels).toEqual([['Call', 'tel:+842353914555'], ['Call Guide: Minh', 'tel:+84901112222']])
    expect(w.find('a.map-link').attributes('href')).toContain('query=1%20Pham%20Hong%20Thai')
    expect(w.find('.quickref-emergency').text()).toBe('Police 113\nAmbulance 115')
    expect(w.text()).not.toContain('No phone')
  })
  it('nothing recorded: points at the Itinerary', async () => {
    const w = await mount(QuickRefCard, { stay: null, todayItems: [], emergencyInfo: null })
    expect(w.text()).toContain('Add a stay in the Itinerary to see it here.')
  })
})

describe('TomorrowCard', () => {
  it('first three items by start time, with refs', async () => {
    const items = [
      { id: '4', title: 'Late', time_range: '21:00' },
      { id: '1', title: 'Leave for Da Nang airport', time_range: '08:30' },
      { id: '2', title: 'Fly Da Nang → Saigon · VJ 623', time_range: '11:40', booking_ref: 'VJ-623-XK' },
      { id: '3', title: 'Hotel check-in', time_range: '15:00' }
    ]
    const w = await mount(TomorrowCard, { dayIso: '2026-11-11', items, isLastDay: false })
    expect(w.find('h2').text()).toBe('Tomorrow · Wed 11 Nov')
    const rows = w.findAll('li')
    expect(rows.map((r) => r.find('.today-time').text())).toEqual(['08:30', '11:40', '15:00'])
    expect(rows[1].text()).toContain('ref VJ-623-XK')
  })
  it('last day of the trip', async () => {
    const w = await mount(TomorrowCard, { dayIso: null, items: [], isLastDay: true })
    expect(w.text()).toContain('Last day — no plan for tomorrow.')
  })
  it('nothing planned tomorrow', async () => {
    const w = await mount(TomorrowCard, { dayIso: '2026-11-11', items: [], isLastDay: false })
    expect(w.text()).toContain('Nothing planned for tomorrow yet.')
  })
})

describe('BeforeTomorrowCard (§2: checkable in place)', () => {
  const lists = () => [{ kind: 'tasks', items: [
    { id: 'o', title: 'Print e-visas', assignee_person_id: 'p', assignee_name: 'Priya', due_date: '2026-11-09', done: 0 },
    { id: 't', title: 'Confirm taxis', assignee_person_id: null, due_date: '2026-11-11', done: 0 },
    { id: 'l', title: 'Later', due_date: '2026-11-20', done: 0 }
  ] }]
  it('N open; ticking emits the item, keeps the row, its focus and its enabled state, and the count drops', async () => {
    const checklists = lists()
    const w = await mount(BeforeTomorrowCard, { checklists, tomorrowIso: '2026-11-11' }, { attachTo: document.body })
    expect(w.find('h2').text()).toBe('Before tomorrow · 2 open')
    expect(w.findAll('li')).toHaveLength(2)
    const box = w.find('li input[type="checkbox"]')
    box.element.focus()
    await box.setValue(true)
    await flushPromises()
    expect(w.emitted().toggle[0][0].id).toBe('o')
    expect(w.emitted().toggle[0][1]).toBe(true)
    // parent applies the store update; simulate it
    checklists[0].items[0].done = 1
    await w.setProps({ checklists: [...checklists] })
    await flushPromises()
    expect(w.findAll('li')).toHaveLength(2)
    expect(w.find('h2').text()).toBe('Before tomorrow · 1 open')
    expect(document.activeElement).toBe(w.find('li input[type="checkbox"]').element)
    expect(w.find('li input[type="checkbox"]').element.disabled).toBe(false)
    w.unmount()
  })
  it('nothing due', async () => {
    const w = await mount(BeforeTomorrowCard, { checklists: [], tomorrowIso: '2026-11-11' })
    expect(w.find('h2').text()).toBe('Before tomorrow · 0 open')
    expect(w.text()).toContain('Nothing due before tomorrow.')
  })
})
