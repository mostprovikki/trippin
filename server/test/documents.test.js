import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, existsSync, readdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { makeTestApp, loginOrganizer, authedInject, createPerson, createTrip } from './helpers.js'
import { makeLocalStorage } from '../src/storage/local.js'
import { config } from '../src/config.js'
// documents.routes.js is loaded by @fastify/autoload via a genuine native dynamic
// import() (see the same note in itinerary.test.js) — a separate module registry
// from this file's own `import` graph, so `instanceof` against a plain import here
// would never match what the route actually throws/catches. createRequire puts us
// in that same native registry.
const { StorageNotFoundError } = createRequire(import.meta.url)('../src/storage/errors.js')

function pdfBlob(sizeBytes = 20, byte = 0x61) {
  return new Blob([Buffer.alloc(sizeBytes, byte)], { type: 'application/pdf' })
}

// trip-planner-hu9: every makeTestApp() below with no explicit `storage` falls
// through to buildApp's `storage ?? await makeStorage()` -> makeLocalStorage(config),
// whose `uploadsDir = config.uploadsDir` default param is read PER CALL, not
// captured at import time — so redirecting this one mutable property before any
// test runs is enough, no config.js/local.js change needed. This suite alone was
// writing real files into server/data/uploads (~20MB/8 dirs per run, nothing ever
// cleaned it up — 660MB accumulated over time). vitest's default per-file module
// isolation means this mutation never touches config.js's copy in any other test
// file, so it can't leak into search.test.js/storage-local.test.js's own runs.
const testUploadsDir = mkdtempSync(join(tmpdir(), 'tp-documents-'))
config.uploadsDir = testUploadsDir
afterAll(async () => {
  await rm(testUploadsDir, { recursive: true, force: true })
})

