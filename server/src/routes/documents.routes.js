import { randomUUID } from 'node:crypto'
import multipart from '@fastify/multipart'
import { httpError } from '../lib/errors.js'
import { StorageNotFoundError } from '../storage/errors.js'

const DOC_TYPES = ['passport', 'visa', 'national_id', 'driving_license', 'vaccination', 'other']
const DOC_FIELDS = ['id', 'person_id', 'doc_type', 'doc_number', 'expiry_date', 'original_name', 'mime_type', 'size_bytes', 'uploaded_at']

export default async function routes(app) {
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } })

  function getDoc(id) {
    return app.db.get('SELECT * FROM documents WHERE id = ?', [id])
  }
  function docJson(row) {
    if (!row) return row
    const out = {}
    for (const f of DOC_FIELDS) out[f] = row[f]
    return out
  }

  async function saveUpload(req, personId, reply) {
    const parts = req.parts()
    let file = null; const fields = {}
    for await (const part of parts) {
      if (part.type === 'file') {
        const id = randomUUID()
        const key = `${personId}/${id}`
        const { size } = await app.storage.put(req, key, part.file, { mime: part.mimetype }) // throws on fileSize limit → 413 via error handler
        file = { id, key, size, original_name: part.filename, mime_type: part.mimetype }
      } else fields[part.fieldname] = part.value
    }
    if (!file || !DOC_TYPES.includes(fields.doc_type)) {
      // Multipart field order is the client's choice, so the file part can arrive — and
      // therefore be stored — before doc_type is even readable. Validate-then-write is
      // not available here; the next best thing is that a refusal leaves nothing behind.
      if (file) await app.storage.remove(req, file.key)
      httpError(reply, 400, 'BAD_DOC_TYPE', 'file and valid doc_type required')
      return null
    }
    await app.db.run(`INSERT INTO documents (id,person_id,doc_type,doc_number,expiry_date,file_path,original_name,mime_type,size_bytes)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [file.id, personId, fields.doc_type, fields.doc_number ?? null,
        fields.expiry_date ?? null, file.key, file.original_name, file.mime_type, file.size])
    return getDoc(file.id)
  }

  // Shared by both organizer and participant download routes: the one place that
  // translates "storage object missing" (documents row survives, e.g. an orphan-upload
  // purge or manual deletion) into the app's standard 404 shape, for both drivers.
  async function sendDoc(req, reply, row) {
    let dl
    try {
      dl = await app.storage.getDownload(req, { key: row.file_path, filename: row.original_name, mime: row.mime_type })
    } catch (e) {
      if (e instanceof StorageNotFoundError) return httpError(reply, 404, 'NOT_FOUND', 'Document file is missing')
      throw e
    }
    if (dl.url) return reply.redirect(dl.url)
    reply.header('content-disposition', `attachment; filename="${dl.filename.replace(/"/g, '')}"`)
    reply.type(dl.mime)
    return reply.send(dl.stream)
  }

  // Same-shape sibling of sendDoc, for both guards: instead of the route itself
  // streaming/redirecting, hand the client JSON it can act on. `direct: true` means
  // "cross-origin presigned URL — fetch it with no Authorization header" (stratus);
  // `direct: false` means "same-origin, still needs the bearer/cookie — use the
  // existing streaming route unchanged" (local). See OWNER DECISION on trip-planner-a17:
  // keep signed URLs, never put the bearer token in a query string.
  async function sendDocUrl(req, reply, row, sameOriginPath) {
    let dl
    try {
      dl = await app.storage.getDownload(req, { key: row.file_path, filename: row.original_name, mime: row.mime_type })
    } catch (e) {
      if (e instanceof StorageNotFoundError) return httpError(reply, 404, 'NOT_FOUND', 'Document file is missing')
      throw e
    }
    if (dl.url) return reply.send({ url: dl.url, direct: true, expires_in: 300 })
    return reply.send({ url: sameOriginPath, direct: false })
  }

  async function removeDoc(req, row) {
    await app.db.run('DELETE FROM documents WHERE id = ?', [row.id])
    await app.storage.remove(req, row.file_path)
  }

  // --- organizer routes (scoped to the organizer's own persons) ---
  const ownedDoc = (req) => app.db.get(
    'SELECT d.* FROM documents d JOIN persons p ON p.id = d.person_id WHERE d.id = ? AND p.organizer_id = ?',
    [req.params.id, req.organizer.id]
  )

  app.post('/people/:personId/documents', { preHandler: app.requireOrganizer }, async (req, reply) => {
    if (!(await app.ownedPerson(req, req.params.personId))) return httpError(reply, 404, 'NOT_FOUND', 'No such person')
    const doc = await saveUpload(req, req.params.personId, reply)
    if (!doc) return
    return reply.code(201).send({ document: docJson(doc) })
  })

  app.get('/people/:personId/documents', { preHandler: app.requireOrganizer }, async (req, reply) => {
    if (!(await app.ownedPerson(req, req.params.personId))) return httpError(reply, 404, 'NOT_FOUND', 'No such person')
    const rows = await app.db.all('SELECT * FROM documents WHERE person_id = ? ORDER BY uploaded_at, id', [req.params.personId])
    return { documents: rows.map(docJson) }
  })

  app.get('/documents/:id/file', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const row = await ownedDoc(req)
    if (!row) return httpError(reply, 404, 'NOT_FOUND', 'No such document')
    return sendDoc(req, reply, row)
  })

  app.get('/documents/:id/file-url', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const row = await ownedDoc(req)
    if (!row) return httpError(reply, 404, 'NOT_FOUND', 'No such document')
    return sendDocUrl(req, reply, row, `/api/documents/${row.id}/file`)
  })

  app.delete('/documents/:id', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const row = await ownedDoc(req)
    if (!row) return httpError(reply, 404, 'NOT_FOUND', 'No such document')
    await removeDoc(req, row)
    return reply.code(204).send()
  })

  // --- participant routes (own person only) ---
  app.post('/participant/documents', { preHandler: app.requireParticipant }, async (req, reply) => {
    const doc = await saveUpload(req, req.participant.personId, reply)
    if (!doc) return
    return reply.code(201).send({ document: docJson(doc) })
  })

  app.get('/participant/documents', { preHandler: app.requireParticipant }, async (req) => {
    const rows = await app.db.all('SELECT * FROM documents WHERE person_id = ? ORDER BY uploaded_at, id', [req.participant.personId])
    return { documents: rows.map(docJson) }
  })

  app.get('/participant/documents/:id/file', { preHandler: app.requireParticipant }, async (req, reply) => {
    const row = await getDoc(req.params.id)
    if (!row || row.person_id !== req.participant.personId) return httpError(reply, 404, 'NOT_FOUND', 'No such document')
    return sendDoc(req, reply, row)
  })

  app.get('/participant/documents/:id/file-url', { preHandler: app.requireParticipant }, async (req, reply) => {
    const row = await getDoc(req.params.id)
    if (!row || row.person_id !== req.participant.personId) return httpError(reply, 404, 'NOT_FOUND', 'No such document')
    return sendDocUrl(req, reply, row, `/api/participant/documents/${row.id}/file`)
  })

  app.delete('/participant/documents/:id', { preHandler: app.requireParticipant }, async (req, reply) => {
    const row = await getDoc(req.params.id)
    if (!row || row.person_id !== req.participant.personId) return httpError(reply, 404, 'NOT_FOUND', 'No such document')
    await removeDoc(req, row)
    return reply.code(204).send()
  })
}
