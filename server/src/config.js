import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

// Load the repo-root .env explicitly (not the cwd-relative default) — npm
// workspace scripts run with cwd set to server/, which is one level below
// root, so `dotenv/config`'s default cwd lookup silently finds nothing there
// and PORT_BASE never reaches the process. That silent miss is exactly the
// kind of drift PORT_BASE is meant to end.
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') })

// PORT_BASE is the single source of truth for this repo's port block (see
// ~/.claude/docs/port-allocation.md): api = PORT_BASE + 1. PORT remains a
// manual override for contexts outside this scheme (e.g. Docker Compose).
const portBase = Number(process.env.PORT_BASE) || 43100

export const config = {
  port: Number(process.env.PORT) || portBase + 1,
  dbPath: process.env.DB_PATH || './data/tripplanner.db',
  uploadsDir: process.env.UPLOADS_DIR || './data/uploads',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod',
  currency: process.env.DEFAULT_CURRENCY || 'INR',
  llm: {
    provider: process.env.LLM_PROVIDER || 'none',
    model: process.env.LLM_MODEL || '',
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || ''
  }
}
