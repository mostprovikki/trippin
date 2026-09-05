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
})
