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

// A stand-in for the real Window object window.open() would return: DocumentList
// navigates it via `.location =` rather than a second window.open(url) call (the
// latter, called after an await, loses the click's user-activation and gets
// popup-blocked in Safari/Firefox — see the openInTab() comment).
function fakeWindow() {
  return { location: '', opener: 'something', close: vi.fn() }
}

describe('DocumentList open-in-tab action', () => {
  let openSpy
  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open')
  })
  afterEach(() => {
    openSpy.mockRestore()
  })

  it('has an aria-labelled open button per document', () => {
    const { wrapper } = mountList()
    const btn = wrapper.find('[aria-label="Open passport.pdf in new tab"]')
    expect(btn.exists()).toBe(true)
  })

  it('opens a blank window synchronously (before the url fetch) and clears its opener', async () => {
    const w = fakeWindow()
    openSpy.mockReturnValue(w)
    const { wrapper, store } = mountList()
    let resolveUrl
    store.getDocumentUrl = vi.fn(() => new Promise((r) => { resolveUrl = r }))

    wrapper.find('[aria-label="Open passport.pdf in new tab"]').trigger('click')
    await vi.waitFor(() => expect(openSpy).toHaveBeenCalled())

    // Called with no target/features — a same-origin blank placeholder navigated
    // later, not a direct window.open(url) after the await.
    expect(openSpy).toHaveBeenCalledWith('about:blank')
    expect(w.opener).toBeNull()
    expect(w.location).toBe('') // not navigated yet — the url fetch hasn't resolved

    resolveUrl({ url: '/api/documents/d1/file', direct: false })
    await vi.waitFor(() => expect(w.location).not.toBe(''))
  })

  it('direct:true — navigates the placeholder window to the presigned url unchanged', async () => {
    const w = fakeWindow()
    openSpy.mockReturnValue(w)
    const { wrapper, store } = mountList()
    store.getDocumentUrl = vi.fn().mockResolvedValue({ url: 'https://stratus.example/signed?sig=abc', direct: true })

    await wrapper.find('[aria-label="Open passport.pdf in new tab"]').trigger('click')
    await vi.waitFor(() => expect(w.location).not.toBe(''))
    expect(store.getDocumentUrl).toHaveBeenCalledWith('d1')
    expect(w.location).toBe('https://stratus.example/signed?sig=abc')
  })

  it('direct:false — navigates to the same-origin /file path with ?inline=1 appended', async () => {
    const w = fakeWindow()
    openSpy.mockReturnValue(w)
    const { wrapper, store } = mountList()
    store.getDocumentUrl = vi.fn().mockResolvedValue({ url: '/api/documents/d1/file', direct: false })

    await wrapper.find('[aria-label="Open passport.pdf in new tab"]').trigger('click')
    await vi.waitFor(() => expect(w.location).not.toBe(''))
    // Plain /file defaults to content-disposition: attachment (documents.routes.js
    // sendDoc) — without ?inline=1 this would just re-download the file and the
    // new tab would close itself.
    expect(w.location).toBe('/api/documents/d1/file?inline=1')
  })

  it('a getDocumentUrl failure closes the placeholder window and notifies, rather than throwing', async () => {
    const w = fakeWindow()
    openSpy.mockReturnValue(w)
    const { wrapper, store } = mountList()
    store.getDocumentUrl = vi.fn().mockRejectedValue(new Error('boom'))

    await wrapper.find('[aria-label="Open passport.pdf in new tab"]').trigger('click')
    await vi.waitFor(() => expect(w.close).toHaveBeenCalled())
    expect(w.location).toBe('') // never navigated
  })

  it('a blocked pop-up (window.open returns null) notifies without fetching a url', async () => {
    openSpy.mockReturnValue(null)
    const { wrapper, store } = mountList()
    store.getDocumentUrl = vi.fn()

    await wrapper.find('[aria-label="Open passport.pdf in new tab"]').trigger('click')
    expect(store.getDocumentUrl).not.toHaveBeenCalled()
  })

  it('leaves the existing download action untouched', () => {
    const { wrapper } = mountList()
    const link = wrapper.find('a')
    expect(link.text()).toBe('passport.pdf')
    expect(wrapper.find('[aria-label="Delete passport.pdf"]').exists()).toBe(true)
  })
})
