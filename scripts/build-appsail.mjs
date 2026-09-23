#!/usr/bin/env node
// Assemble dist-appsail/: server (prod deps) + built SPA + app-config.json (secrets inlined — dir is git-ignored)
import { execSync } from 'node:child_process'
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'dist-appsail')
rmSync(out, { recursive: true, force: true }); mkdirSync(out)
execSync('npm run build', { cwd: root, stdio: 'inherit' }) // web/dist
for (const p of ['server/src', 'server/package.json', 'web/dist'])
  cpSync(join(root, p), join(out, p), { recursive: true, filter: (src) => !src.endsWith('.DS_Store') })
// DIVERGENCE from brief: this is an npm workspaces monorepo — deps hoist to the
// ROOT node_modules and only the root package-lock.json is real; server/package-lock.json
// does not exist. Copy the root lockfile in so `npm ci` has one to validate against
// (verified: despite the package.json name/deps differing from the root's, npm 11
// resolves and installs the full server dependency set from it correctly).
cpSync(join(root, 'package-lock.json'), join(out, 'server/package-lock.json'))
execSync('npm ci --omit=dev', { cwd: join(out, 'server'), stdio: 'inherit' })
const envPath = join(root, 'server/.env.appsail')
if (!existsSync(envPath))
  throw new Error(`${envPath} is missing — create it first (see server/.env.appsail.example if present, or copy server/.env and fill in real secrets)`)
const env = Object.fromEntries(readFileSync(envPath, 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
// The bundle below inlines these values verbatim. A missing JWT_SECRET line would ship
// the public dev default as the session signing key — src/config.js refuses to boot on
// that, but failing here is cheaper than failing after a deploy.
if (!env.JWT_SECRET || env.JWT_SECRET === 'dev-secret-do-not-use-in-prod')
  throw new Error('server/.env.appsail has no real JWT_SECRET — refusing to build a bundle with a public signing key')
writeFileSync(join(out, 'app-config.json'), JSON.stringify({
  command: 'node server/src/server.js', build_path: '.', stack: 'node22',
  env_variables: env, memory: 256, scripts: {}
}, null, 2))
console.log('dist-appsail/ ready')
