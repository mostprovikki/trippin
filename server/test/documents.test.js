import { describe, it, expect } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createPerson, createTrip } from './helpers.js'

function pdfBlob(sizeBytes = 20, byte = 0x61) {
  return new Blob([Buffer.alloc(sizeBytes, byte)], { type: 'application/pdf' })
}

describe('documents', () => {
  it('requires organizer auth', async () => {
    const { app } = await makeTestApp()
    expect((await app.inject({ method: 'GET', url: '/api/people/x/documents' })).statusCode).toBe(401)
  })

  it('organizer uploads, list omits file_path, downloads same bytes, deletes', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const p = createPerson(db, { name: 'Asha' })

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
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const p = createPerson(db)

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

  it('rejects oversize upload (11 MB) with 413', async () => {
    const { app, db } = await makeTestApp(); const { cookie } = loginOrganizer(app, db)
    const p = createPerson(db)
    const form = new FormData()
    form.append('file', pdfBlob(11 * 1024 * 1024), 'big.pdf')
    form.append('doc_type', 'other')
    const res = await authedInject(app, cookie, { method: 'POST', url: `/api/people/${p.id}/documents`, payload: form })
    expect(res.statusCode).toBe(413)
  }, 20000)

  it('participant can upload/list/download own docs, 404s for another person\'s doc', async () => {
    const { app, db } = await makeTestApp()
    const t = createTrip(db)
    const p1 = createPerson(db, { name: 'Me' })
    const p2 = createPerson(db, { name: 'Other' })
    db.prepare('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)').run(t.id, p1.id)
    db.prepare('INSERT INTO trip_participants (trip_id,person_id) VALUES (?,?)').run(t.id, p2.id)
    const raw = 'y'.repeat(43)
    db.prepare('INSERT INTO participant_links (id,trip_id,person_id,token_hash) VALUES (?,?,?,?)')
      .run('l1', t.id, p1.id, app.hashToken(raw))
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
    db.prepare(`INSERT INTO documents (id,person_id,doc_type,file_path,original_name,mime_type,size_bytes)
      VALUES (?,?,?,?,?,?,?)`).run(otherId, p2.id, 'passport', '/nonexistent/path', 'x.pdf', 'application/pdf', 1)

    const dl404 = await app.inject({ method: 'GET', url: `/api/participant/documents/${otherId}/file`, headers })
    expect(dl404.statusCode).toBe(404)
    const del404 = await app.inject({ method: 'DELETE', url: `/api/participant/documents/${otherId}`, headers })
    expect(del404.statusCode).toBe(404)

    const del = await app.inject({ method: 'DELETE', url: `/api/participant/documents/${doc.id}`, headers })
    expect(del.statusCode).toBe(204)
  }, 20000)
})
