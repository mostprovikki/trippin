import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ConfirmDialog from 'primevue/confirmdialog'
import { mountWithBase } from '../test-utils.js'
import ChecklistCard from './ChecklistCard.vue'
import { useChecklistsStore } from '../stores/checklists.js'

function mountCard(checklist) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useChecklistsStore()
  const wrapper = mountWithBase(ChecklistCard, { pinia, props: { checklist, participants: [] } })
  return { wrapper, store }
}

describe('ChecklistCard', () => {
  it('keeps an aria-label on the item delete button, confirms (danger-styled) before deleting, and deletes on accept', async () => {
    const { wrapper, store } = mountCard({
      id: 'c1', name: 'Packing', kind: 'packing',
      items: [{ id: 'i1', title: 'Passport', done: false }]
    })
    store.deleteItem = vi.fn().mockResolvedValue()
    // ConfirmDialog isn't mounted by ChecklistCard itself (App.vue owns the
    // global one) — mount it alongside so confirm.require()'s dialog renders.
    const dialogWrapper = mountWithBase(ConfirmDialog, { attachTo: document.body })
    const delBtn = wrapper.find('[aria-label="Delete Passport"]')
    expect(delBtn.exists()).toBe(true)
    await delBtn.trigger('click')
    await wrapper.vm.$nextTick()
    expect(store.deleteItem).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Delete item?')
    expect(document.body.textContent).toContain('Delete "Passport"?')
    const acceptBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Delete')
    expect(acceptBtn.className).toContain('p-button-danger')
    acceptBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(store.deleteItem).toHaveBeenCalledWith('i1')
    dialogWrapper.unmount()
  })

  it('cancelling the item delete confirmation does not delete', async () => {
    const { wrapper, store } = mountCard({
      id: 'c1', name: 'Packing', kind: 'packing',
      items: [{ id: 'i1', title: 'Passport', done: false }]
    })
    store.deleteItem = vi.fn().mockResolvedValue()
    const dialogWrapper = mountWithBase(ConfirmDialog, { attachTo: document.body })
    const delBtn = wrapper.find('[aria-label="Delete Passport"]')
    await delBtn.trigger('click')
    await wrapper.vm.$nextTick()
    const cancelBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel')
    cancelBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(store.deleteItem).not.toHaveBeenCalled()
    dialogWrapper.unmount()
  })

  // jsdom has no layout engine, so the actual 36px-vs-40px measurement
  // (trip-planner-3e1) can only be proven live — see e2e/qa-datepicker.mjs's
  // assertChecklistRowRhythm. This is a cheaper regression guard: it fails
  // loudly if the scoped override that pins the row's icon-only Delete
  // button to the Select/DateField's 36px is ever deleted or renamed, rather
  // than silently drifting back to PrimeVue's 40px default.
  it('pins the item-row Delete button to the 36px row rhythm in its scoped CSS', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(path.join(here, 'ChecklistCard.vue'), 'utf8')
    const style = src.slice(src.indexOf('<style'))
    expect(style).toMatch(/\.checklist-items\s+\.icon-danger-btn\s*{[^}]*width:\s*2\.25rem[^}]*height:\s*2\.25rem/)
  })
})
