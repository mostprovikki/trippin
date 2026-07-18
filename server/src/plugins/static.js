import fp from 'fastify-plugin'
import fstatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '../../../web/dist')
export default fp(async function staticPlugin(app) {
  if (!existsSync(dist)) return   // dev/test: Vite serves the SPA
  await app.register(fstatic, { root: dist })
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api') ? reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No such route' } })
      : reply.sendFile('index.html'))
})
