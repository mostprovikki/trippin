import { describe, it, expect, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import { useParticipantStore } from '../stores/participant.js'
import { missingDocTypes } from '../utils/requiredDocs.js'
import ParticipantDocs from './ParticipantDocs.vue'

function mountWith(state) {
  const pinia = createPinia()
  setActivePinia(pinia)
  Object.assign(useParticipantStore(), state)
  return mountWithBase(ParticipantDocs, { pinia, attachTo: document.body })
}
afterEach(() => { document.body.innerHTML = '' })

describe('missingDocTypes', () => {
  it('ignores expiry: an expired passport still counts as present', () => {
    expect(missingDocTypes(['passport', 'visa'], [{ doc_type: 'passport', expiry_date: '2000-01-01' }])).toEqual(['visa'])
  })
  it('no required types → nothing missing', () => {
    expect(missingDocTypes([], [])).toEqual([])
    expect(missingDocTypes(undefined, undefined)).toEqual([])
  })
})

describe('ParticipantDocs (trip-planner-0qh)', () => {
  // pin, not a new behaviour: DateField typeable already sets inputmode
  // (owner 2026-10-02: the typed mask is the accepted "date input")
  it('expiry brings up the number pad on a phone', () => {
    const w = mountWith({ trip: { required_doc_types: [] }, documents: [] })
    expect(document.getElementById('doc-expiry').getAttribute('inputmode')).toBe('numeric')
    w.unmount()
  })
  it('rows show labels and readable dates, not stored keys and ISO', () => {
    const w = mountWith({ trip: { required_doc_types: [] }, documents: [{ id: 'd1', doc_type: 'national_id', expiry_date: '2030-04-30', original_name: 'id.pdf' }] })
    expect(w.find('td[data-label="Type"]').text()).toBe('National ID')
    expect(w.find('td[data-label="Expiry"]').text()).toBe('30 Apr 2030')
    w.unmount()
  })
  it('type defaults to the first required type still missing', () => {
    const w = mountWith({ trip: { required_doc_types: ['passport', 'visa'] }, documents: [{ id: 'd1', doc_type: 'passport', original_name: 'p.pdf' }] })
    expect(w.find('#doc-type').text()).toContain('Visa')
    w.unmount()
  })
  it('Upload is disabled while the typed expiry is not a date (h3i.3)', async () => {
    const w = mountWith({ trip: { required_doc_types: [] }, documents: [] })
    const upload = () => w.find('button[type="submit"]').element
    expect(upload().disabled).toBe(false)
    const mask = w.findComponent({ name: 'InputMask' })
    mask.vm.$emit('update:modelValue', '3/10/2027')
    mask.vm.$emit('blur')
    await w.vm.$nextTick()
    expect(upload().disabled).toBe(true)
    mask.vm.$emit('update:modelValue', '2027-03-10')
    await w.vm.$nextTick()
    expect(upload().disabled).toBe(false)
    w.unmount()
  })
  it('no card inside the step card', () => {
    const w = mountWith({ trip: { required_doc_types: [] }, documents: [] })
    expect(w.find('.card').exists()).toBe(false)
    w.unmount()
  })
})
