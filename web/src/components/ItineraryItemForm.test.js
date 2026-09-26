import { describe, it, expect } from 'vitest'
import { mountWithBase } from '../test-utils.js'
import ItineraryItemForm from './ItineraryItemForm.vue'

// Minimal getByLabelText: find the <label> with this exact text, read its
// `for`, and return the element with that id — mirrors what
// @testing-library/vue's getByLabelText checks, without adding the dependency.
function getByLabelText(wrapper, text) {
  const label = wrapper.findAll('label').find((l) => l.text() === text)
  expect(label, `no <label> with text "${text}"`).toBeTruthy()
  const forId = label.attributes('for')
  expect(forId, `<label>${text}</label> has no "for"`).toBeTruthy()
  const el = wrapper.find(`#${forId}`)
  expect(el.exists(), `no element with id "${forId}" for label "${text}"`).toBe(true)
  return el
}

describe('ItineraryItemForm', () => {
  it('focuses Title on mount', () => {
    const wrapper = mountWithBase(ItineraryItemForm, { attachTo: document.body })
    const title = getByLabelText(wrapper, 'Title')
    expect(document.activeElement).toBe(title.element)
    wrapper.unmount()
  })

  it('resolves each labelled field by its label text', () => {
    const wrapper = mountWithBase(ItineraryItemForm, { attachTo: document.body })
    for (const text of ['Title', 'Time', 'Location', 'Category', 'Cost', 'Notes', 'Link']) {
      getByLabelText(wrapper, text)
    }
    wrapper.unmount()
  })

  it('emits cancel on Esc anywhere inside the form', async () => {
    const wrapper = mountWithBase(ItineraryItemForm, { attachTo: document.body })
    await wrapper.find('form').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted().cancel).toBeTruthy()
    wrapper.unmount()
  })

  it('shows capitalised category labels but keeps lowercase stored values', async () => {
    const wrapper = mountWithBase(ItineraryItemForm, { attachTo: document.body })
    const select = wrapper.findComponent({ name: 'Select' })
    const opts = select.props('options')
    const label = (o) => o[select.props('optionLabel')]
    const value = (o) => o[select.props('optionValue')]
    expect(opts.map(label)).toEqual(['Travel', 'Food', 'Activity', 'Rest', 'Logistics'])
    expect(opts.map(value)).toEqual(['travel', 'food', 'activity', 'rest', 'logistics'])
    expect(wrapper.find('.p-select-label').text()).toBe('Activity')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted().submit[0][0].category).toBe('activity')
    wrapper.unmount()
  })
})
