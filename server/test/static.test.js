import { describe, it, expect } from 'vitest'
import { makeTestApp } from './helpers.js'

// web/dist is absent in dev/test, so the static plugin returns early and Fastify's
// default routing applies (Vite serves the SPA in dev instead). This test locks the
// SPA-fallback contract: an unknown /api/* route must 404 with a JSON body, never
// an HTML page — true here (Fastify's default not-found response is JSON) and true
// in prod, where static.js's own setNotFoundHandler sends the {error:{code}} envelope
// for /api/* and falls back to index.html for everything else (see plan Task 21).
describe('static plugin (dev/test mode, web/dist absent)', () => {
  it('unknown /api/* route 404s as JSON, not HTML', async () => {
    const { app } = await makeTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/nope' })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toMatch(/application\/json/)
  })
})
