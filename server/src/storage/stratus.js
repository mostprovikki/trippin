// server/src/storage/stratus.js — the ONLY file in the app that imports a Zoho SDK.
import catalyst from 'zcatalyst-sdk-node'
import { StorageNotFoundError } from './errors.js'

// `catalyst.initialize(req)` with the default `type: 'auto'` requires the Catalyst
// project id/key to be stamped on `req.headers` — that is the *Advanced I/O function*
// convention. An AppSail service receives ordinary internet traffic, so if the gateway
// does not stamp those headers, initialize() throws
// CatalystAppError('invalid_project_details', 'Failed to parse object') and every
// upload, download and delete becomes an opaque 500 on the first prod request.
//
// The env-driven path does not depend on the request at all. From the vendored SDK
// (node_modules/zcatalyst-sdk-node/lib/catalyst-namespace.js:59-63):
//
//     if (!isNonEmptyObject(options)) {
//         options = this.loadOptionsFromEnvVar();
//
// and loadOptionsFromEnvVar (same file, 137-152) reads process.env.CATALYST_CONFIG
// (constants.js:46 — `CATALYST_CONFIG_ENV_KEY: 'CATALYST_CONFIG'`), accepting either
// inline JSON or a path:
//
//     const contents = config.startsWith('{') ? config : readFileSync(config, 'utf8');
//
// So: prefer the env, and keep initialize(req) only as a fallback.
function appFromEnv() {
  // app() returns the already-registered default app; initializeApp() throws
  // 'duplicate_app' if called a second time, so ask before creating.
  try { return catalyst.app() } catch { /* 'no_app' — not initialised yet */ }
  try { return catalyst.initializeApp() } catch { return null } // CATALYST_CONFIG unset/unparseable
}

export function makeStratusStorage(cfg) {
  const envApp = appFromEnv()
  const appFor = (req) => {
    if (envApp) return envApp
    try {
      return catalyst.initialize(req)
    } catch (e) {
      throw new Error(
        'Stratus storage has no Catalyst app: CATALYST_CONFIG is unset or unparseable, and ' +
        `initializing from the request headers failed too (${e.message}). Set CATALYST_CONFIG ` +
        'on the AppSail service to inline JSON or a path to the project config.')
    }
  }
  const bucket = (req) => appFor(req).stratus().bucket(cfg.storage.stratusBucket)
  return {
    async put(req, key, readable) {
      const chunks = []
      for await (const c of readable) chunks.push(c) // ≤10MB (multipart limit) — buffering is fine
      const buf = Buffer.concat(chunks)
      // putObject is declared `Promise<boolean>` (lib/stratus/bucket.d.ts:222) and the
      // implementation ends `return resp.statusCode === 200` (bucket.js:614) — it can
      // resolve false rather than throwing. Discarding that would write the documents
      // row anyway, leaving a document that lists fine and 404s forever on download.
      const ok = await bucket(req).putObject(key, buf)
      if (ok !== true) throw new Error(`Stratus putObject failed for key ${key} (returned ${JSON.stringify(ok)})`)
      return { size: buf.length }
    },
    async getDownload(req, { key }) {
      // IStratusPresignedUrlRes only ever populates `signature` (verified against
      // lib/utils/pojo/stratus.d.ts) — there is no `.url` property to fall back to.
      //
      // KNOWN GAP: the caller passes filename and mime, and this driver cannot use
      // them. IStratusPreSignedUrlOptions (lib/utils/pojo/stratus.d.ts:150-157) accepts
      // ONLY expiryIn, activeFrom and versionId — there is no
      // response-content-disposition / response-content-type override anywhere in the
      // SDK. So a redirected download is named after the object key and its type is
      // guessed by the browser. Fixing that means streaming through the app instead of
      // redirecting, which is a product decision, not a code fix — left for the owner.
      // NOT-FOUND TRANSLATION: node_modules/zcatalyst-sdk-node/lib/utils/api-request.js's
      // _finalizeRequest() rejects with a plain {statusCode, code, message} object (not an
      // Error instance) whenever the Catalyst API returns a non-2xx, and explicitly branches
      // on `response.statusCode === 404` (line ~119) before calling rejectWithContext. A
      // missing object key surfaces as a 404 from the `/bucket/object/signed-url` call, so
      // `err.statusCode === 404` is the documented signal — verified by reading the SDK
      // source, NOT by hitting a real bucket. UNVERIFIED against a live Stratus bucket
      // (no Catalyst credentials in this environment) — confirm at deploy.
      try {
        const signed = await bucket(req).generatePreSignedUrl(key, 'GET', { expiryIn: 300 })
        return { url: signed.signature }
      } catch (e) {
        if (e && e.statusCode === 404) throw new StorageNotFoundError(key)
        throw e
      }
    },
    async remove(req, key) {
      try { await bucket(req).deleteObject(key) } catch { /* orphan object beats a failed API delete */ }
    }
  }
}
