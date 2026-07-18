import { describe, it, expect, vi } from 'vitest'

const add = vi.fn()
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add }) }))

import { useNotify } from './useNotify.js'

describe('useNotify', () => {
  it('success → severity success, life 3000', () => {
    useNotify().success('Saved')
    expect(add).toHaveBeenCalledWith({ severity: 'success', summary: 'Done', detail: 'Saved', life: 3000 })
  })
  it('error → severity error, life 6000, custom summary', () => {
    useNotify().error('Boom', 'Save failed')
    expect(add).toHaveBeenCalledWith({ severity: 'error', summary: 'Save failed', detail: 'Boom', life: 6000 })
  })
})
