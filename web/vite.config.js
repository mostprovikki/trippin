import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

// Repo root, not web/ (this file's own directory) — the committed .env lives
// one level up, and `vite`'s cwd is web/ when run via `npm run dev --workspace=web`.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export default ({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')
  // PORT_BASE is the single source of truth for this repo's port block (see
  // ~/.claude/docs/port-allocation.md): web = PORT_BASE, api = PORT_BASE + 1.
  const portBase = Number(env.PORT_BASE) || 43100
  const apiPort = Number(env.PORT) || portBase + 1

  return {
    plugins: [vue()],
    server: {
      port: portBase,
      // Fail fast instead of drifting to the next free port — a silent bump
      // once drove this app's gates against a different project's server.
      strictPort: true,
      proxy: { '/api': env.API_PROXY || `http://localhost:${apiPort}` }
    },
    test: { environment: 'happy-dom', setupFiles: ['./src/test-setup.js'] }
  }
}
