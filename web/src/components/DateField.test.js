import { describe, it, expect } from 'vitest'
import { mountWithBase } from '../test-utils.js'
import DateField from './DateField.vue'

describe('DateField', () => {
  it('renders an ISO date, the format used across the app', () => {
    const w = mountWithBase(DateField, { props: { modelValue: '2026-08-10' } })
    expect(w.find('input').element.value).toBe('2026-08-10')
  })

  // Typing is disabled because DatePicker reformats mid-keystroke and drops the
  // caret, turning a typed 2026-11-27 into a silently-saved 2026-11-02.
  it('is picker-only, so a half-typed date cannot be saved as the wrong day', () => {
    const w = mountWithBase(DateField, { props: { modelValue: '' } })
    expect(w.find('input').element.readOnly).toBe(true)
  })

  it('renders empty for a blank or malformed value', () => {
    expect(mountWithBase(DateField, { props: { modelValue: '' } }).find('input').element.value).toBe('')
    expect(mountWithBase(DateField, { props: { modelValue: 'nope' } }).find('input').element.value).toBe('')
  })

  it('emits an ISO date string, not a Date', async () => {
    const w = mountWithBase(DateField, { props: { modelValue: '' } })
    w.findComponent({ name: 'DatePicker' }).vm.$emit('update:modelValue', new Date(2026, 11, 31))
    await w.vm.$nextTick()
    expect(w.emitted('update:modelValue')[0]).toEqual(['2026-12-31'])
  })

  it('emits an empty string when cleared', async () => {
    const w = mountWithBase(DateField, { props: { modelValue: '2026-08-10' } })
    w.findComponent({ name: 'DatePicker' }).vm.$emit('update:modelValue', null)
    await w.vm.$nextTick()
    expect(w.emitted('update:modelValue')[0]).toEqual([''])
  })

  // typeable mode: expiry dates are copied off a passport, so they get a mask
  // instead of the picker. The mask never re-parses under the caret, which is
  // what made DatePicker's own manualInput unsafe.
  describe('typeable', () => {
    const mountTypeable = (modelValue = '') =>
      mountWithBase(DateField, { props: { modelValue, typeable: true, inputId: 'doc-expiry' } })

    it('renders a mask instead of a picker, seeded with the current value', () => {
      const w = mountTypeable('2035-04-30')
      expect(w.findComponent({ name: 'DatePicker' }).exists()).toBe(false)
      expect(w.findComponent({ name: 'InputMask' }).props('modelValue')).toBe('2035-04-30')
    })

    it('is editable — the whole point of this mode', () => {
      expect(mountTypeable().find('input').element.readOnly).toBe(false)
    })

    it('emits only once the typed date is complete', async () => {
      const w = mountTypeable()
      const mask = w.findComponent({ name: 'InputMask' })
      // Unfilled slots come back as the slotChar template, not digits.
      mask.vm.$emit('update:modelValue', '2035-04-3d')
      await w.vm.$nextTick()
      expect(w.emitted('update:modelValue')).toBeUndefined()
      mask.vm.$emit('update:modelValue', '2035-04-30')
      await w.vm.$nextTick()
      expect(w.emitted('update:modelValue')[0]).toEqual(['2035-04-30'])
    })

    it('rejects impossible dates that satisfy the mask, without emitting', async () => {
      for (const bad of ['2026-13-01', '2026-02-31', '2026-00-10', '2026-01-00']) {
        const w = mountTypeable()
        w.findComponent({ name: 'InputMask' }).vm.$emit('update:modelValue', bad)
        await w.vm.$nextTick()
        expect(w.emitted('update:modelValue'), `${bad} must not be emitted`).toBeUndefined()
        expect(w.text()).toContain('Not a real date')
      }
    })

    it('accepts a leap day in a leap year and rejects it otherwise', async () => {
      const leap = mountTypeable()
      leap.findComponent({ name: 'InputMask' }).vm.$emit('update:modelValue', '2028-02-29')
      await leap.vm.$nextTick()
      expect(leap.emitted('update:modelValue')[0]).toEqual(['2028-02-29'])

      const notLeap = mountTypeable()
      notLeap.findComponent({ name: 'InputMask' }).vm.$emit('update:modelValue', '2027-02-29')
      await notLeap.vm.$nextTick()
      expect(notLeap.emitted('update:modelValue')).toBeUndefined()
    })

    it('clears the error once the date is corrected', async () => {
      const w = mountTypeable()
      const mask = w.findComponent({ name: 'InputMask' })
      mask.vm.$emit('update:modelValue', '2026-02-31')
      await w.vm.$nextTick()
      expect(w.text()).toContain('Not a real date')
      mask.vm.$emit('update:modelValue', '2026-02-28')
      await w.vm.$nextTick()
      expect(w.text()).not.toContain('Not a real date')
      expect(w.emitted('update:modelValue')[0]).toEqual(['2026-02-28'])
    })

    it('emits empty when an existing date is wiped', async () => {
      const w = mountTypeable('2035-04-30')
      w.findComponent({ name: 'InputMask' }).vm.$emit('update:modelValue', '')
      await w.vm.$nextTick()
      expect(w.emitted('update:modelValue')[0]).toEqual([''])
    })

    it('does not clobber in-progress typing when the parent re-renders', async () => {
      const w = mountTypeable('')
      const mask = w.findComponent({ name: 'InputMask' })
      mask.vm.$emit('focus')
      mask.vm.$emit('update:modelValue', '2035-04-3d')
      await w.vm.$nextTick()
      await w.setProps({ modelValue: '' })
      expect(mask.props('modelValue')).toBe('2035-04-3d')
    })
  })

  it('round-trips a date without shifting a day across timezones', () => {
    // `new Date('2026-01-01')` parses as UTC and renders as Dec 31 west of
    // Greenwich; DateField must parse local-time to avoid that off-by-one.
    const w = mountWithBase(DateField, { props: { modelValue: '2026-01-01' } })
    expect(w.find('input').element.value).toBe('2026-01-01')
  })
})
