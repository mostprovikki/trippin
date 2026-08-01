import { randomUUID } from 'node:crypto'
import multipart from '@fastify/multipart'
import { httpError } from '../lib/errors.js'

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
        const { size } = await app.storage.put(req, key, part.file) // throws on fileSize limit → 413 via error handler
        file = { id, key, size, original_name: part.filename, mime_type: part.mimetype }
      } else fields[part.fieldname] = part.value
    }
    if (!file || !DOC_TYPES.includes(fields.doc_type)) {
      httpError(reply, 400, 'BAD_DOC_TYPE', 'file and valid doc_type required')
      return null
    }
    await app.db.run(`INSERT INTO documents (id,person_id,doc_type,doc_number,expiry_date,file_path,original_name,mime_type,size_bytes)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [file.id, personId, fields.doc_type, fields.doc_number ?? null,
        fields.expiry_date ?? null, file.key, file.original_name, file.mime_type, file.size])
    return getDoc(file.id)
  }

  async function sendDoc(req, reply, row) {
    const dl = await app.storage.getDownload(req, { key: row.file_path, filename: row.original_name, mime: row.mime_type })
    if (dl.url) return reply.redirect(dl.url)
    reply.header('content-disposition', `attachment; filename="${dl.filename.replace(/"/g, '')}"`)
    reply.type(dl.mime)
    return reply.send(dl.stream)
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
    const rows = await app.db.all('SELECT * FROM documents WHERE person_id = ? ORDER BY uploaded_at', [req.params.personId])
    return { documents: rows.map(docJson) }
  })

  app.get('/documents/:id/file', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const row = await ownedDoc(req)
    if (!row) return httpError(reply, 404, 'NOT_FOUND', 'No such document')
    return sendDoc(req, reply, row)
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
    const rows = await app.db.all('SELECT * FROM documents WHERE person_id = ? ORDER BY uploaded_at', [req.participant.personId])
    return { documents: rows.map(docJson) }
  })

  app.get('/participant/documents/:id/file', { preHandler: app.requireParticipant }, async (req, reply) => {
    const row = await getDoc(req.params.id)
    if (!row || row.person_id !== req.participant.personId) return httpError(reply, 404, 'NOT_FOUND', 'No such document')
    return sendDoc(req, reply, row)
  })

  app.delete('/participant/documents/:id', { preHandler: app.requireParticipant }, async (req, reply) => {
    const row = await getDoc(req.params.id)
    if (!row || row.person_id !== req.participant.personId) return httpError(reply, 404, 'NOT_FOUND', 'No such document')
    await removeDoc(req, row)
    return reply.code(204).send()
  })
}
