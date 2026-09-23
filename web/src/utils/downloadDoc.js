// Shared by ParticipantDocs.vue and DocumentList.vue: both used to fetch a document
// with `Authorization: Bearer <token>` / cookie auth and read the response body
// directly. That breaks once STORAGE_DRIVER=stratus, because the download route
//302-redirects to a presigned URL — fetch cannot follow a cross-origin redirect
// and still read the body (CORS), and a plain navigation carries no auth header.
//
// OWNER DECISION (trip-planner-a17): keep Stratus signed URLs, option (c) — an
// authenticated JSON endpoint (`GET .../file-url`, see documents.routes.js
// sendDocUrl()) returns `{ url, direct }`; the client fetches `url` itself.
// `direct: true` means the url is a cross-origin presigned URL: fetch it with NO
// auth header — the signature in the URL IS the auth, and the bearer token must
// never ride along in a query string or to a third-party host. `direct: false`
// means same-origin + still needs the caller's own auth: reuse the same headers
// used for the file-url request.
//
// This also fixes the download filename: a presigned URL is named after the
// storage key (no extension, no original name), so both drivers are read as a
// blob and saved locally under the document's own `original_name`.

// Returns a Blob on success, or null if either fetch failed.
export async function downloadDocument(fileUrlPath, { headers = {} } = {}) {
  const metaRes = await fetch(fileUrlPath, { headers, credentials: 'same-origin' })
  if (!metaRes.ok) return null
  const { url, direct } = await metaRes.json()
  // 'same-origin' credentials mode never attaches cookies cross-origin anyway, so
  // it is safe (and matches web/src/api/client.js) to set it on both branches —
  // the direct branch just never has a same origin to match.
  const fileRes = direct ? await fetch(url) : await fetch(url, { headers, credentials: 'same-origin' })
  if (!fileRes.ok) return null
  return fileRes.blob()
}

export function triggerBlobDownload(blob, filename) {
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objUrl)
}
