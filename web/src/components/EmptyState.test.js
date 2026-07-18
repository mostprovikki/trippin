import { describe, it, expect } from 'vitest'
import { mountWithBase } from '../test-utils.js'
import EmptyState from './EmptyState.vue'

describe('EmptyState', () => {
  it('renders message, no button without ctaLabel', () => {
    const w = mountWithBase(EmptyState, { props: { message: 'Nothing here' } })
    expect(w.text()).toContain('Nothing here')
    expect(w.find('button').exists()).toBe(false)
  })
  it('renders CTA and emits cta on click', async () => {
    const w = mountWithBase(EmptyState, { props: { message: 'Nothing', ctaLabel: 'Create' } })
    await w.find('button').trigger('click')
    expect(w.emitted('cta')).toHaveLength(1)
  })
})
