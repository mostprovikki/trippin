import Fastify from 'fastify'
import autoload from '@fastify/autoload'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from './migrate.js'

const here = dirname(fileURLToPath(import.meta.url))

export async function buildApp({ db }) {
  runMigrations(db)
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })
  app.decorate('db', db)
  await app.register(autoload, { dir: join(here, 'plugins') })
  await app.register(autoload, { dir: join(here, 'routes'), options: { prefix: '/api' } })
  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode || 500
    reply.code(status).send({ error: { code: err.code || 'INTERNAL', message: status === 500 ? 'Internal error' : err.message } })
  })
  return app
}
