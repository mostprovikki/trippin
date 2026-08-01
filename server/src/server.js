import { buildApp } from './app.js'
import { makeDb } from './db.js'
import { config } from './config.js'
const app = await buildApp({ db: await makeDb() })
app.listen({ port: config.port, host: '0.0.0.0' })
