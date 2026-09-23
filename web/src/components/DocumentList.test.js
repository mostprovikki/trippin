import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithBase } from '../test-utils.js'
import DocumentList from './DocumentList.vue'
import { usePeopleStore } from '../stores/people.js'

const DOC = { id: 'd1', doc_type: 'passport', doc_number: 'X1', expiry_date: null, original_name: 'passport.pdf' }

function mountList() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = usePeopleStore()
  store.documents = [DOC]
  const wrapper = mountWithBase(DocumentList, { pinia, props: { personId: 'p1' } })
  return { wrapper, store }
}

describe('DocumentList open-in-tab action', () => {
  let openSpy
  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => {})
  })
  afterEach(() => {
    openSpy.mockRestore()
  })

  it('has an aria-labelled open button per document', () => {
    const { wrapper } = mountList()
    const btn = wrapper.find('[aria-label="Open passport.pdf in new tab"]')
    expect(btn.exists()).toBe(true)
  })

  it('direct:true — opens the presigned url in a new tab', async () => {
    const { wrapper, store } = mountList()
    store.getDocumentUrl = vi.fn().mockResolvedValue({ url: 'https://stratus.example/signed?sig=abc', direct: true })
    await wrapper.find('[aria-label="Open passport.pdf in new tab"]').trigger('click')
    await vi.waitFor(() => expect(openSpy).toHaveBeenCalled())
    expect(store.getDocumentUrl).toHaveBeenCalledWith('d1')
    expect(openSpy).toHaveBeenCalledWith('https://stratus.example/signed?sig=abc', '_blank', 'noopener')
  })

  it('direct:false — opens the same-origin /file path in a new tab', async () => {
    const { wrapper, store } = mountList()
    store.getDocumentUrl = vi.fn().mockResolvedValue({ url: '/api/documents/d1/file', direct: false })
    await wrapper.find('[aria-label="Open passport.pdf in new tab"]').trigger('click')
    await vi.waitFor(() => expect(openSpy).toHaveBeenCalled())
    expect(openSpy).toHaveBeenCalledWith('/api/documents/d1/file', '_blank', 'noopener')
  })

  it('a getDocumentUrl failure notifies rather than throwing, and does not call window.open', async () => {
    const { wrapper, store } = mountList()
    store.getDocumentUrl = vi.fn().mockRejectedValue(new Error('boom'))
    await wrapper.find('[aria-label="Open passport.pdf in new tab"]').trigger('click')
    await vi.waitFor(() => expect(store.getDocumentUrl).toHaveBeenCalled())
    // flush the rejection's catch handler
    await new Promise((r) => setTimeout(r, 0))
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('leaves the existing download action untouched', () => {
    const { wrapper } = mountList()
    const link = wrapper.find('a')
    expect(link.text()).toBe('passport.pdf')
    expect(wrapper.find('[aria-label="Delete passport.pdf"]').exists()).toBe(true)
  })
})