describe('documents', () => {
  it('requires organizer auth', async () => {
    const { app } = await makeTestApp()
    expect((await app.inject({ method: 'GET', url: '/api/people/x/documents' })).statusCode).toBe(401)
  })

  it('organizer uploads, list omits file_path, downloads same bytes, deletes', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const p = await createPerson(db, { name: 'Asha' })

    const form = new FormData()
    form.append('file', pdfBlob(50, 0x62), 'passport.pdf')
    form.append('doc_type', 'passport')
    form.append('doc_number', 'X123')
    form.append('expiry_date', '2030-01-01')
    const up = await authedInject(app, cookie, { method: 'POST', url: `/api/people/${p.id}/documents`, payload: form })
    expect(up.statusCode).toBe(201)
    const doc = up.json().document
    expect(doc.file_path).toBeUndefined()
    expect(doc.doc_type).toBe('passport')
    expect(doc.doc_number).toBe('X123')
    expect(doc.expiry_date).toBe('2030-01-01')
    expect(doc.original_name).toBe('passport.pdf')
    expect(doc.mime_type).toBe('application/pdf')
    expect(doc.size_bytes).toBe(50)

    const list = await authedInject(app, cookie, { method: 'GET', url: `/api/people/${p.id}/documents` })
    expect(list.statusCode).toBe(200)
    expect(list.json().documents).toHaveLength(1)
    expect(list.json().documents[0].file_path).toBeUndefined()

    const dl = await authedInject(app, cookie, { method: 'GET', url: `/api/documents/${doc.id}/file` })
    expect(dl.statusCode).toBe(200)
    expect(dl.headers['content-disposition']).toContain('attachment')
    expect(dl.headers['content-disposition']).toContain('passport.pdf')
    expect(dl.rawPayload.length).toBe(50)
    expect(dl.rawPayload.every((b) => b === 0x62)).toBe(true)

    const del = await authedInject(app, cookie, { method: 'DELETE', url: `/api/documents/${doc.id}` })
    expect(del.statusCode).toBe(204)
    const list2 = await authedInject(app, cookie, { method: 'GET', url: `/api/people/${p.id}/documents` })
    expect(list2.json().documents).toHaveLength(0)
    const dl2 = await authedInject(app, cookie, { method: 'GET', url: `/api/documents/${doc.id}/file` })
    expect(dl2.statusCode).toBe(404)
  })

  it('rejects bad doc_type with 400 BAD_DOC_TYPE, accepts "other"', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const p = await createPerson(db)

    const badForm = new FormData()
    badForm.append('file', pdfBlob(10), 'x.pdf')
    badForm.append('doc_type', 'junk')
    const bad = await authedInject(app, cookie, { method: 'POST', url: `/api/people/${p.id}/documents`, payload: badForm })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.code).toBe('BAD_DOC_TYPE')

    const okForm = new FormData()
    okForm.append('file', pdfBlob(10), 'x.pdf')
    okForm.append('doc_type', 'other')
    const ok = await authedInject(app, cookie, { method: 'POST', url: `/api/people/${p.id}/documents`, payload: okForm })
    expect(ok.statusCode).toBe(201)
    expect(ok.json().document.doc_type).toBe('other')
  })

  // app.storage.put() runs inside the multipart parts loop, before doc_type can be
  // validated, so a 400 used to leave the object sitting in the bucket forever with no
  // documents row pointing at it and nothing that would ever clean it up.
  it('a rejected upload leaves no stored object behind', async () => {
    const uploadsDir = mkdtempSync(join(tmpdir(), 'tp-orphan-'))
    const { app, db } = await makeTestApp({ storage: makeLocalStorage({ uploadsDir }) })
    const { cookie } = await loginOrganizer(app, db)
    const p = await createPerson(db)

    const badForm = new FormData()
    badForm.append('file', pdfBlob(10), 'x.pdf')
    badForm.append('doc_type', 'junk')
    const bad = await authedInject(app, cookie, { method: 'POST', url: `/api/people/${p.id}/documents`, payload: badForm })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.code).toBe('BAD_DOC_TYPE')

    const personDir = join(uploadsDir, p.id)
    expect(existsSync(personDir) ? readdirSync(personDir) : []).toEqual([])
    expect((await db.get('SELECT COUNT(*)::int AS c FROM documents')).c).toBe(0)

    // and a good upload through the same storage still lands
    const okForm = new FormData()
    okForm.append('file', pdfBlob(10), 'x.pdf')
    okForm.append('doc_type', 'other')
    const ok = await authedInject(app, cookie, { method: 'POST', url: `/api/people/${p.id}/documents`, payload: okForm })
    expect(ok.statusCode).toBe(201)
    expect(readdirSync(personDir)).toHaveLength(1)
  })

  // The prod driver (Stratus) returns a signed URL instead of a stream, and no test has
  // ever run that branch — sendDoc's redirect was reachable only on AppSail.
  it('sendDoc 302-redirects when the storage driver returns a {url}, and file_path holds the storage key', async () => {
    const seen = {}
    const fakeSignedUrlStorage = {
      // A driver MUST drain the part stream — @fastify/multipart will not advance to the
      // next part until it is consumed (both real drivers do this).
      async put(_req, key, readable) {
        seen.putKey = key
        let size = 0
        for await (const c of readable) size += c.length
        return { size }
      },
      async getDownload(_req, args) { seen.getArgs = args; return { url: 'https://stratus.example/signed?sig=abc' } },
      async remove() {},
    }
    const { app, db } = await makeTestApp({ storage: fakeSignedUrlStorage })
    const { cookie } = await loginOrganizer(app, db)
    const p = await createPerson(db)

    const form = new FormData()
    form.append('file', pdfBlob(10), 'passport.pdf')
    form.append('doc_type', 'passport')
    const up = await authedInject(app, cookie, { method: 'POST', url: `/api/people/${p.id}/documents`, payload: form })
    expect(up.statusCode).toBe(201)
    const doc = up.json().document

    // Contract change from the sqlite build: file_path is a storage key, not a filesystem path.
    const row = await db.get('SELECT file_path FROM documents WHERE id = ?', [doc.id])
    expect(row.file_path).toBe(`${p.id}/${doc.id}`)
    expect(seen.putKey).toBe(`${p.id}/${doc.id}`)

    const dl = await authedInject(app, cookie, { method: 'GET', url: `/api/documents/${doc.id}/file` })
    expect(dl.statusCode).toBe(302)
    expect(dl.headers.location).toBe('https://stratus.example/signed?sig=abc')
    // sendDoc hands the driver the filename and mime it would need to set download
    // headers. The Stratus SDK has no way to attach them to a signed URL (see the
    // KNOWN GAP note in src/storage/stratus.js), so the redirect currently drops both.
    expect(seen.getArgs).toEqual({ key: `${p.id}/${doc.id}`, filename: 'passport.pdf', mime: 'application/pdf' })
  })

  // Option (c): an authenticated JSON endpoint hands back the signed/streaming URL
  // instead of the route itself doing a 302 (fetch can't follow a cross-origin
  // redirect + read the body, and a bare navigation carries no Authorization header).
  it('organizer file-url on local driver returns {direct:false, url: same-origin streaming path}', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const p = await createPerson(db)
    const form = new FormData()
    form.append('file', pdfBlob(10), 'passport.pdf')
    form.append('doc_type', 'passport')
    const up = await authedInject(app, cookie, { method: 'POST', url: `/api/people/${p.id}/documents`, payload: form })
    const doc = up.json().document

    const res = await authedInject(app, cookie, { method: 'GET', url: `/api/documents/${doc.id}/file-url` })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ url: `/api/documents/${doc.id}/file`, direct: false })

    // no auth → 401, same guard as the streaming route
    const noAuth = await app.inject({ method: 'GET', url: `/api/documents/${doc.id}/file-url` })
    expect(noAuth.statusCode).toBe(401)
  })

  it('organizer file-url 404s when the document does not exist', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const res = await authedInject(app, cookie, { method: 'GET', url: '/api/documents/nope/file-url' })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NOT_FOUND')
  })

  it('organizer file-url on a stratus-like driver returns {direct:true, url: presigned}', async () => {
    const fakeSignedUrlStorage = {
      async put(_req, key, readable) { let size = 0; for await (const c of readable) size += c.length; return { size } },
      async getDownload() { return { url: 'https://stratus.example/signed?sig=abc' } },
      async remove() {},
    }
    const { app, db } = await makeTestApp({ storage: fakeSignedUrlStorage })
    const { cookie } = await loginOrganizer(app, db)
    const p = await createPerson(db)
    const form = new FormData()
    form.append('file', pdfBlob(10), 'passport.pdf')
    form.append('doc_type', 'passport')
    const up = await authedInject(app, cookie, { method: 'POST', url: `/api/people/${p.id}/documents`, payload: form })
    const doc = up.json().document

    const res = await authedInject(app, cookie, { method: 'GET', url: `/api/documents/${doc.id}/file-url` })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ url: 'https://stratus.example/signed?sig=abc', direct: true, expires_in: 300 })
  })

  it('participant file-url on local driver returns {direct:false, url: same-origin path}, 404 for another person\'s doc, 401 without token', async () => {
    const { app, db } = await makeTestApp()
    const t = await createTrip(db)
    const p1 = await createPerson(db, { name: 'Me' })
    const p2 = await createPerson(db, { name: 'Other' })
    await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, p1.id])
    const raw = 'z'.repeat(43)
    await db.run('INSERT INTO participant_links (id,trip_id,person_id,token_hash) VALUES (?,?,?,?)',
      ['l2', t.id, p1.id, app.hashToken(raw)])
    const headers = { authorization: `Bearer ${raw}` }

    const form = new FormData()
    form.append('file', pdfBlob(10), 'visa.pdf')
    form.append('doc_type', 'visa')
    const up = await app.inject({ method: 'POST', url: '/api/participant/documents', headers, payload: form })
    const doc = up.json().document

    const res = await app.inject({ method: 'GET', url: `/api/participant/documents/${doc.id}/file-url`, headers })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ url: `/api/participant/documents/${doc.id}/file`, direct: false })

    // Cross-person 404: uses a REAL document uploaded under p2's own link, fetched
    // with p1's token. A raw INSERT with a bogus file_path here would still 404 if
    // the ownership guard were ever removed by mutation — a missing storage object
    // 404s on its own — so this fixture uploads for real: only the guard can produce
    // the 404 the test asserts, and a guard-removal mutant would surface as a 200.
    const rawOther = 'q'.repeat(43)
    await db.run('INSERT INTO participant_links (id,trip_id,person_id,token_hash) VALUES (?,?,?,?)',
      ['l2b', t.id, p2.id, app.hashToken(rawOther)])
    const otherForm = new FormData()
    otherForm.append('file', pdfBlob(10), 'other.pdf')
    otherForm.append('doc_type', 'passport')
    const otherUp = await app.inject({
      method: 'POST', url: '/api/participant/documents',
      headers: { authorization: `Bearer ${rawOther}` }, payload: otherForm
    })
    const otherDoc = otherUp.json().document

    const res404 = await app.inject({ method: 'GET', url: `/api/participant/documents/${otherDoc.id}/file-url`, headers })
    expect(res404.statusCode).toBe(404)

    const noAuth = await app.inject({ method: 'GET', url: `/api/participant/documents/${doc.id}/file-url` })
    expect(noAuth.statusCode).toBe(401)
  })

  it('participant file-url on a stratus-like driver returns {direct:true, url: presigned}', async () => {
    const fakeSignedUrlStorage = {
      async put(_req, key, readable) { let size = 0; for await (const c of readable) size += c.length; return { size } },
      async getDownload() { return { url: 'https://stratus.example/signed?sig=xyz' } },
      async remove() {},
    }
    const { app, db } = await makeTestApp({ storage: fakeSignedUrlStorage })
    const t = await createTrip(db)
    const p1 = await createPerson(db)
    await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, p1.id])
    const raw = 'w'.repeat(43)
    await db.run('INSERT INTO participant_links (id,trip_id,person_id,token_hash) VALUES (?,?,?,?)',
      ['l3', t.id, p1.id, app.hashToken(raw)])
    const headers = { authorization: `Bearer ${raw}` }
    const form = new FormData()
    form.append('file', pdfBlob(10), 'visa.pdf')
    form.append('doc_type', 'visa')
    const up = await app.inject({ method: 'POST', url: '/api/participant/documents', headers, payload: form })
    const doc = up.json().document

    const res = await app.inject({ method: 'GET', url: `/api/participant/documents/${doc.id}/file-url`, headers })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ url: 'https://stratus.example/signed?sig=xyz', direct: true, expires_in: 300 })
  })

  it('download 404s with the standard NOT_FOUND shape when the DB row survives but the object is gone', async () => {
    const missingStorage = {
      // Must drain the part stream — @fastify/multipart won't advance otherwise.
      async put(_req, key, readable) {
        let size = 0
        for await (const c of readable) size += c.length
        return { size, key }
      },
      async getDownload(_req, { key }) { throw new StorageNotFoundError(key) },
      async remove() {},
    }
    const { app, db } = await makeTestApp({ storage: missingStorage })
    const { cookie } = await loginOrganizer(app, db)
    const p = await createPerson(db)
    const form = new FormData()
    form.append('file', pdfBlob(10), 'passport.pdf')
    form.append('doc_type', 'passport')
    const up = await authedInject(app, cookie, { method: 'POST', url: `/api/people/${p.id}/documents`, payload: form })
    expect(up.statusCode).toBe(201)
    const doc = up.json().document

    const dl = await authedInject(app, cookie, { method: 'GET', url: `/api/documents/${doc.id}/file` })
    expect(dl.statusCode).toBe(404)
    expect(dl.json().error.code).toBe('NOT_FOUND')
  })

  it('rejects oversize upload (11 MB) with 413', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = await loginOrganizer(app, db)
    const p = await createPerson(db)
    const form = new FormData()
    form.append('file', pdfBlob(11 * 1024 * 1024), 'big.pdf')
    form.append('doc_type', 'other')
    const res = await authedInject(app, cookie, { method: 'POST', url: `/api/people/${p.id}/documents`, payload: form })
    expect(res.statusCode).toBe(413)
  }, 20000)

  it('participant can upload/list/download own docs, 404s for another person\'s doc', async () => {
    const { app, db } = await makeTestApp()
    const t = await createTrip(db)
    const p1 = await createPerson(db, { name: 'Me' })
    const p2 = await createPerson(db, { name: 'Other' })
    await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, p1.id])
    await db.run('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)', [t.id, p2.id])
    const raw = 'y'.repeat(43)
    await db.run('INSERT INTO participant_links (id,trip_id,person_id,token_hash) VALUES (?,?,?,?)',
      ['l1', t.id, p1.id, app.hashToken(raw)])
    const headers = { authorization: `Bearer ${raw}` }

    const form = new FormData()
    form.append('file', pdfBlob(30, 0x63), 'visa.pdf')
    form.append('doc_type', 'visa')
    const up = await app.inject({ method: 'POST', url: '/api/participant/documents', headers, payload: form })
    expect(up.statusCode).toBe(201)
    const doc = up.json().document
    expect(doc.person_id).toBe(p1.id)

    const list = await app.inject({ method: 'GET', url: '/api/participant/documents', headers })
    expect(list.statusCode).toBe(200)
    expect(list.json().documents).toHaveLength(1)

    const dl = await app.inject({ method: 'GET', url: `/api/participant/documents/${doc.id}/file`, headers })
    expect(dl.statusCode).toBe(200)
    expect(dl.rawPayload.length).toBe(30)

    // seed a document belonging to another person directly
    const otherId = 'doc-other'
    await db.run(`INSERT INTO documents (id,person_id,doc_type,file_path,original_name,mime_type,size_bytes)
      VALUES (?,?,?,?,?,?,?)`, [otherId, p2.id, 'passport', '/nonexistent/path', 'x.pdf', 'application/pdf', 1])

    const dl404 = await app.inject({ method: 'GET', url: `/api/participant/documents/${otherId}/file`, headers })
    expect(dl404.statusCode).toBe(404)
    const del404 = await app.inject({ method: 'DELETE', url: `/api/participant/documents/${otherId}`, headers })
    expect(del404.statusCode).toBe(404)

    const del = await app.inject({ method: 'DELETE', url: `/api/participant/documents/${doc.id}`, headers })
    expect(del.statusCode).toBe(204)
  }, 20000)
})
