import { randomUUID } from 'node:crypto'
import { createWriteStream, createReadStream, statSync } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { join } from 'node:path'
import multipart from '@fastify/multipart'
import { config } from '../config.js'
import { httpError } from '../lib/errors.js'

const DOC_TYPES = ['passport', 'visa', 'national_id', 'driving_license', 'vaccination', 'other']
const DOC_FIELDS = ['id', 'person_id', 'doc_type', 'doc_number', 'expiry_date', 'original_name', 'mime_type', 'size_bytes', 'uploaded_at']

export default async function routes(app) {
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } })

  function getDoc(id) {
    return app.db.prepare('SELECT * FROM documents WHERE id = ?').get(id)
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
        const dir = join(config.uploadsDir, personId)
        await mkdir(dir, { recursive: true })
        const path = join(dir, id)
        await pipeline(part.file, createWriteStream(path)) // throws on fileSize limit → 413 via error handler
        file = { id, path, original_name: part.filename, mime_type: part.mimetype }
      } else fields[part.fieldname] = part.value
    }
    if (!file || !DOC_TYPES.includes(fields.doc_type)) {
      httpError(reply, 400, 'BAD_DOC_TYPE', 'file and valid doc_type required')
      return null
    }
    app.db.prepare(`INSERT INTO documents (id,person_id,doc_type,doc_number,expiry_date,file_path,original_name,mime_type,size_bytes)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(file.id, personId, fields.doc_type, fields.doc_number ?? null,
      fields.expiry_date ?? null, file.path, file.original_name, file.mime_type, statSync(file.path).size)
    return getDoc(file.id)
  }

  function sendFile(reply, row) {
    reply.header('content-disposition', `attachment; filename="${row.original_name.replace(/"/g, '')}"`)
    reply.type(row.mime_type)
    return reply.send(createReadStream(row.file_path))
  }

  async function removeDoc(row) {
    app.db.prepare('DELETE FROM documents WHERE id = ?').run(row.id)
    try { await unlink(row.file_path) } catch { /* ignore fs errors */ }
  }

  // --- organizer routes ---
  app.post('/people/:personId/documents', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const doc = await saveUpload(req, req.params.personId, reply)
    if (!doc) return
    return reply.code(201).send({ document: docJson(doc) })
  })

  app.get('/people/:personId/documents', { preHandler: app.requireOrganizer }, async (req) => {
    const documents = app.db.prepare('SELECT * FROM documents WHERE person_id = ? ORDER BY uploaded_at')
      .all(req.params.personId).map(docJson)
    return { documents }
  })

  app.get('/documents/:id/file', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const row = getDoc(req.params.id)
    if (!row) return httpError(reply, 404, 'NOT_FOUND', 'No such document')
    return sendFile(reply, row)
  })

  app.delete('/documents/:id', { preHandler: app.requireOrganizer }, async (req, reply) => {
    const row = getDoc(req.params.id)
    if (!row) return httpError(reply, 404, 'NOT_FOUND', 'No such document')
    await removeDoc(row)
    return reply.code(204).send()
  })

  // --- participant routes (own person only) ---
  app.post('/participant/documents', { preHandler: app.requireParticipant }, async (req, reply) => {
    const doc = await saveUpload(req, req.participant.personId, reply)
    if (!doc) return
    return reply.code(201).send({ document: docJson(doc) })
  })

  app.get('/participant/documents', { preHandler: app.requireParticipant }, async (req) => {
    const documents = app.db.prepare('SELECT * FROM documents WHERE person_id = ? ORDER BY uploaded_at')
      .all(req.participant.personId).map(docJson)
    return { documents }
  })

  app.get('/participant/documents/:id/file', { preHandler: app.requireParticipant }, async (req, reply) => {
    const row = getDoc(req.params.id)
    if (!row || row.person_id !== req.participant.personId) return httpError(reply, 404, 'NOT_FOUND', 'No such document')
    return sendFile(reply, row)
  })

  app.delete('/participant/documents/:id', { preHandler: app.requireParticipant }, async (req, reply) => {
    const row = getDoc(req.params.id)
    if (!row || row.person_id !== req.participant.personId) return httpError(reply, 404, 'NOT_FOUND', 'No such document')
    await removeDoc(row)
    return reply.code(204).send()
  })
}
