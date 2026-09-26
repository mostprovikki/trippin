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

describe('standalone prompt variants', () => {
  const trip = {
    name: 'Goa run', destination: 'Goa', origin_city: 'Chennai', currency: 'INR',
    start_date: '2026-12-01', end_date: '2026-12-03', vibe_tags: ['beach', 'food'],
    goals: [{ title: 'Sunset cruise', fixed_date: '2026-12-02' }],
  }
  const goals = [{ title: 'Sunset cruise', fixed_date: '2026-12-02', fixed_place: 'Panaji' }]
  const prefSummary = { diet: ['2 veg'], pace: ['relaxed'], budget_band: ['mid'], top_interests: ['beaches'] }

  const BLOCKS = ['TRIP', 'CONSTRAINTS', 'TASK', 'OUTPUT SHAPE', 'RULES']

  async function kinds() {
    const { buildItineraryPrompt, buildDayRegenPrompt, draftSchema, dayRegenSchema } = await import('../src/llm/prompts/itinerary.js')
    const { buildBudgetPrompt, CATEGORIES } = await import('../src/llm/prompts/budget.js')
    const { buildPackingPrompt, packingSchema } = await import('../src/llm/prompts/packing.js')
    const { buildDestinationPrompt } = await import('../src/llm/prompts/destinations.js')
    const itemEnum = draftSchema.properties.days.items.properties.items.items.properties.category.enum
    return {
      itinerary: { builder: buildItineraryPrompt, args: [trip, goals, '2 veg of 4 total', ['2026-12-01', '2026-12-02', '2026-12-03']], enums: itemEnum, keys: ['"days"', '"day_date"', '"items"'], mustMention: ['NON-NEGOTIABLE: Sunset cruise on 2026-12-02', '2 veg of 4 total'] },
      dayRegen: { builder: buildDayRegenPrompt, args: [trip, { day_date: '2026-12-02' }, [{ title: 'Beach walk', category: 'rest' }], 'more relaxed'], enums: dayRegenSchema.properties.items.items.properties.category.enum, keys: ['"items"', '"title"'], mustMention: ['Beach walk', 'more relaxed', '2026-12-02'] },
      budget: { builder: buildBudgetPrompt, args: [trip, 4], enums: CATEGORIES, keys: ['"lines"', '"estimate"', '"basis"'], mustMention: ['Group size: 4', 'INR'] },
      packing: { builder: buildPackingPrompt, args: [trip, 3, 'Beach bag'], enums: [], keys: ['"items"', '"title"'], mustMention: ['Beach bag', 'December'], schema: packingSchema },
      destinations: { builder: buildDestinationPrompt, args: [trip, 4, prefSummary], enums: [], keys: ['"candidates"', '"name"', '"rationale"'], mustMention: ['Sunset cruise', 'relaxed'] },
    }
  }

  it('standalone packing prompt states the output shape', async () => {
    const { buildPackingPrompt } = await import('../src/llm/prompts/packing.js')
    const out = buildPackingPrompt.standalone(trip, 3, 'Beach bag')
    expect(typeof out).toBe('string')
    expect(out).toContain('"items"')
    expect(out).toContain('Output the JSON object and nothing else')
  })

  it('packing.js exports packingSchema matching the {items:[{title}]} shape', async () => {
    const { packingSchema } = await import('../src/llm/prompts/packing.js')
    expect(packingSchema.required).toEqual(['items'])
    expect(packingSchema.properties.items.items.required).toEqual(['title'])
  })

  for (const kind of ['itinerary', 'dayRegen', 'budget', 'packing', 'destinations']) {
    it(`standalone ${kind} prompt is self-contained, ordered and names every enum value`, async () => {
      const k = (await kinds())[kind]
      expect(typeof k.builder.standalone).toBe('function')
      const out = k.builder.standalone(...k.args)
      expect(typeof out).toBe('string')
      expect(out).not.toMatch(/\{\{|\}\}|undefined|\[object Object\]/)
      expect(out).toContain('Output the JSON object and nothing else')
      // role line first, then the five headed blocks in fixed order
      expect(out.split('\n')[0]).toMatch(/^You are /)
      const idx = BLOCKS.map((h) => out.indexOf(`\n${h}\n`))
      for (const i of idx) expect(i).toBeGreaterThan(0)
      expect([...idx].sort((a, b) => a - b)).toEqual(idx)
      for (const v of k.enums) expect(out).toContain(v)
      for (const key of k.keys) expect(out).toContain(key)
      for (const m of k.mustMention) expect(out).toContain(m)
    })
  }

  it('standalone() leaves the existing builder return shape untouched', async () => {
    const { buildItineraryPrompt } = await import('../src/llm/prompts/itinerary.js')
    const { buildPackingPrompt } = await import('../src/llm/prompts/packing.js')
    const r = buildItineraryPrompt(trip, goals, '', ['2026-12-01'])
    expect(Object.keys(r).sort()).toEqual(['prompt', 'schema', 'system'])
    expect(typeof buildPackingPrompt(trip, 3, 'x')).toBe('string')
  })
})
