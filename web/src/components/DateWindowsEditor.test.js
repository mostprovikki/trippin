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

  // tripper.md §5 D8: a Save shows only when there is something to save.
  const saveBtn = (w) => w.findAll('button').find((b) => b.text().includes('Save windows'))

  it('hides Save windows at rest, with or without windows', () => {
    expect(saveBtn(mountWithBase(DateWindowsEditor, { props: { windows: [], confirmed: true } }))).toBeUndefined()
    expect(saveBtn(mountWithBase(DateWindowsEditor, {
      props: { windows: [{ start_date: '2026-08-01', end_date: '2026-08-05' }] }
    }))).toBeUndefined()
  })

  it('shows Save windows after an edit and hides it again when the edit is undone or saved', async () => {
    const windows = [{ start_date: '2026-08-01', end_date: '2026-08-05', note: '' }]
    const wrapper = mountWithBase(DateWindowsEditor, { props: { windows } })
    await wrapper.find('#dwe-note-0').setValue('beach')
    expect(saveBtn(wrapper)).toBeDefined()
    await wrapper.find('#dwe-note-0').setValue('')
    expect(saveBtn(wrapper)).toBeUndefined()

    await wrapper.findAll('button').find((b) => b.text().includes('Add date window')).trigger('click')
    expect(saveBtn(wrapper)).toBeDefined()
    await saveBtn(wrapper).trigger('click')
    const saved = wrapper.emitted('save')[0][0]
    expect(saved).toHaveLength(2)
    await wrapper.setProps({ windows: saved })
    expect(saveBtn(wrapper)).toBeUndefined()
  })

  it('shows Save windows after removing a saved window', async () => {
    const wrapper = mountWithBase(DateWindowsEditor, {
      props: { windows: [{ start_date: '2026-08-01', end_date: '2026-08-05' }] }
    })
    await wrapper.findAll('button').find((b) => b.text().includes('Remove')).trigger('click')
    expect(saveBtn(wrapper)).toBeDefined()
  })
})
