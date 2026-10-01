import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mountWithBase } from '../../test-utils.js'
import SinceCard from './SinceCard.vue'

async function mountCard(props) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['trip-overview', 'trip-people', 'trip-checklists'].map((name) => ({
      path: name === 'trip-overview' ? '/trips/:id' : `/trips/:id/${name.slice(5)}`, name, component: { template: '<div/>' }
    }))
  })
  await router.push('/trips/t1')
  await router.isReady()
  return mountWithBase(SinceCard, { props, global: { plugins: [router] } })
}

describe('SinceCard', () => {
  it('heading carries the last-seen date; each change links to what it affects', async () => {
    const w = await mountCard({ since: '2026-09-19 08:00:00', events: [
      { id: 'e2', summary: 'Arun ticked Sunscreen', target: 'checklists', created_at: '2026-09-24 10:00:00' },
      { id: 'e1', summary: 'Priya uploaded their visa', target: 'people', created_at: '2026-09-22 10:00:00' }
    ] })
    expect(w.find('h2').text()).toBe('Since you last looked · Sat 19 Sep')
    const links = w.findAll('li a')
    expect(links.map((a) => a.text())).toEqual(['Arun ticked Sunscreen', 'Priya uploaded their visa'])
    expect(links.map((a) => a.attributes('href'))).toEqual(['/trips/t1/checklists', '/trips/t1/people'])
    expect(w.findAll('li')[0].text()).toContain('Thu 24 Sep')
  })
  it('nothing new since the last visit', async () => {
    const w = await mountCard({ since: '2026-09-19 08:00:00', events: [] })
    expect(w.text()).toContain('Nothing new since Sat 19 Sep.')
  })
  it('first visit: no date, explains what will show', async () => {
    const w = await mountCard({ since: null, events: [] })
    expect(w.find('h2').text()).toBe('Since you last looked')
    expect(w.text()).toContain('Changes from participants will show here.')
  })
})
