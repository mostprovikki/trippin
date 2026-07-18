import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('llm adapter', () => {
  beforeEach(() => vi.resetModules())
  async function withProvider(provider) {
    process.env.LLM_PROVIDER = provider
    return await import('../src/llm/index.js')
  }
  it('throws LlmDisabledError when provider=none', async () => {
    const llm = await withProvider('none')
    expect(llm.isEnabled()).toBe(false)
    await expect(llm.generate({ prompt: 'x', schema: { type: 'object' } })).rejects.toThrow(/disabled/i)
  })
  it('mock driver returns queued object validated against schema', async () => {
    const llm = await withProvider('mock')
    const { queueMock } = await import('../src/llm/drivers/mock.js')
    queueMock({ answer: 42 })
    const out = await llm.generate({ prompt: 'x', schema: { type: 'object', required: ['answer'], properties: { answer: { type: 'number' } } } })
    expect(out).toEqual({ answer: 42 })
  })
  it('retries once on schema violation then throws LlmValidationError', async () => {
    const llm = await withProvider('mock')
    const { queueMock } = await import('../src/llm/drivers/mock.js')
    queueMock({ wrong: true }); queueMock({ wrong: 'again' })
    await expect(llm.generate({ prompt: 'x', schema: { type: 'object', required: ['answer'], properties: { answer: { type: 'number' } } } }))
      .rejects.toThrow(/validation/i)
  })
  it('extracts JSON from fenced/wrapped text', async () => {
    const llm = await withProvider('mock')
    const { queueMockRaw } = await import('../src/llm/drivers/mock.js')
    queueMockRaw('Here you go:\n```json\n{"answer": 1}\n```')
    const out = await llm.generate({ prompt: 'x', schema: { type: 'object', required: ['answer'] } })
    expect(out.answer).toBe(1)
  })
})
