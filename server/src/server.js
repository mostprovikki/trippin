import { buildApp } from './app.js'
import { getDb } from './db.js'
import { config } from './config.js'
const app = await buildApp({ db: getDb() })
app.listen({ port: config.port, host: '0.0.0.0' })
