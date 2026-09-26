import { describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mountWithBase } from '../test-utils.js'
import DestinationPanel from './DestinationPanel.vue'

// Own file (not DestinationPanel.test.js): useAiStatus caches its fetch at
// module scope for the life of one test file's module graph, so this needs an
// isolated file to control what that one fetch resolves to before mounting —
// DestinationPanel.test.js's own tests never touch AI state and would race
// this one for the same cache otherwise.
describe('DestinationPanel AI gating (trip-planner-oa7)', () => {
  it('disables Suggest with AI (reason in its ⋯ label) but keeps Draft with your own AI… enabled when AI is off', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ enabled: false, provider: 'none' }), { status: 200 }))
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mountWithBase(DestinationPanel, { pinia, props: { tripId: 't1', candidates: [] }, attachTo: document.body })
    await flushPromises()
    await wrapper.find('[aria-label="More destination actions"]').trigger('click')
    await flushPromises()
    const items = [...document.body.querySelectorAll('.p-menu-item')]
    const provider = items.find((el) => el.textContent.includes('Suggest with AI'))
    expect(provider.textContent).toContain('AI not configured')
    expect(provider.classList.contains('p-disabled') || provider.getAttribute('aria-disabled') === 'true').toBe(true)
    const own = items.find((el) => el.textContent.includes('Draft with your own AI…'))
    expect(own.classList.contains('p-disabled') || own.getAttribute('aria-disabled') === 'true').toBe(false)
    wrapper.unmount()
    delete global.fetch
  })
})
