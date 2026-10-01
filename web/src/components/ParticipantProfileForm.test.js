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
    expect(marked).toEqual(['pf-phone', 'pf-emergency'])
    // dietary is a radio group now (trip-planner-0qh): its marker is on the legend
    expect(wrapper.find('#pf-dietary legend .pf-req').exists()).toBe(true)
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

// trip-planner-0qh: tripper.md §3/§8 — Google-Forms simple on a phone.
describe('ParticipantProfileForm phone layout (trip-planner-0qh)', () => {
  afterEach(() => { document.body.innerHTML = '' })

  function mountWith(saveResult, person) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useParticipantStore()
    if (person) store.person = person
    store.saveProfile = vi.fn().mockImplementation(async () => Object.assign(store, saveResult))
    const wrapper = mountWithBase(ParticipantProfileForm, { pinia, attachTo: document.body })
    return { wrapper, store }
  }

  it('required questions come before the optional fold, which is closed at rest', () => {
    const { wrapper } = mountWith({})
    const more = wrapper.find('details.pf-more')
    expect(more.exists()).toBe(true)
    expect(more.element.open).toBe(false)
    const ids = wrapper.findAll('input[id]:not([type="radio"]), textarea[id], [role="combobox"][id], fieldset[id]').map((e) => e.attributes('id'))
    const outside = ids.filter((id) => !more.element.querySelector(`#${id}`))
    expect(outside).toEqual(['pf-name', 'pf-phone', 'pf-emergency', 'pf-dietary'])
    for (const id of ['pf-email', 'pf-allergies', 'pf-medical', 'pf-pace', 'pf-interests', 'pf-budget', 'pf-city'])
      expect(more.element.querySelector(`#${id}`), id).toBeTruthy()
    wrapper.unmount()
  })

  it('dietary is one tap: three radios that set the value', async () => {
    const { wrapper, store } = mountWith({ profileConfirmed: true, missingFields: [] })
    const radios = wrapper.findAll('#pf-dietary input[type="radio"]')
    expect(radios).toHaveLength(3)
    await radios[1].setValue(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(store.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ dietary: 'non_veg' }))
    wrapper.unmount()
  })

  it('fold summary counts filled optional answers for a returning participant', () => {
    const { wrapper } = mountWith({}, { name: 'Asha', email: 'a@x.in', allergies: 'nuts', interests: ['food'] })
    expect(wrapper.find('details.pf-more summary').text()).toContain('3 filled')
    wrapper.unmount()
  })

  it('phone is a tel input, name stays natively required, no card inside the step card', () => {
    const { wrapper } = mountWith({})
    expect(document.getElementById('pf-phone').getAttribute('type')).toBe('tel')
    expect(document.getElementById('pf-name').hasAttribute('required')).toBe(true)
    expect(wrapper.find('.card').exists()).toBe(false)
    wrapper.unmount()
  })
})
