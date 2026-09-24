import { describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import DestinationPanel from './DestinationPanel.vue'

// Own file (not DestinationPanel.test.js): useAiStatus caches its fetch at
// module scope for the life of one test file's module graph, so this needs an
// isolated file to control what that one fetch resolves to before mounting —
// DestinationPanel.test.js's own tests never touch AI state and would race
// this one for the same cache otherwise.
describe('DestinationPanel AI gating (trip-planner-oa7)', () => {
  it('disables Suggest with AI, with an explanatory title, when /api/ai/status reports disabled', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ enabled: false, provider: 'none' }), { status: 200 }))
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mountWithBase(DestinationPanel, { pinia, props: { tripId: 't1', candidates: [] } })
    await vi.waitFor(() => {
      const btn = wrapper.findAll('button').find((b) => b.text().includes('Suggest with AI'))
      expect(btn.attributes('disabled')).not.toBeUndefined()
    })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('Suggest with AI'))
    expect(btn.attributes('title')).toBe('AI is not configured on this server (set LLM_PROVIDER)')
    delete global.fetch
  })
})
