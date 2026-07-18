import { describe, it, expect } from 'vitest'
import { mountWithBase } from './test-utils.js'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

const Probe = {
  template: '<div>ok</div>',
  setup() {
    // throws if ToastService / ConfirmationService are not installed
    useToast()
    useConfirm()
  }
}

describe('mountWithBase', () => {
  it('provides pinia + primevue toast + confirm services', () => {
    const wrapper = mountWithBase(Probe)
    expect(wrapper.text()).toBe('ok')
  })
})
