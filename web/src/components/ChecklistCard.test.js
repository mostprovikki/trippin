import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
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
  it('keeps an aria-label on the item delete button and calls the store directly (no confirm)', async () => {
    const { wrapper, store } = mountCard({
      id: 'c1', name: 'Packing', kind: 'packing',
      items: [{ id: 'i1', title: 'Passport', done: false }]
    })
    store.deleteItem = vi.fn().mockResolvedValue()
    const delBtn = wrapper.find('[aria-label="Delete Passport"]')
    expect(delBtn.exists()).toBe(true)
    await delBtn.trigger('click')
    expect(store.deleteItem).toHaveBeenCalledWith('i1')
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
