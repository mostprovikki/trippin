import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithBase } from '../test-utils.js'
import PromptPasteDialog from './PromptPasteDialog.vue'
import { api, ApiError } from '../api/client.js'

const body = () => document.body
const q = (sel) => body().querySelector(sel)

async function mountDialog(postImpl) {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/x/prompt') return { prompt: 'PROMPT TEXT for your AI' }
    throw new Error(`unexpected GET ${url}`)
  })
  const post = vi.spyOn(api, 'post').mockImplementation(postImpl || (async () => ({ days: [] })))
  const wrapper = mountWithBase(PromptPasteDialog, {
    props: { visible: true, header: 'Draft with your own AI', promptUrl: '/api/x/prompt', importUrl: '/api/x/import' },
    attachTo: body()
  })
  await flushPromises()
  return { wrapper, post }
}

afterEach(() => {
  vi.restoreAllMocks()
  delete navigator.clipboard
  document.body.innerHTML = ''
})

describe('PromptPasteDialog', () => {
  it('renders the prompt text fetched from the GET endpoint', async () => {
    const { wrapper } = await mountDialog()
    expect(api.get).toHaveBeenCalledWith('/api/x/prompt')
    expect(q('[data-test="paste-prompt"]').value).toBe('PROMPT TEXT for your AI')
    wrapper.unmount()
  })

  it('Copy writes the prompt to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue()
    // getter-only in happy-dom: defineProperty, not Object.assign
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true })
    const { wrapper } = await mountDialog()
    q('[data-test="paste-copy"]').click()
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('PROMPT TEXT for your AI')
    wrapper.unmount()
  })

  it('a 400 from import renders the server message inline and keeps the dialog open with the reply', async () => {
    const { wrapper, post } = await mountDialog(async () => {
      throw new ApiError(400, 'AI_PASTE_INVALID', 'Reply JSON does not match the expected shape: data must have required property days')
    })
    const ta = q('[data-test="paste-reply"]')
    ta.value = '{"nope": 1}'
    ta.dispatchEvent(new Event('input'))
    await flushPromises()
    ta.focus()
    q('[data-test="paste-import"]').click()
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/api/x/import', { text: '{"nope": 1}' })
    expect(q('[data-test="paste-error"]').textContent).toContain('must have required property days')
    expect(wrapper.emitted('imported')).toBeUndefined()
    expect(wrapper.emitted('update:visible')).toBeUndefined()
    // same element, still holding the pasted text — patched in place, not re-rendered
    expect(q('[data-test="paste-reply"]')).toBe(ta)
    expect(ta.value).toBe('{"nope": 1}')
    wrapper.unmount()
  })

  it('a 200 emits imported with the response and closes the dialog', async () => {
    const res = { days: [{ day_date: '2026-08-01', items: [] }] }
    const { wrapper } = await mountDialog(async () => res)
    const ta = q('[data-test="paste-reply"]')
    ta.value = '{"days": []}'
    ta.dispatchEvent(new Event('input'))
    await flushPromises()
    q('[data-test="paste-import"]').click()
    await flushPromises()
    expect(wrapper.emitted('imported')[0][0]).toEqual(res)
    expect(wrapper.emitted('update:visible').at(-1)).toEqual([false])
    wrapper.unmount()
  })

  it('Import is disabled until something is pasted', async () => {
    const { wrapper, post } = await mountDialog()
    expect(q('[data-test="paste-import"]').disabled).toBe(true)
    expect(post).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
