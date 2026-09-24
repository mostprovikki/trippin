import { describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ConfirmDialog from 'primevue/confirmdialog'
import { mountWithBase } from '../test-utils.js'
import DestinationPanel from './DestinationPanel.vue'
import { useTripsStore } from '../stores/trips.js'

function mountPanel(candidates) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useTripsStore()
  const wrapper = mountWithBase(DestinationPanel, { pinia, props: { tripId: 't1', candidates } })
  return { wrapper, store }
}

describe('DestinationPanel', () => {
  it('confirms (non-danger) before marking a candidate decided, and calls store.decide on accept', async () => {
    const { wrapper, store } = mountPanel([
      { id: 'cand1', name: 'Hanoi', source: 'manual', decided: 0 }
    ])
    store.decide = vi.fn().mockResolvedValue()
    const dialogWrapper = mountWithBase(ConfirmDialog, { attachTo: document.body })
    const markBtn = wrapper.findAll('button').find((b) => b.text() === 'Mark decided')
    expect(markBtn.exists()).toBe(true)
    await markBtn.trigger('click')
    await wrapper.vm.$nextTick()
    expect(store.decide).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Set destination?')
    expect(document.body.textContent).toContain('Make "Hanoi" the trip destination? Other candidates stay listed.')
    const acceptBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Mark decided')
    expect(acceptBtn.className).not.toContain('p-button-danger')
    acceptBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(store.decide).toHaveBeenCalledWith('cand1')
    dialogWrapper.unmount()
  })

  it('cancelling the mark-decided confirmation does not call store.decide', async () => {
    const { wrapper, store } = mountPanel([
      { id: 'cand1', name: 'Hanoi', source: 'manual', decided: 0 }
    ])
    store.decide = vi.fn().mockResolvedValue()
    const dialogWrapper = mountWithBase(ConfirmDialog, { attachTo: document.body })
    const markBtn = wrapper.findAll('button').find((b) => b.text() === 'Mark decided')
    await markBtn.trigger('click')
    await wrapper.vm.$nextTick()
    const cancelBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel')
    cancelBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(store.decide).not.toHaveBeenCalled()
    dialogWrapper.unmount()
  })
})
