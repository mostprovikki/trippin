import { describe, it, expect } from 'vitest'
import ConfirmDialog from 'primevue/confirmdialog'
import { mountWithBase } from '../test-utils.js'
import GoalsEditor from './GoalsEditor.vue'

describe('GoalsEditor', () => {
  it('keeps an aria-label on Delete and still confirms before removing a goal', async () => {
    const goals = [{ id: 'g1', title: 'Visit temple' }]
    const wrapper = mountWithBase(GoalsEditor, { props: { goals } })
    const delBtn = wrapper.find('[aria-label="Delete Visit temple"]')
    expect(delBtn.exists()).toBe(true)
    // GoalsEditor renders no <ConfirmDialog/> of its own (App.vue owns the
    // global one) — mount it alongside so confirm.require()'s dialog actually
    // renders, same pattern as DayCard.test.js.
    const dialogWrapper = mountWithBase(ConfirmDialog, { attachTo: document.body })
    await delBtn.trigger('click')
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('Delete this goal?')
    const acceptBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Delete')
    acceptBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.emitted('delete')).toEqual([['g1']])
    dialogWrapper.unmount()
  })
})
