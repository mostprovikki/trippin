import { describe, it, expect, vi } from 'vitest'
import { mountWithBase } from '../test-utils.js'
import DraftReview from './DraftReview.vue'

describe('DraftReview', () => {
  it('renders the title and default slot, emits apply/discard', async () => {
    const wrapper = mountWithBase(DraftReview, {
      props: { title: 'AI draft' },
      slots: { default: '<p class="draft-body">Body</p>' }
    })
    expect(wrapper.text()).toContain('AI draft')
    expect(wrapper.find('.draft-body').exists()).toBe(true)
    await wrapper.find('[data-test="draft-apply"]').trigger('click')
    await wrapper.find('[data-test="draft-discard"]').trigger('click')
    expect(wrapper.emitted('apply')).toHaveLength(1)
    expect(wrapper.emitted('discard')).toHaveLength(1)
  })

  it('renders the empty slot when given, and disables both buttons while busy', async () => {
    const wrapper = mountWithBase(DraftReview, {
      props: { title: 'AI draft', busy: true },
      slots: { empty: '<p class="draft-empty">Nothing yet</p>' }
    })
    expect(wrapper.find('.draft-empty').exists()).toBe(true)
    expect(wrapper.find('[data-test="draft-apply"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="draft-discard"]').attributes('disabled')).toBeDefined()
  })

  it('shows the error line only when an error prop is given', async () => {
    const withError = mountWithBase(DraftReview, { props: { title: 'AI draft', error: 'boom' } })
    expect(withError.text()).toContain('boom')
    const without = mountWithBase(DraftReview, { props: { title: 'AI draft' } })
    expect(without.find('[data-test="draft-error"]').exists()).toBe(false)
  })
})
