import { describe, it, expect } from 'vitest'
import { mountWithBase } from '../test-utils.js'
import DateWindowsEditor from './DateWindowsEditor.vue'

describe('DateWindowsEditor', () => {
  it('shows the default empty-state copy when dates are not confirmed', () => {
    const wrapper = mountWithBase(DateWindowsEditor, { props: { windows: [] } })
    expect(wrapper.text()).toContain('No date windows yet — add one to propose dates.')
    expect(wrapper.text()).not.toContain('Dates are locked above')
  })

  it('shows confirmed-aware empty-state copy when the trip dates are locked', () => {
    const wrapper = mountWithBase(DateWindowsEditor, { props: { windows: [], confirmed: true } })
    expect(wrapper.text()).toContain('Dates are locked above — no proposed windows. Add one only if plans might change.')
    expect(wrapper.text()).not.toContain('add one to propose dates')
  })

  it('does not show empty-state copy when windows exist', () => {
    const wrapper = mountWithBase(DateWindowsEditor, {
      props: { windows: [{ start_date: '2026-08-01', end_date: '2026-08-05' }], confirmed: true }
    })
    expect(wrapper.text()).not.toContain('Dates are locked above')
    expect(wrapper.text()).not.toContain('No date windows yet')
  })
})
