import { describe, it, expect } from 'vitest'
import { makeTestApp, createOrganizer } from './helpers.js'

describe('auth', () => {
  it('login sets httpOnly cookie and returns organizer; bad password 401', async () => {
    const { app, db } = await makeTestApp()
    createOrganizer(db, { email: 'a@b.c', password: 'secret123', name: 'A' })
    const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@b.c', password: 'secret123' } })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().organizer.email).toBe('a@b.c')
    const setCookie = ok.headers['set-cookie']
    expect(setCookie).toMatch(/tp_session=/); expect(setCookie).toMatch(/HttpOnly/i)
    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@b.c', password: 'wrong' } })
    expect(bad.statusCode).toBe(401); expect(bad.json().error.code).toBe('INVALID_CREDENTIALS')
  })
  it('me returns organizer with cookie; logout clears it', async () => {
    const { app, db } = await makeTestApp()
    createOrganizer(db, { email: 'a@b.c', password: 'secret123' })
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@b.c', password: 'secret123' } })
    const cookie = login.headers['set-cookie'].split(';')[0]
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })
    expect(me.statusCode).toBe(200)
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } })
    expect(out.statusCode).toBe(204)
    expect(out.headers['set-cookie']).toMatch(/tp_session=;/)
  })
})
