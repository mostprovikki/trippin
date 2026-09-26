import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes } from './router.js'

// Goals folded into Destination and the Readiness tab was cut (docs/design/tripper.md
// §5, owner decisions 2026-09-26). Old links and bookmarks must still land somewhere.
describe('retired trip routes', () => {
  async function landOn(path) {
    const r = createRouter({ history: createMemoryHistory(), routes })
    await r.push(path)
    return r.currentRoute.value
  }

  it('/trips/:id/goals redirects to Destination, same trip', async () => {
    const to = await landOn('/trips/t9/goals')
    expect(to.name).toBe('trip-destination')
    expect(to.params.id).toBe('t9')
  })

  it('/trips/:id/readiness redirects to the Overview, same trip', async () => {
    const to = await landOn('/trips/t9/readiness')
    expect(to.name).toBe('trip-overview')
    expect(to.params.id).toBe('t9')
  })
})
