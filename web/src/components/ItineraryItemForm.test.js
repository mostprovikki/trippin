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
    for (const text of ['Title', 'Time', 'Location', 'Category', 'Cost', 'Notes', 'Link', 'Booking ref', 'Phone']) {
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
    expect(opts.map(label)).toEqual(['Travel', 'Food', 'Activity', 'Rest', 'Logistics', 'Stay'])
    expect(opts.map(value)).toEqual(['travel', 'food', 'activity', 'rest', 'logistics', 'stay'])
    expect(wrapper.find('.p-select-label').text()).toBe('Activity')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted().submit[0][0].category).toBe('activity')
    wrapper.unmount()
  })

  // Quick reference on the during-trip Overview reads these (tripper.md §2, D4)
  it('loads and submits booking ref + phone, blank as null', async () => {
    const wrapper = mountWithBase(ItineraryItemForm, { attachTo: document.body, props: { item: { title: 'Taxi', booking_ref: 'CT-4471', phone: '' } } })
    expect(getByLabelText(wrapper, 'Booking ref').element.value).toBe('CT-4471')
    await getByLabelText(wrapper, 'Phone').setValue('+84 90 111')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted().submit[0][0]).toMatchObject({ booking_ref: 'CT-4471', phone: '+84 90 111' })
    await getByLabelText(wrapper, 'Booking ref').setValue('')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted().submit[1][0].booking_ref).toBe(null)
    wrapper.unmount()
  })

  it('Esc from inside the new fields still cancels', async () => {
    const wrapper = mountWithBase(ItineraryItemForm, { attachTo: document.body })
    await getByLabelText(wrapper, 'Booking ref').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted().cancel).toBeTruthy()
    wrapper.unmount()
  })

  // trip-planner-h3i.11: the row shows ₹57,000, so the edit field groups digits
  // the same way — but what gets submitted is still a plain number.
  it('groups cost digits in the input and submits a number', async () => {
    const wrapper = mountWithBase(ItineraryItemForm, { attachTo: document.body, props: { item: { title: 'Stay', est_cost: 57000 } } })
    expect(getByLabelText(wrapper, 'Cost').element.value).toBe('57,000')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted().submit[0][0].est_cost).toBe(57000)
    wrapper.unmount()
  })

  it('submits a typed cost before blur, and blank as null', async () => {
    const wrapper = mountWithBase(ItineraryItemForm, { attachTo: document.body })
    const cost = wrapper.findComponent({ name: 'InputNumber' })
    cost.vm.$emit('input', { value: 1250 })
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted().submit[0][0].est_cost).toBe(1250)
    cost.vm.$emit('input', { value: null })
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted().submit[1][0].est_cost).toBeNull()
    wrapper.unmount()
  })
})
