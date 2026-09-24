import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
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
