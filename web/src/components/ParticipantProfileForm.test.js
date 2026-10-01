import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useParticipantStore } from '../stores/participant.js'
import { mountWithBase } from '../test-utils.js'
import ParticipantProfileForm from './ParticipantProfileForm.vue'

// trip-planner-hmu: every <label for> pointing at a PrimeVue Select must
// target the Select's focusable combobox (a span/input with role="combobox",
// ref="focusInput") and — since that target is not a native "labelable"
// element — PrimeVue only moves focus there on a label click if the Select
// was given `labelId` (not just `inputId`): `labelId` is what
// bindLabelClickListener() uses (node_modules/primevue/select/index.mjs,
// ~L759-778) to find `label[for="…"]` on mount and wire up a click handler
// that calls focus() on the combobox. `inputId` alone sets the same `id`
// attribute (render's `id: labelId || inputId`, ~L1104/L1138) but never
// wires that handler, so a label click silently does nothing.
//
// happy-dom never implements `offsetParent` (always undefined on every
// element — verified directly: no descriptor anywhere on the prototype
// chain), which PrimeVue's own isVisible() reads to decide whether to bind
// the click listener. Left alone that makes bindLabelClickListener() a no-op
// for every element in every test, masking the real bug behind an unrelated
// environment gap. Shimming offsetParent to a real value only for this file
// (restored after) lets the assertion exercise PrimeVue's actual click-delegate
// path instead of a false negative.
let restoreOffsetParent
beforeAll(() => {
  const had = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() { return this.isConnected ? document.body : null }
  })
  restoreOffsetParent = () => {
    delete HTMLElement.prototype.offsetParent
    if (had) Object.defineProperty(HTMLElement.prototype, 'offsetParent', had)
  }
})
afterAll(() => restoreOffsetParent())

describe('ParticipantProfileForm label/Select wiring', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  const pairs = [
    ['pf-dietary', 'Dietary'],
    ['pf-pace', 'Preferred pace'],
    ['pf-budget', 'Budget band']
  ]

  it.each(pairs)('label for="%s" targets the focusable combobox and focuses it on click', async (id) => {
    const wrapper = mountWithBase(ParticipantProfileForm, { attachTo: document.body })

    const target = document.getElementById(id)
    expect(target, `#${id} should exist in the DOM`).toBeTruthy()
    expect(target.getAttribute('role')).toBe('combobox')

    const labelEl = wrapper.find(`label[for="${id}"]`)
    expect(labelEl.exists()).toBe(true)

    labelEl.element.click()
    await wrapper.vm.$nextTick()

    expect(document.activeElement).toBe(target)

    wrapper.unmount()
  })
})

// trip-planner-4hi: tripper.md §6/§9 D2 — phone, emergency contact, dietary
// are required; Save must never say "confirmed" while one is blank.
describe('ParticipantProfileForm required fields', () => {
  afterEach(() => { document.body.innerHTML = '' })

  function mountWith(saveResult) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useParticipantStore()
    store.saveProfile = vi.fn().mockImplementation(async () => Object.assign(store, saveResult))
    const wrapper = mountWithBase(ParticipantProfileForm, { pinia, attachTo: document.body })
    return { wrapper, store }
  }

  it('marks exactly the three required fields', () => {
    const { wrapper } = mountWith({})
    const marked = wrapper.findAll('label').filter((l) => l.find('.pf-req').exists()).map((l) => l.attributes('for'))
    expect(marked).toEqual(['pf-phone', 'pf-emergency', 'pf-dietary'])
    for (const id of ['pf-phone', 'pf-emergency', 'pf-dietary'])
      expect(document.getElementById(id).getAttribute('aria-required'), id).toBe('true')
    expect(document.getElementById('pf-email').getAttribute('aria-required')).not.toBe('true')
    wrapper.unmount()
  })

  it('Save with a required field blank says what is still needed, not confirmed', async () => {
    const { wrapper } = mountWith({ profileConfirmed: false, missingFields: ['emergency_contact', 'dietary'] })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Saved. Still needed: Emergency contact, Dietary')
    expect(wrapper.text()).not.toContain('Profile confirmed')
    wrapper.unmount()
  })

  it('Save with every required field set says confirmed', async () => {
    const { wrapper } = mountWith({ profileConfirmed: true, missingFields: [] })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Profile confirmed ✓')
    expect(wrapper.text()).not.toContain('Still needed')
    wrapper.unmount()
  })
})
