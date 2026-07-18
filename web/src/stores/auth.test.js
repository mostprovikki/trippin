import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from './auth.js'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    global.fetch = vi.fn()
  })

  it('login() sets organizer', async () => {
    fetch.mockImplementation((path) => {
      if (path === '/api/auth/login') {
        return Promise.resolve(new Response(JSON.stringify({ organizer: { id: 'o1', email: 'a@b.com' } }), { status: 200 }))
      }
      if (path === '/api/ai/status') {
        return Promise.resolve(new Response(JSON.stringify({ enabled: true }), { status: 200 }))
      }
      return Promise.resolve(new Response('{}', { status: 200 }))
    })
    const auth = useAuthStore()
    await auth.login('a@b.com', 'pw')
    expect(auth.organizer).toEqual({ id: 'o1', email: 'a@b.com' })
    expect(auth.aiEnabled).toBe(true)
  })

  it('fetchMe() sets aiEnabled from /api/ai/status', async () => {
    fetch.mockImplementation((path) => {
      if (path === '/api/auth/me') {
        return Promise.resolve(new Response(JSON.stringify({ organizer: { id: 'o1' } }), { status: 200 }))
      }
      if (path === '/api/ai/status') {
        return Promise.resolve(new Response(JSON.stringify({ enabled: false }), { status: 200 }))
      }
      return Promise.resolve(new Response('{}', { status: 200 }))
    })
    const auth = useAuthStore()
    await auth.fetchMe()
    expect(auth.organizer).toEqual({ id: 'o1' })
    expect(auth.aiEnabled).toBe(false)
  })
})
